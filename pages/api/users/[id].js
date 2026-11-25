import { handler } from '../../../lib/api.js';
import { getUserDetail } from '../../../lib/journeys.js';
import { attribution, hasCampaign, safeUrl, onboardingStep } from '../../../lib/taxonomy.js';
import { payRow, userRow } from '../../../lib/metrics.js';

export default handler(async (q) => {
  const id = String(q.id || '');
  if (!/^[\w]+\.\d{6,12}$/.test(id)) throw Object.assign(new Error('Not a GA client id'), { status: 400 });
  const u = await getUserDetail(id);
  if (!u) throw Object.assign(new Error('No QE tracking rows for this id'), { status: 404 });
  const t = [];
  let first = true;
  for (const h of u.hits) {
    if (h.dup) continue;
    const a = h.entry ? attribution(h) : null;
    const base = { ts: h._t, page: h.page.key, url: safeUrl(h.url), ga: h.gk, ticket: h.ticket, service: h.serviceId ? String(h.serviceId) : '', host: h.scope };
    if (h.data?.event === 'onboarding_experiment_assigned') continue;
    if (h.navigation === 'cart') t.push({ ...base, type: 'lead', title: 'Lead submitted' });
    else if (h.navigation === 'checkout') t.push({ ...base, type: 'checkout', title: 'Checkout initiated', prid: h.prid });
    else if (h.navigation === 'payment-done') t.push({ ...base, type: 'page', title: 'Success page seen', prid: h.prid, note: 'Browser signal only; payment status comes from the gateway' });
    else if (h.navigation === 'payment-failed') t.push({ ...base, type: 'page', title: 'Payment failure page seen', prid: h.prid });
    else if (h.page.kind === 'landing' && first) { first = false; t.push({ ...base, type: 'landing', title: 'First landing', attr: attribution(h) }); }
    else if (h.page.kind === 'landing' && a && hasCampaign(a)) t.push({ ...base, type: 'landing', title: 'New entry', attr: a });
    else if (h.page.kind === 'onboarding') t.push({ ...base, type: 'onboarding', title: `Onboarding: ${onboardingStep(h.page.path)}` });
    else t.push({ ...base, type: 'page', title: h.page.kind === 'checkout' ? 'Checkout page viewed' : 'Page viewed' });
  }
  for (const a of u.assignments) t.push({ ts: a.ts, type: 'experiment', title: `${a.experiment} → ${a.variant}`, note: [a.label && a.label !== a.variant && `design: ${a.label}`, `recorded by ${a.from}`, a.source && `source: ${a.source}`, a.conflict.length && `later also saw ${a.conflict.join(', ')} (first assignment kept)`].filter(Boolean).join(' · '), page: a.pageKey || a.page });
  for (const e of u.events) if (e.m) t.push({ ts: e.ts, type: e.m.exit ? 'exit' : e.m.lead ? 'lead' : 'onboarding', title: e.eventName.replace(/_/g, ' '), page: safeUrl(e.url || e.eventProperties?.pageUrl || '') || e.workflow, note: e.eventProperties?.step != null ? `step ${e.eventProperties.step}` : '' });
  for (const x of u.payments) t.push({ ts: x.ts, type: x.status === 'success' ? 'paid' : 'payfail', title: `Payment ${x.status}`, prid: x.prid, txn: x.txnId, amount: x.amount, ticket: x.ticketId, service: x.service || x.serviceId, note: `${x.gateway} · matched by ${x.match}` });
  t.sort((a, b) => a.ts - b.ts);
  const key = new Set(); const timeline = t.filter((x) => { const k = `${x.type}|${x.title}|${x.page}|${Math.floor(x.ts / 2000)}`; if (key.has(k)) return false; key.add(k); return true; });
  const cap = 600;
  return { user: { ...userRow(u), firstTouch: u.firstTouch, lastTouch: u.lastTouch, stage: u.lastStage, stages: u.stage, steps: u.steps, tickets: u.tickets, services: u.services, pageViews: u.pageViews, assignments: u.assignments.map(({ experiment, variant, label, source, from, ts, conflict }) => ({ experiment, variant, label, source, from, ts, conflict })), firstIsLanding: u.firstIsLanding }, payments: u.payments.map(payRow), timeline: timeline.slice(-cap), truncated: Math.max(0, timeline.length - cap) };
});
