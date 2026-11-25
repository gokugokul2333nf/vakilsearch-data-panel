import { handler, load } from '../../lib/api.js';
import { applyFilters, funnel } from '../../lib/metrics.js';
import { groupRollup, landingOf, touch, experiments } from '../../lib/metrics.js';

// `compare` = up to 4 funnels, each "dimension:value" (variant uses "experiment~variant").
export default handler(async (q) => {
  const { p, ds, users } = await load(q);
  const specs = (Array.isArray(q.compare) ? q.compare : q.compare ? [q.compare] : []).slice(0, 4);
  const compare = specs.map((s) => {
    const [dim, ...rest] = s.split(':'); const value = rest.join(':');
    const extra = dim === 'variant' ? { experiment: value.split('~')[0], variant: value.split('~')[1] } : ['channel', 'source', 'campaign', 'landing', 'service', 'device', 'experiment'].includes(dim) ? { [dim]: value } : null;
    return extra && { spec: s, label: dim === 'variant' ? value.replace('~', ' · ') : value, rows: funnel(applyFilters(ds.users, { ...p.f, ...extra }), { assigned: extra.experiment }) };
  }).filter(Boolean);
  const top = (fn) => groupRollup(ds.users, fn).sort((a, b) => b.visitors - a.visitors).slice(0, 15).map((r) => r.key);
  const last = {}; for (const u of users) { if (u.lastStage === 'paid') continue; last[u.lastStage] ||= { stage: u.lastStage, confirmed: 0, inferred: 0, pages: {} }; last[u.lastStage][u.exitConfirmed ? 'confirmed' : 'inferred'] += 1; last[u.lastStage].pages[u.lastPage] = (last[u.lastStage].pages[u.lastPage] || 0) + 1; }
  return {
    rows: funnel(users, { assigned: p.f.experiment }), compare, population: users.length, entered: users.filter((u) => u.stage.landing != null).length,
    dropoffs: Object.values(last).map((x) => ({ ...x, pages: Object.entries(x.pages).sort((a, b) => b[1] - a[1]).slice(0, 4) })),
    options: { channel: top((u) => touch(u, p.f.model).channel), landing: top((u) => landingOf(u, p.f.model)), variant: experiments(ds.users).flatMap((e) => e.variants.map((v) => `${e.name}~${v.variant}`)), device: top((u) => u.device) },
  };
});
