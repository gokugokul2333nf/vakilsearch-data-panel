import { handler, load } from '../../lib/api.js';
import { experiments, landingOf, touch } from '../../lib/metrics.js';

export default handler(async (q) => {
  const { p, ds } = await load({ range: q.range, from: q.from, to: q.to, env: q.env, bots: q.bots, model: q.model });
  const top = (fn, n = 60) => { const m = new Map(); for (const u of ds.users) for (const k of [fn(u)].flat()) if (k) m.set(k, (m.get(k) || 0) + 1); return [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([v, c]) => ({ v, c })); };
  const t = (k) => top((u) => touch(u, p.f.model)[k]);
  const names = new Map(); for (const x of ds.payments) if (x.serviceId && x.service) names.set(x.serviceId, x.service);
  return { source: t('source'), medium: t('medium'), channel: t('channel'), campaign: top((u) => touch(u, p.f.model).campaign || '(none)'), landing: top((u) => landingOf(u, p.f.model), 120), service: top((u) => u.services).map((s) => ({ ...s, l: names.get(s.v) ? `${names.get(s.v)} (${s.v})` : `Service ${s.v}` })), device: top((u) => u.device), experiments: experiments(ds.users).map((e) => ({ v: e.name, c: e.assigned, variants: e.variants.map((x) => x.variant) })) };
});
