import { DAY_MS, DEDUPE_MS, SESSION_GAP_MS } from './config.js';
import * as store from './store.js';
import {
  STAGES, assignmentFromEvent, assignmentFromHit, attribution, basePrid, classifyPage, deviceOf, eventMeaning,
  gaKey, hasCampaign, hostScope, isBot, onboardingStep, parseUrl, pridFromUrl, safeUrl,
} from './taxonomy.js';

const uniq = (a) => [...new Set(a.filter(Boolean))];
const realTicket = (t) => { const s = String(t ?? ''); return /^\d{4,}$/.test(s) ? s : ''; };

// ---------- identity ----------
// Person = browser (GA client id). Two browsers are one person only when the payment registry ties both to
// the same single account UUID. A browser that used several accounts stays one journey, flagged shared.
export function resolveIdentity(uuidsByGa) {
  const gasByUuid = new Map();
  for (const [ga, uuids] of uuidsByGa) if (uuids.size === 1) { const u = [...uuids][0]; gasByUuid.set(u, [...(gasByUuid.get(u) || []), ga]); }
  const canon = new Map();
  for (const gas of gasByUuid.values()) { const [head] = [...gas].sort(); gas.forEach((x) => canon.set(x, head)); }
  return (ga) => canon.get(ga) || ga;
}

// ---------- payments ----------
// Source of truth = gateway transaction log. One payment request (prid) counts once, whatever its retries.
export function reducePayments(txns, registry, native) {
  const reg = new Map(registry.map((r) => [String(r.prid).toLowerCase(), r]));
  const nat = new Map();
  for (const n of native) if (!nat.has(basePrid(n.requestId))) nat.set(basePrid(n.requestId), n);
  const byPrid = new Map();
  for (const t of txns) { const id = basePrid(t.requestId); byPrid.set(id, [...(byPrid.get(id) || []), t]); }
  return [...byPrid].map(([prid, rows]) => {
    rows.sort((a, b) => a._t - b._t);
    const ok = rows.find((r) => r.status === 'success');
    const failed = rows.filter((r) => r.status === 'failed');
    const ref = ok || failed[failed.length - 1] || rows[rows.length - 1];
    const r = reg.get(prid);
    const n = nat.get(prid);
    let amount = null; let amountFrom = '';
    if (ok && n && Number.isFinite(Number(n.amount))) {
      amount = (n.gateway || ok.gateway) === 'razorpay' ? Number(n.amount) / 100 : Number(n.amount); // Razorpay logs paise
      amountFrom = 'gateway';
    } else if (r?.priceBreakups?.payableAmount != null) { amount = Number(r.priceBreakups.payableAmount); amountFrom = 'request'; }
    const registryTicket = realTicket(r?.metadata?.ticketId || r?.ticketId);
    // landing context saved on the lead by the website (docs/tracking-spec.md); absent on older data
    const saved = r?.metadata?.landing?.url ? { url: String(r.metadata.landing.url), referrer: String(r.metadata.landing.referrer || ''), ts: Number(r.metadata.landing.ts) || 0 } : null;
    return {
      prid, status: ok ? 'success' : failed.length ? 'failed' : 'pending', ts: ref._t, attempts: rows.filter((x) => x.status === 'initiated').length,
      gateway: ref.gateway || '', ticketId: realTicket(ref.ticketId) || registryTicket,
      uuid: r?.metadata?.uuid || r?.uuid || '', serviceId: String(r?.metadata?.serviceId || r?.serviceId || ''),
      service: r?.content?.title || r?.title || '', amount, amountFrom, txnId: ok ? String(n?.mihpayid || n?.id || n?.txnid || '') : '', saved,
    };
  });
}

