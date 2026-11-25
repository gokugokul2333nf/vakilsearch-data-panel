import { DAY_MS, IST_MS } from './config.js';
import { STAGES } from './taxonomy.js';
import { dayStart } from './store.js';

const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
export const istDate = (ts) => new Date(ts + IST_MS).toISOString().slice(0, 10);

export const touch = (u, model) => (model === 'last' ? u.lastTouch : u.firstTouch);
// people whose first recorded page was checkout or onboarding did not land on a landing page
export const landingOf = (u, model) => (model === 'last' ? u.lastLandingKey : u.firstIsLanding && u.firstLanding) || '(no landing page)';
export const okPays = (u) => u.payments.filter((p) => p.status === 'success');

// ---------- filters ----------
export function applyFilters(users, f) {
  return users.filter((u) => {
    const t = touch(u, f.model);
    if (f.source && t.source !== f.source) return false;
    if (f.medium && t.medium !== f.medium) return false;
    if (f.channel && t.channel !== f.channel) return false;
    if (f.campaign && (t.campaign || '(none)') !== f.campaign) return false;
    if (f.term && (t.term || '(none)') !== f.term) return false;
    if (f.content && (t.content || '(none)') !== f.content) return false;
    if (f.landing && landingOf(u, f.model) !== f.landing) return false;
    if (f.service && !u.services.includes(f.service)) return false;
    if (f.device && u.device !== f.device) return false;
    if (f.experiment && !u.assignments.some((a) => a.experiment === f.experiment && (!f.variant || a.variant === f.variant))) return false;
    if (f.stage && u.lastStage !== f.stage) return false;
    if (f.reached && !reached(u, f.reached)) return false;
    if (f.pay && u.payStatus !== f.pay) return false;
    return true;
  });
}
export const isFiltered = (f) => ['source', 'medium', 'channel', 'campaign', 'term', 'content', 'landing', 'service', 'device', 'experiment', 'stage', 'reached', 'pay'].some((k) => f[k]);

// ---------- funnel ----------
// Closed cohort: people who saw a landing page in the range; a stage counts only at or after that first landing
// (assignment may come from an earlier visit). Everyone is counted once per stage.
const SLACK = 60e3;
export const reached = (u, s) => {
  if (u.stage.landing == null) return false;
  if (s === 'landing') return true;
  if (s === 'assigned') return u.assignments.length > 0;
  return u.stage[s] != null && u.stage[s] >= u.stage.landing - SLACK;
};

export function funnel(users, { assigned } = {}) {
  const base = users.filter((u) => u.stage.landing != null);
  const top = base.length;
  let prevCore = null;
  return STAGES.map((s) => {
    const n = s.id === 'assigned' && assigned ? base.filter((u) => u.assignments.some((a) => a.experiment === assigned)).length : base.filter((u) => reached(u, s.id)).length;
    // every stage is compared with the previous core stage; optional stages never become the reference
    const ref = prevCore;
    const row = { id: s.id, label: s.label, core: s.core, users: n, ofTop: pct(n, top), prevLabel: ref?.label || null, fromPrev: ref ? pct(n, ref.users) : null, drop: ref ? Math.max(0, ref.users - n) : null, dropPct: ref && ref.users ? pct(Math.max(0, ref.users - n), ref.users) : null };
    if (s.core) prevCore = row;
    return row;
  });
}

// ---------- rollup used by every table ----------
export function rollup(users) {
  const base = users.filter((u) => u.stage.landing != null);
  const c = (s) => base.filter((u) => reached(u, s)).length;
  const pays = users.flatMap(okPays);
  const visitors = users.filter((u) => u.inRange).length;
  const landed = base.length;
  const payers = users.filter((u) => okPays(u).length).length;
  const funnelPayers = c('paid');
  return {
    visitors, landed, sessions: users.reduce((s, u) => s + u.sessions, 0), onboarding: c('start'), completed: c('complete'), checkout: c('checkout'),
    payers, funnelPayers, payments: pays.length, revenue: Math.round(pays.reduce((s, p) => s + (p.amount || 0), 0)),
    onboardingRate: pct(c('start'), landed), checkoutRate: pct(c('checkout'), landed), conversion: pct(funnelPayers, landed),
    dropRate: landed ? pct(landed - funnelPayers, landed) : null,
  };
}

