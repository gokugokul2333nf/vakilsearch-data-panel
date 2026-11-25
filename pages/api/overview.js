import { handler, load, loadPrev } from '../../lib/api.js';
import { STAGES } from '../../lib/taxonomy.js';
import { delta, experiments, funnel, groupRollup, kpis, payRow, series, touch, landingOf, userRow } from '../../lib/metrics.js';
import { alerts } from '../../lib/health.js';

export default handler(async (q) => {
  const { p, ds, users, filtered } = await load(q);
  const prev = await loadPrev(p);
  const cur = kpis(users, ds.payments, filtered);
  const old = kpis(prev.users, prev.ds.payments, filtered);
  const byChannel = groupRollup(users, (u) => touch(u, p.f.model).channel).sort((a, b) => b.visitors - a.visitors);
  const stages = [...STAGES.filter((s) => s.id !== 'assigned')].map((s) => ({ id: s.id, label: s.label, users: users.filter((u) => u.lastStage === s.id).length }));
  const s = series(users, ds.payments, p.from, p.to, filtered);
  const pays = (filtered ? users.flatMap((u) => u.payments) : ds.payments).filter((x) => x.status === 'success').sort((a, b) => b.ts - a.ts).slice(0, 5).map(payRow);
  const exps = experiments(users);
  return {
    range: { from: p.from, to: p.to }, kpis: cur, prev: old, delta: Object.fromEntries(Object.keys(cur).map((k) => [k, k === 'conversion' ? (cur[k] != null && old[k] != null ? Math.round((cur[k] - old[k]) * 10) / 10 : null) : delta(cur[k], old[k])])),
    funnel: funnel(users), stages, channels: byChannel, devices: groupRollup(users, (u) => u.device).sort((a, b) => b.visitors - a.visitors),
    landings: groupRollup(users, (u) => landingOf(u, p.f.model)).sort((a, b) => b.visitors - a.visitors).slice(0, 8), series: s, payments: pays,
    experiments: [...exps].sort((a, b) => Number(b.variants.some((v) => /^v\d/.test(v.variant))) - Number(a.variants.some((v) => /^v\d/.test(v.variant)))).slice(0, 6).map((e) => ({ name: e.name, assigned: e.assigned, variants: e.variants.map((v) => ({ variant: v.variant, assigned: v.assigned, onboarding: v.onboarding, checkout: v.checkout, payers: v.payers, conversion: v.conversion, revenue: v.revenue })) })),
    activity: [...users].sort((a, b) => b.lastTs - a.lastTs).slice(0, 5).map((u) => userRow(u, p.f.model)), alerts: alerts(ds, users),
  };
});