// Payment -> person. Exact payment id in a tracked URL first, then a ticket seen in exactly one person's rows.
// Anything else is left unattributed rather than guessed.
export function matchPayment(p, hitsByPrid, hitsByTicket, canon) {
  const people = (hits) => uniq(hits.map((h) => canon(h.gk)));
  const byId = hitsByPrid.get(p.prid) || [];
  const done = people(byId.filter((h) => h.navigation === 'payment-done'));
  if (done.length === 1) return { person: done[0], match: 'payment id on success page' };
  const onId = people(byId);
  if (onId.length === 1) return { person: onId[0], match: 'payment id on checkout' };
  const tk = people(p.ticketId ? hitsByTicket.get(p.ticketId) || [] : []);
  if (onId.length === 0 && tk.length === 1) return { person: tk[0], match: 'ticket id' };
  if (onId.length > 1 || tk.length > 1) return { person: '', match: '', reason: 'several browsers used this payment or ticket' };
  return { person: '', match: '', reason: 'no tracking row carries this payment or ticket' };
}

// ---------- hits ----------
export function prepHits(rows) {
  const seen = new Map();
  const out = [];
  for (const r of [...rows].sort((a, b) => a._t - b._t)) {
    const gk = gaKey(r.ga);
    if (!gk || !r.url) continue;
    const page = classifyPage(r.url);
    const nav = r.navigation || '';
    const isView = !['cart'].includes(nav) && r.data?.event !== 'onboarding_experiment_assigned';
    const k = `${gk}|${page.key}|${['ingress', 'navigate'].includes(nav) ? 'view' : nav}`;
    // checkout page view + its "checkout" flag are different facts; a double page load is not.
    const dup = isView && seen.has(k) && r._t - seen.get(k) < DEDUPE_MS;
    if (isView) seen.set(k, r._t);
    out.push({ ...r, gk, page, dup, isView: isView && !dup && ['ingress', 'navigate'].includes(nav), prid: pridFromUrl(r.url), scope: hostScope(r.url), bot: isBot(r.userAgent), ticket: realTicket(r.ticketId), navigation: nav, entry: nav === 'ingress', sid: r.sessionId ? String(r.sessionId) : '' });
  }
  return out;
}

export function sessions(hits) {
  const out = [];
  for (const h of hits) {
    const last = out[out.length - 1];
    if (!last || h._t - last.end > SESSION_GAP_MS) out.push({ start: h._t, end: h._t, hits: 1 });
    else { last.end = h._t; last.hits += 1; }
  }
  return out;
}

// client clocks drift and queued events arrive late; trust eventTime only when it is sane
const eventTs = (e) => { const t = Number(e.eventTime); return t && t <= e._t + 60e3 && e._t - t < DAY_MS ? t : e._t; };

// ---------- landing visits ----------
// Mixpanel credits each conversion, not the person: a funnel attempt starts at a landing page view and the
// payment belongs to the attempt that produced it. Here an attempt = one landing page within one visit.
// A visit ends after 30 min without activity, when the tracked session id changes, or when a new campaign
// or outside referrer arrives. Within a visit a lead created on another landing page starts a new attempt.
export const SLACK = 60e3;
export const LOOKBACK_MS = 30 * DAY_MS;
export const STAGE_ORDER = ['paid', 'checkout', 'complete', 'progress', 'start', 'landing'];
export const NO_LANDING = '(no landing page)';
const isLeadRow = (h) => h.navigation === 'cart' || Boolean(h.ticket && h.page.kind === 'landing');
const sameAttr = (a, b) => Boolean(a && b) && a.channel === b.channel && a.source === b.source && a.medium === b.medium && a.campaign === b.campaign;

export function splitVisits(hits) {
  const out = [];
  for (const h of hits) {
    const cur = out[out.length - 1];
    const prev = cur?.hits[cur.hits.length - 1];
    const a = h.entry ? attribution(h) : null;
    const fresh = !cur || h._t - prev._t > SESSION_GAP_MS || Boolean(h.sid && cur.sid && h.sid !== cur.sid) || Boolean(a && hasCampaign(a) && !sameAttr(a, cur.attr));
    if (fresh) out.push({ i: out.length, sid: h.sid || '', start: h._t, hits: [h], attr: attribution(h) });
    else { cur.hits.push(h); cur.sid ||= h.sid || ''; }
  }
  return out;
}

