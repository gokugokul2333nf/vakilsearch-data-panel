import { handler, load } from '../../lib/api.js';
import { experiments, touches } from '../../lib/metrics.js';

export default handler(async (q) => {
  const { p, ds } = await load({ range: q.range, from: q.from, to: q.to, env: q.env, bots: q.bots, model: q.model });
  const top = (fn, n = 60) => { const m = new Map(); for (const u of ds.users) for (const k of [fn(u)].flat()) if (k) m.set(k, (m.get(k) || 0) + 1); return [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([v, c]) => ({ v, c })); };
  // one count per person per value, across all of their landing visits under the 'visit' model
  const tv = (fn, n) => top((u) => [...new Set(touches(u, p.f.model).map(fn))], n);
  const t = (k) => tv((x) => x.attr[k]);
  const names = new Map(); for (const x of ds.payments) if (x.serviceId && x.service) names.set(x.serviceId, x.service);
  return { source: t('source'), medium: t('medium'), channel: t('channel'), campaign: tv((x) => x.attr.campaign || '(none)'), landing: tv((x) => x.page, 120), service: top((u) => u.services).map((s) => ({ ...s, l: names.get(s.v) ? `${names.get(s.v)} (${s.v})` : `Service ${s.v}` })), device: top((u) => u.device), experiments: experiments(ds.users).map((e) => ({ v: e.name, c: e.assigned, variants: e.variants.map((x) => x.variant) })) };
});