export function groupRollup(users, keyFn, extra = () => ({})) {
  const m = new Map();
  for (const u of users) { const k = keyFn(u); if (!m.has(k)) m.set(k, []); m.get(k).push(u); }
  return [...m].map(([key, list]) => ({ key, ...rollup(list), ...extra(list, key) }));
}

// ---------- KPIs ----------
export function kpis(users, payments, filtered) {
  const r = rollup(users);
  const ok = (filtered ? users.flatMap(okPays) : payments.filter((p) => p.status === 'success'));
  const revenue = Math.round(ok.reduce((s, p) => s + (p.amount || 0), 0));
  return {
    visitors: r.visitors, landingVisits: users.reduce((s, u) => s + u.landingViews.length, 0), onboarding: r.onboarding, completed: r.completed,
    checkout: r.checkout, payments: ok.length, revenue, conversion: r.conversion, aov: ok.length ? Math.round(revenue / ok.length) : 0,
    landed: r.landed, funnelPayers: r.funnelPayers, unattributed: ok.filter((p) => !p.person).length,
    unattributedRevenue: Math.round(ok.filter((p) => !p.person).reduce((s, p) => s + (p.amount || 0), 0)),
  };
}
export const delta = (cur, prev) => (prev ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);

// ---------- series ----------
export function series(users, payments, from, to, filtered) {
  const days = [];
  for (let d = dayStart(from); d < to; d += DAY_MS) days.push(d);
  const idx = new Map(days.map((d, i) => [d, i]));
  const mk = () => days.map(() => new Set());
  const vis = mk(); const land = mk(); const paid = mk(); const start = mk();
  const views = days.map(() => 0); const rev = days.map(() => 0); const cnt = days.map(() => 0);
  const hours = Array.from({ length: 24 }, () => 0);
  for (const u of users) {
    for (const h of u.hits) {
      const i = idx.get(dayStart(h._t));
      if (i == null || h.page.kind === 'app' || h.page.kind === 'other') continue;
      vis[i].add(u.id);
      if (h.page.kind === 'landing') land[i].add(u.id);
      if (h.isView) { views[i] += 1; hours[Math.floor(((h._t + IST_MS) % DAY_MS) / 3600e3)] += 1; }
    }
    // cohort by landing day, so a day's conversion can never exceed 100%
    if (u.stage.landing != null) {
      const i = idx.get(dayStart(u.stage.landing));
      if (i != null) { if (reached(u, 'start')) start[i].add(u.id); if (reached(u, 'paid')) paid[i].add(u.id); }
    }
  }
  const firstLand = days.map(() => 0);
  for (const u of users) if (u.stage.landing != null) { const i = idx.get(dayStart(u.stage.landing)); if (i != null) firstLand[i] += 1; }
  const ok = filtered ? users.flatMap(okPays) : payments.filter((p) => p.status === 'success');
  for (const p of ok) { const i = idx.get(dayStart(p.ts)); if (i != null) { rev[i] += p.amount || 0; cnt[i] += 1; } }
  return {
    daily: days.map((d, i) => ({ date: istDate(d), visitors: vis[i].size, landed: land[i].size, views: views[i], cohort: firstLand[i], starts: start[i].size, payers: paid[i].size, conversion: pct(paid[i].size, firstLand[i]), revenue: Math.round(rev[i]), payments: cnt[i] })),
    hourly: hours.map((n, h) => ({ hour: h, views: n })),
  };
}