export function buildAttempts({ hits, marks = {}, payments = [], from = 0, prior = [] }) {
  const visits = splitVisits(hits);
  // Mixpanel last touch: a direct or unknown visit is not a touchpoint, so it carries the last named one (30 days)
  const named = [...prior, ...hits].filter((h) => h.entry).map((h) => ({ t: h._t, a: attribution(h) })).filter((x) => hasCampaign(x.a)).sort((a, b) => a.t - b.t);
  const touchOf = (v) => {
    if (hasCampaign(v.attr)) return v.attr;
    const back = named.filter((x) => x.t < v.start && v.start - x.t <= LOOKBACK_MS).pop();
    return back ? { ...back.a, carried: true } : v.attr;
  };
  const attempts = []; const byTicket = new Map(); const byHit = new Map();
  let cur = null;
  const open = (h, v) => { cur = { i: attempts.length, page: h.page.key, url: safeUrl(h.url), ts: h._t, hitId: h._id, attr: touchOf(v), visit: v.i, tickets: [], marks: {}, payments: [] }; attempts.push(cur); return cur; };
  for (const v of visits) {
    let mine = null;
    for (const h of v.hits) {
      if (h.page.kind === 'landing') {
        if (!mine) mine = open(h, v);
        else if (isLeadRow(h) && h.page.key !== mine.page) {
          const view = v.hits.filter((x) => x._t <= h._t && x._t >= mine.ts && x.page.key === h.page.key && x.isView).pop();
          mine = open(view || h, v);
        }
      }
      if (cur) byHit.set(h._id, cur); // a visit without a landing page continues the previous attempt
      if (h.ticket && cur && !byTicket.has(h.ticket)) { byTicket.set(h.ticket, cur); cur.tickets.push(h.ticket); }
    }
  }
  const at = (t) => { let r = null; for (const a of attempts) if (a.ts <= t + SLACK && (!r || a.ts >= r.ts)) r = a; return r; };

  for (const [k, list] of Object.entries(marks)) {
    if (k === 'landing' || k === 'paid') continue;
    for (const m of list) { const a = (m.tk && byTicket.get(m.tk)) || at(m.t); if (a) (a.marks[k] ||= []).push(m); }
  }

  // payment -> landing visit: saved on the lead, then the visit that created its ticket, then the visit of its
  // checkout, then the last landing within 30 days. Each step is recorded so a reader can judge it.
  for (const p of [...payments].sort((a, b) => a.ts - b.ts)) {
    let a = null; let via = '';
    if (p.ticketId && byTicket.has(p.ticketId)) { a = byTicket.get(p.ticketId); via = 'lead page'; }
    if (!a) { const c = hits.find((h) => p.prid && h.prid === p.prid && byHit.has(h._id)); if (c) { a = byHit.get(c._id); via = 'checkout visit'; } }
    if (!a) { const b = at(p.ts); if (b && p.ts - b.ts <= LOOKBACK_MS) { a = b; via = 'last landing (30 days)'; } }
    if (p.saved) {
      const pg = classifyPage(p.saved.url);
      const sa = attribution({ url: p.saved.url, referrer: p.saved.referrer, navigation: 'ingress' });
      if (pg.kind === 'landing' && (!a || a.page !== pg.key)) {
        // the website's own record wins over inference: give this payment (and its ticket's stages) their own attempt
        const own = { i: attempts.length, page: pg.key, url: safeUrl(p.saved.url), ts: p.saved.ts || a?.ts || p.ts, hitId: '', attr: hasCampaign(sa) ? sa : touchOf({ attr: sa, start: p.saved.ts || p.ts }), visit: -1, tickets: p.ticketId ? [p.ticketId] : [], marks: {}, payments: [], saved: true };
        if (a && p.ticketId) for (const [k, l] of Object.entries(a.marks)) { const mv = l.filter((m) => m.tk === p.ticketId); if (mv.length) { a.marks[k] = l.filter((m) => m.tk !== p.ticketId); own.marks[k] = mv; } }
        attempts.push(own); a = own;
      } else if (a && hasCampaign(sa)) a.attr = sa;
      if (a) via = 'saved on lead';
    }
    p.landing = a ? { key: a.page, url: a.url, attr: a.attr, ts: a.ts, via } : null;
    if (!a) continue;
    a.payments.push(p);
    if (p.status === 'success') (a.marks.paid ||= []).push({ t: p.ts, svc: p.serviceId ? String(p.serviceId) : '', tk: p.ticketId || '' });
  }

  attempts.sort((x, y) => x.ts - y.ts).forEach((a, i) => { a.i = i; });
  for (const a of attempts) {
    a.inRange = a.ts >= from;
    a.stage = a.inRange ? { landing: a.ts } : {};
    for (const [k, l] of Object.entries(a.marks)) { l.sort((x, y) => x.t - y.t); if (l.length) a.stage[k] = (l.find((m) => m.t >= a.ts - SLACK) || l[0]).t; }
    a.lastStage = STAGE_ORDER.find((k) => a.stage[k] != null) || 'landing';
    a.revenue = a.payments.filter((p) => p.status === 'success').reduce((s, p) => s + (p.amount || 0), 0);
    a.active = a.inRange || a.payments.length > 0 || Object.values(a.marks).some((l) => l.some((m) => m.t >= from));
  }
  return attempts;
}

