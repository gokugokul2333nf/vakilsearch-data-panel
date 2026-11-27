import { IDX } from '../../lib/config.js';
import { handler, load } from '../../lib/api.js';
import { alerts } from '../../lib/health.js';
import { okPays } from '../../lib/metrics.js';

export default handler(async (q) => {
  const { ds, users } = await load({ range: q.range, from: q.from, to: q.to, env: q.env, bots: q.bots });
  const ok = ds.payments.filter((p) => p.status === 'success');
  const reasons = {}; for (const p of ok) if (!p.person) reasons[p.reason] = (reasons[p.reason] || 0) + 1;
  const matches = {}; for (const p of ok) if (p.person) matches[p.match] = (matches[p.match] || 0) + 1;
  const landingVia = {}; for (const p of ok) if (p.person) { const k = p.landing?.via || 'no landing page found'; landingVia[k] = (landingVia[k] || 0) + 1; }
  return { indices: IDX, audit: ds.audit, alerts: alerts(ds, users), users: users.length, withUuid: users.filter((u) => u.uuids.length).length, returning: users.filter((u) => u.returning).length, paidUsers: users.filter((u) => okPays(u).length).length, payments: ok.length, matches, reasons, landingVia };
});
