import { handler, load, paginate, sortRows } from '../../../lib/api.js';
import { userRow } from '../../../lib/metrics.js';
import { globalFind } from '../../../lib/find.js';

export default handler(async (q) => {
  const { p, users } = await load(q);
  let list = users;
  let outside = [];
  if (p.q) {
    const s = p.q.toLowerCase();
    const has = (v) => String(v || '').toLowerCase().includes(s);
    list = users.filter((u) => u.uuids.some(has) || u.gas.some((g) => has(g) || s.includes(g)) || u.tickets.some(has) || u.prids.some(has) || u.payments.some((x) => has(x.txnId)) || has(u.firstLandingUrl) || has(u.firstTouch.campaign) || has(u.lastTouch.campaign));
    if (!list.length) outside = await globalFind(p.q); // an exact id from outside the selected range
  }
  return { ...paginate(sortRows(list.map((u) => userRow(u, p.f.model)), p.sort || 'lastTs', p.dir), p), outside };
});