// The attempt a person is shown under: the one behind their first payment, else the furthest one (latest on a tie).
export function pickConverting(attempts) {
  const paid = attempts.filter((a) => a.payments.some((p) => p.status === 'success'));
  const first = (a) => Math.min(...a.payments.filter((p) => p.status === 'success').map((p) => p.ts));
  if (paid.length) return paid.sort((x, y) => first(x) - first(y))[0];
  const live = attempts.filter((a) => a.active);
  const rank = (a) => STAGE_ORDER.length - STAGE_ORDER.indexOf(a.lastStage);
  return (live.length ? live : attempts).reduce((best, a) => (!best || rank(a) >= rank(best) ? a : best), null);
}

// ---------- one person ----------
export function buildUser(id, { hits, events = [], payments = [], firstEver = null, priorAssign = [], uuids = [], from = 0 }) {
  hits = [...hits].sort((a, b) => a._t - b._t);
  const marketing = hits.filter((h) => h.page.kind !== 'app' && h.page.kind !== 'other');
  const landings = hits.filter((h) => h.page.kind === 'landing');
  const entries = landings.filter((h) => h.entry);
  const firstHit = firstEver && firstEver._t < (marketing[0]?._t ?? Infinity) ? firstEver : landings[0] || marketing[0] || hits[0] || firstEver;
  const firstTouch = firstHit ? attribution(firstHit) : attribution({});
  const ev = events.map((e) => ({ ...e, ts: eventTs(e), m: eventMeaning(e) })).sort((a, b) => a.ts - b.ts);

  // last touch = last entry with a known campaign/referrer before payment; a direct return does not erase it
  const paidOk = payments.filter((p) => p.status === 'success').sort((a, b) => a.ts - b.ts);
  const cut = paidOk[0]?.ts ?? Infinity;
  const touches = entries.filter((h) => h._t <= cut).map((h) => ({ h, a: attribution(h) }));
  const lastNamed = [...touches].reverse().find((t) => hasCampaign(t.a)) || (hasCampaign(firstTouch) ? { h: firstHit, a: firstTouch } : touches[touches.length - 1]);
  const lastTouch = lastNamed?.a || firstTouch;
  const lastLanding = lastNamed?.h || firstHit;

  // experiments: the first recorded assignment wins and is never overwritten
  const raw = [
    ...priorAssign,
    ...hits.map((h) => { const a = assignmentFromHit(h); return a && { ...a, ts: h._t, pageKey: h.page.kind === 'landing' ? h.page.key : '' }; }),
    ...ev.map((e) => { const a = assignmentFromEvent(e); const pg = classifyPage(e.url || e.eventProperties?.pageUrl || ''); return a && { ...a, ts: e.ts, pageKey: pg.kind === 'landing' ? pg.key : '' }; }),
  ].filter(Boolean).sort((a, b) => a.ts - b.ts);
  const assignments = [];
  for (const a of raw) {
    if (!a.experiment) continue;
    const cur = assignments.find((x) => x.experiment === a.experiment);
    if (!cur) assignments.push({ ...a, conflict: [], services: uniq([a.service]), tickets: uniq([a.ticket]) });
    else {
      if (cur.variant !== a.variant && !cur.conflict.includes(a.variant)) cur.conflict.push(a.variant);
      cur.services = uniq([...cur.services, a.service]); cur.tickets = uniq([...cur.tickets, a.ticket]);
      cur.label ||= a.label; cur.page ||= a.page; cur.landingUrl ||= a.landingUrl; cur.pageKey ||= a.pageKey;
    }
  }
  // a bare ?onboarding_design=vN has no experiment name; keep it only when nothing named covers that variant
  const bare = raw.find((a) => !a.experiment);
  if (bare && !assignments.some((x) => x.variant === bare.variant || x.conflict.includes(bare.variant))) {
    const slug = bare.pageKey || landings[0]?.page.key || 'unknown page';
    assignments.push({ ...bare, experiment: `(unnamed) ${slug}`, conflict: [], services: [], tickets: [] });
  }

  // every occurrence of each stage, with the service when the row names one
  const marks = {};
  // tk = the ticket the row names: it ties a lead, checkout or payment to the landing visit that created it
  const set = (k, t, svc = '', tk = '') => { if (t != null) (marks[k] ||= []).push({ t, svc: svc ? String(svc) : '', tk: realTicket(tk) }); };
  const evTicket = (e) => e.ticketId || e.eventProperties?.ticketId;
  const steps = new Map();
  for (const h of hits) {
    if (h.page.kind === 'landing' && h._t >= from) set('landing', h._t);
    if (isLeadRow(h)) set('start', h._t, h.serviceId, h.ticket);
    if (h.page.kind === 'onboarding') { set('start', h._t); set('onb', h._t); const s = onboardingStep(h.page.path); if (!steps.has(s)) steps.set(s, h._t); }
    if (h.data?.event === 'onboarding_page_visit') { set('start', h._t); set('onb', h._t); }
    if (h.page.kind === 'checkout' || h.navigation === 'checkout') set('checkout', h._t, h.serviceId, h.ticket);
  }
  for (const e of ev) {
    if (!e.m) continue;
    if (e.m.lead) set('start', e.ts, e.serviceId, evTicket(e));
    if (e.m.start) { set('start', e.ts, e.serviceId); set('onb', e.ts); const s = e.eventProperties?.step != null ? `step-${e.eventProperties.step}` : e.eventName; if (!steps.has(s)) steps.set(s, e.ts); }
    if (e.m.progress) { set('start', e.ts, e.serviceId); set('onb', e.ts); set('progress', e.ts); if (!steps.has(e.eventName)) steps.set(e.eventName, e.ts); }
    if (e.m.complete) set('complete', e.ts, e.serviceId, evTicket(e));
  }
  const ordered = [...steps].sort((a, b) => a[1] - b[1]);
  if (ordered.length > 1) set('progress', ordered[1][1]);
  const onb = Math.min(...(marks.onb || []).map((m) => m.t));
  for (const c of marks.checkout || []) if (c.t > onb) set('complete', c.t, c.svc, c.tk);
  if (assignments[0]) set('assigned', assignments[0].ts);
  for (const p of paidOk) set('paid', p.ts, p.serviceId, p.ticketId);
  delete marks.onb;
  for (const k of Object.keys(marks)) marks[k].sort((a, b) => a.t - b.t);
  // A returning visitor can check out, come back and check out again: prefer the first time at/after landing.
  const stage = {};
  if (marks.landing) stage.landing = marks.landing[0].t;
  for (const [k, l] of Object.entries(marks)) if (k !== 'landing') stage[k] = (l.find((m) => stage.landing != null && m.t >= stage.landing - 60e3) || l[0]).t;

  const lastStage = STAGE_ORDER.find((k) => stage[k] != null) || 'other';

  // landing visits (Mixpanel-style funnel attempts) and the page each payment came from
  const attempts = buildAttempts({ hits, marks, payments, from, prior: firstEver ? [firstEver] : [] });
  const conv = pickConverting(attempts);
  const timeline = [...hits.map((h) => h._t), ...ev.map((e) => e.ts)];
  const lastTs = Math.max(0, ...timeline, ...payments.map((p) => p.ts));
  const lastHit = hits[hits.length - 1];
  const lastEv = ev[ev.length - 1];
  const anyPay = paidOk.length ? 'success' : payments.some((p) => p.status === 'failed') ? 'failed' : payments.length ? 'pending' : stage.checkout != null ? 'not attempted' : 'none';
  return {
    id, gas: uniq(hits.map((h) => h.gk)), uuids: uniq([...uuids, ...payments.map((p) => p.uuid)]),
    firstTouch, lastTouch,
    firstLanding: firstHit?.page?.key || '', firstLandingUrl: safeUrl(firstHit?.url), firstTs: firstHit?._t || 0, firstIsLanding: firstHit?.page?.kind === 'landing',
    lastLandingKey: lastLanding?.page?.kind === 'landing' ? lastLanding.page.key : '',
    attempts, convertingLanding: conv?.page || '', convertingLandingUrl: conv?.url || '', convertingTouch: conv?.attr || lastTouch, convertingTs: conv?.ts || 0,
    returning: Boolean(firstEver && from && firstEver._t < from),
    assignments, stage, marks, steps: ordered.map(([s, ts]) => ({ s, ts })), lastStage, lastPage: lastHit?.page?.key || '', lastTs,
    exitConfirmed: lastStage !== 'paid' && Boolean(lastEv?.m?.exit && lastEv.ts >= (lastHit?._t || 0)),
    sessions: sessions(hits).length, pageViews: hits.filter((h) => h.isView && h._t >= from).length, inRange: hits.some((h) => h._t >= from),
    landingViews: hits.filter((h) => h.isView && h._t >= from && h.page.kind === 'landing'),
    tickets: uniq([...hits.map((h) => h.ticket), ...payments.map((p) => p.ticketId)]), prids: uniq([...hits.map((h) => h.prid), ...payments.map((p) => p.prid)]),
    services: uniq([...hits.map((h) => (h.serviceId ? String(h.serviceId) : '')), ...payments.map((p) => p.serviceId)]),
    payments, revenue: paidOk.reduce((s, p) => s + (p.amount || 0), 0), payStatus: anyPay,
    device: deviceOf(lastHit?.userAgent), bot: hits.length > 0 && hits.every((h) => h.bot),
    isVisitor: marketing.length > 0, hits, events: ev,
  };
}

