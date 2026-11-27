import { handler, load, loadPrev, paginate, sortRows } from '../../lib/api.js';
import { NO_LANDING } from '../../lib/journeys.js';
import { delta, kpis, landingOf, payRow, series, touch } from '../../lib/metrics.js';

export default handler(async (q) => {
  const { p, ds, users, filtered } = await load(q);
  const prev = await loadPrev(p);
  const byId = new Map(ds.users.map((u) => [u.id, u]));
  const all = filtered ? users.flatMap((u) => u.payments) : ds.payments;
  const ok = all.filter((x) => x.status === 'success');
  const by = (fn) => { const m = new Map(); for (const x of ok) { const k = fn(x) || '(unknown)'; const r = m.get(k) || { key: k, payments: 0, revenue: 0 }; r.payments += 1; r.revenue += x.amount || 0; m.set(k, r); } return [...m.values()].map((r) => ({ ...r, revenue: Math.round(r.revenue) })).sort((a, b) => b.revenue - a.revenue); };
  const via = (f) => (x) => { const u = byId.get(x.person); return u ? f(u) : 'Unattributed payment'; };
  // under 'visit' a payment is credited to its own landing visit, not to the person's first page
  const tp = (f) => (x) => { const u = byId.get(x.person); if (!u) return 'Unattributed payment'; if (p.f.model !== 'visit') return f({ attr: touch(u, p.f.model), page: landingOf(u, p.f.model) }); return f(x.landing ? { attr: x.landing.attr, page: x.landing.key } : { attr: u.convertingTouch, page: NO_LANDING }); };
  const dims = {
    channel: by(tp((t) => t.attr.channel)), source: by(tp((t) => `${t.attr.source} / ${t.attr.medium}`)), campaign: by(tp((t) => t.attr.campaign || '(none)')), landing: by(tp((t) => t.page)),
    service: by((x) => (x.service ? `${x.service}` : x.serviceId ? `Service ${x.serviceId}` : '')), gateway: by((x) => x.gateway),
    variant: by(via((u) => u.assignments.map((a) => `${a.experiment} · ${a.variant}`)[0] || '(no experiment)')),
  };
  const k = kpis(users, ds.payments, filtered); const o = kpis(prev.users, prev.ds.payments, filtered);
  let rows = all.map(payRow);
  if (q.status) rows = rows.filter((r) => r.status === q.status);
  if (q.matched === 'no') rows = rows.filter((r) => !r.person);
  if (p.q) { const s = p.q.toLowerCase(); rows = rows.filter((r) => [r.prid, r.txnId, r.ticketId, r.uuid, r.service].some((v) => String(v).toLowerCase().includes(s))); }
  return {
    model: p.f.model, kpis: k, delta: { revenue: delta(k.revenue, o.revenue), payments: delta(k.payments, o.payments), aov: delta(k.aov, o.aov) },
    counts: { success: ok.length, failed: all.filter((x) => x.status === 'failed').length, pending: all.filter((x) => x.status === 'pending').length }, dims, series: series(users, ds.payments, p.from, p.to, filtered).daily,
    ...paginate(sortRows(rows, p.sort || 'ts', p.dir), p),
  };
});