// ---------- experiments ----------
export function experiments(users) {
  const map = new Map();
  for (const u of users) for (const a of u.assignments) {
    if (!map.has(a.experiment)) map.set(a.experiment, []);
    map.get(a.experiment).push({ u, a });
  }
  return [...map].map(([name, list]) => {
    // Services and tickets this experiment's own events name. A later payment for an unrelated service is not its revenue.
    const services = new Set(list.flatMap((x) => x.a.services || []));
    const own = (a, p) => !services.size || services.has(p.serviceId) || (a.tickets || []).includes(p.ticketId);
    const byV = new Map();
    for (const x of list) { if (!byV.has(x.a.variant)) byV.set(x.a.variant, []); byV.get(x.a.variant).push(x); }
    const variants = [...byV].map(([variant, xs]) => {
      // checkout rows always name a service, so an unnamed one is not proof; onboarding steps often do not.
      const after = (u, a, s) => (u.marks[s] || []).some((m) => m.t >= a.ts - SLACK && (!services.size || services.has(m.svc) || (!m.svc && s !== 'checkout')));
      const n = xs.length;
      const c = (s) => xs.filter(({ u, a }) => after(u, a, s)).length;
      // a payment belongs to the variant only if it came after that person's assignment
      const pays = xs.flatMap(({ u, a }) => okPays(u).filter((p) => p.ts >= a.ts - SLACK && own(a, p)));
      const payers = xs.filter(({ u, a }) => okPays(u).some((p) => p.ts >= a.ts - SLACK && own(a, p))).length;
      const ci = wilson(payers, n);
      const chain = [['assigned', 'Experiment assignment', n], ['start', 'Lead / onboarding start', c('start')], ['complete', 'Onboarding completion', c('complete')], ['checkout', 'Checkout initiated', c('checkout')], ['paid', 'Payment success', payers]];
      return {
        variant, labels: [...new Set(xs.map((x) => x.a.label).filter((l) => l && l !== variant))], assigned: n, landing: xs.filter(({ u }) => u.stage.landing != null).length,
        onboarding: c('start'), completed: c('complete'), checkout: c('checkout'), payers, payments: pays.length, revenue: Math.round(pays.reduce((s, p) => s + (p.amount || 0), 0)),
        conversion: pct(payers, n), ciLow: ci[0], ciHigh: ci[1], conflicted: xs.filter((x) => x.a.conflict.length).length, forced: xs.filter((x) => /override|forced|param/i.test(x.a.source)).length,
        funnel: chain.map(([id, label, users2], i) => { const prev = i ? chain[i === 3 ? 1 : i - 1] : null; return { id, label, users: users2, ofTop: pct(users2, n), prevLabel: prev?.[1] || null, fromPrev: prev ? pct(users2, prev[2]) : null, drop: prev ? Math.max(0, prev[2] - users2) : null, dropPct: prev ? pct(Math.max(0, prev[2] - users2), prev[2]) : null }; }),
      };
    }).sort((a, b) => a.variant.localeCompare(b.variant, 'en', { numeric: true }));
    return {
      name, assigned: list.length, services: [...services], variants, sources: [...new Set(list.map((x) => x.a.from))], firstSeen: Math.min(...list.map((x) => x.a.ts)), lastSeen: Math.max(...list.map((x) => x.a.ts)),
      pages: [...new Set(list.map((x) => x.a.pageKey || x.a.page).filter(Boolean))].slice(0, 5), payers: variants.reduce((s, v) => s + v.payers, 0), revenue: variants.reduce((s, v) => s + v.revenue, 0),
    };
  }).sort((a, b) => b.assigned - a.assigned);
}

export function wilson(x, n) {
  if (!n) return [null, null];
  const z = 1.96; const p = x / n; const d = 1 + (z * z) / n;
  const m = p + (z * z) / (2 * n); const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.round(((m - s) / d) * 1000) / 10, Math.round(((m + s) / d) * 1000) / 10];
}

// ---------- shapes sent to the browser ----------
export const userRow = (u, model = 'first') => ({
  id: u.id, gas: u.gas, uuids: u.uuids, shared: u.uuids.length > 1, landing: u.firstLanding, landingUrl: u.firstLandingUrl, source: touch(u, model).source, medium: touch(u, model).medium, campaign: touch(u, model).campaign, channel: touch(u, model).channel,
  experiment: u.assignments[0]?.experiment || '', variant: u.assignments[0]?.variant || '', moreExp: Math.max(0, u.assignments.length - 1), lastPage: u.lastPage, stage: u.lastStage, exitConfirmed: u.exitConfirmed, payStatus: u.payStatus, revenue: u.revenue, lastTs: u.lastTs, firstTs: u.firstTs, sessions: u.sessions, device: u.device, returning: u.returning,
});

export const payRow = (p) => ({ prid: p.prid, txnId: p.txnId, ts: p.ts, status: p.status, amount: p.amount, amountFrom: p.amountFrom, gateway: p.gateway, service: p.service, serviceId: p.serviceId, ticketId: p.ticketId, uuid: p.uuid, person: p.person || '', match: p.match || '', reason: p.reason || '', attempts: p.attempts });
export { pct };