// ---------- dataset ----------
const g = globalThis;
g.__datasets ||= new Map();

export function getDataset({ from, to, env = 'qe', bots = 'exclude' }) {
  const key = `${from}:${to}:${env}:${bots}`;
  const hit = g.__datasets.get(key);
  if (hit && Date.now() - hit.at < 60e3) return hit.p;
  const p = build({ from, to, env, bots });
  g.__datasets.set(key, { at: Date.now(), p });
  p.catch(() => g.__datasets.delete(key));
  if (g.__datasets.size > 12) g.__datasets.delete(g.__datasets.keys().next().value);
  return p;
}

const groupBy = (arr, f) => { const m = new Map(); for (const x of arr) { const k = f(x); if (!k) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };

async function build({ from, to, env, bots }) {
  const [utsRaw, evRaw, txnRaw] = await Promise.all([store.loadUts(from, to), store.loadEvents(from, to), store.loadTxns(from, to)]);
  const inScope = (h) => (env === 'all' || h.scope === 'qe') && (bots === 'include' || !h.bot);
  const allHits = prepHits(utsRaw);
  const hits = allHits.filter(inScope);

  // payments first: they bring in the registry (UUID, service) and the tickets to match on
  const txnPrids = uniq(txnRaw.map((t) => basePrid(t.requestId)));
  const prids = uniq([...txnPrids, ...hits.map((h) => h.prid)]);
  const successIds = uniq(txnRaw.filter((t) => t.status === 'success').map((t) => basePrid(t.requestId)));
  const [registry, native] = await Promise.all([store.registryByPrid(prids), store.nativeSuccess(successIds)]);
  const payments = reducePayments(txnRaw, registry, native);
  const tickets = uniq(payments.map((p) => p.ticketId));
  const ticketHits = prepHits(await store.hitsByTicket(tickets));
  const payHits = [...new Map([...allHits, ...ticketHits].map((h) => [h._id, h])).values()];

  const regByPrid = new Map(registry.map((r) => [String(r.prid).toLowerCase(), r]));
  const uuidsByGa = new Map();
  for (const h of payHits) {
    const u = regByPrid.get(h.prid)?.metadata?.uuid;
    if (u) uuidsByGa.set(h.gk, (uuidsByGa.get(h.gk) || new Set()).add(u));
  }
  const canon = resolveIdentity(uuidsByGa);
  const hp = groupBy(payHits, (h) => h.prid);
  const ht = groupBy(payHits, (h) => h.ticket);
  const hitsBy = groupBy(hits, (h) => canon(h.gk));
  for (const p of payments) {
    Object.assign(p, matchPayment(p, hp, ht, canon));
    // a payer whose browser rows sit outside the range still belongs to the population
    if (p.person && p.status === 'success' && !hitsBy.has(p.person)) {
      const own = ticketHits.filter((h) => canon(h.gk) === p.person && inScope(h));
      if (own.length) hitsBy.set(p.person, own); else { p.reason = 'tracked only outside the selected host scope (e.g. localhost)'; p.person = ''; p.match = ''; }
    } else if (p.person && !hitsBy.has(p.person)) { p.reason = 'tracked only outside the selected range or host scope'; p.person = ''; p.match = ''; }
  }
  const payBy = groupBy(payments, (p) => p.person);
  const gas = uniq([...hitsBy.values()].flatMap((l) => l.map((h) => h.gk)));
  const [early, earlyAssign, earlyData] = await Promise.all([store.earliestHits(gas, from), store.earlierAssignments(gas, from), store.earlierDataHits(gas, from)]);
  const earlyPrepped = prepHits(early).filter((h) => inScope(h) && h.page.kind !== 'app' && h.page.kind !== 'other');
  const firstBy = new Map();
  for (const h of earlyPrepped) { const k = canon(h.gk); if (!firstBy.has(k) || h._t < firstBy.get(k)._t) firstBy.set(k, h); }
  const priorBy = new Map();
  const addPrior = (k, a) => { if (a) priorBy.set(k, [...(priorBy.get(k) || []), a]); };
  for (const e of earlyAssign) { const a = assignmentFromEvent(e); if (a) addPrior(canon(gaKey(e._ga)), { ...a, ts: eventTs(e), pageKey: '' }); }
  for (const h of prepHits(earlyData)) { const a = assignmentFromHit(h); if (a) addPrior(canon(h.gk), { ...a, ts: h._t, pageKey: '' }); }
  const evScoped = evRaw.filter((e) => { const s = hostScope(e.url || e.eventProperties?.pageUrl || ''); return env === 'all' || s !== 'other'; });
  const evBy = groupBy(evScoped, (e) => canon(gaKey(e._ga)));

  const users = [...hitsBy].map(([id, h]) => buildUser(id, {
    hits: h, events: evBy.get(id) || [], payments: payBy.get(id) || [], firstEver: firstBy.get(id) || null, priorAssign: priorBy.get(id) || [], from,
    uuids: uniq(uniq(h.map((x) => x.gk)).flatMap((x) => [...(uuidsByGa.get(x) || [])])),
  })).filter((u) => u.isVisitor);
  const ids = new Set(users.map((u) => u.id));
  for (const p of payments) if (p.person && !ids.has(p.person)) { p.reason = 'person has only customer-app activity'; p.person = ''; p.match = ''; }
  return {
    from, to, users, payments,
    audit: {
      utsRows: utsRaw.length, utsInScope: hits.length, botRows: allHits.filter((h) => h.bot).length, otherHostRows: allHits.filter((h) => h.scope !== 'qe').length,
      duplicateViews: hits.filter((h) => h.dup).length, landingUrlFilled: utsRaw.filter((r) => r.landingUrl).length, dataRows: utsRaw.filter((r) => r.data?.onboardingDesign).length,
      events: evRaw.length, txnRows: txnRaw.length, mergedBrowsers: gas.length - new Set(gas.map(canon)).size, sharedBrowsers: [...uuidsByGa.values()].filter((s) => s.size > 1).length,
    },
  };
}

// ---------- single person, full history (its own query path) ----------
export async function getUserDetail(id) {
  let gas = [id];
  const first = prepHits(await store.hitsByGa(gas));
  if (!first.length) return null;
  const reg0 = await store.registryByPrid(uniq(first.map((h) => h.prid)));
  const own = uniq(reg0.map((r) => r.metadata?.uuid));
  let hits = first;
  if (own.length === 1) {
    // bring in other browsers of the same account, only if they used that account alone
    const regs = await store.registryByUuid(own);
    const peers = prepHits(await store.hitsByTicket(uniq(regs.map((r) => realTicket(r.metadata?.ticketId)))));
    const cand = uniq(peers.filter((h) => regs.some((r) => String(r.prid).toLowerCase() === h.prid)).map((h) => h.gk)).filter((x) => x !== id);
    const keep = [];
    for (const c of cand.slice(0, 10)) {
      const ch = prepHits(await store.hitsByGa([c]));
      const cr = uniq((await store.registryByPrid(uniq(ch.map((h) => h.prid)))).map((r) => r.metadata?.uuid));
      if (cr.length === 1 && cr[0] === own[0]) { keep.push(c); hits = hits.concat(ch); }
    }
    gas = [id, ...keep];
  }
  const prids = uniq(hits.map((h) => h.prid));
  const tickets = uniq(hits.map((h) => h.ticket));
  const [events, txA, txB] = await Promise.all([store.eventsByGa(gas), store.txnsByPrid(prids), store.txnsByTicket(tickets)]);
  const txns = [...new Map([...txA, ...txB].map((t) => [t._id, t])).values()];
  const allPrids = uniq([...prids, ...txns.map((t) => basePrid(t.requestId))]);
  const [registry, native, ticketHits] = await Promise.all([store.registryByPrid(allPrids), store.nativeSuccess(allPrids), store.hitsByTicket(uniq(txns.map((t) => realTicket(t.ticketId))))]);
  // the ticket can also have been touched by someone else: keep only payments that resolve to this person
  const canon = (x) => (gas.includes(x) ? id : x);
  const pool = [...new Map([...hits, ...prepHits(ticketHits)].map((h) => [h._id, h])).values()];
  const hp = groupBy(pool, (h) => h.prid); const ht = groupBy(pool, (h) => h.ticket);
  const payments = reducePayments(txns, registry, native).map((p) => ({ ...p, ...matchPayment(p, hp, ht, canon) })).filter((p) => p.person === id);
  return buildUser(id, { hits, events, payments, uuids: uniq(registry.filter((r) => prids.includes(String(r.prid).toLowerCase())).map((r) => r.metadata?.uuid)) });
}

export { STAGES, parseUrl };
