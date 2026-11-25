import { handler, load, paginate, sortRows } from '../../lib/api.js';
import { groupRollup, touch } from '../../lib/metrics.js';

const DIMS = { channel: (t) => t.channel, source: (t) => t.source, medium: (t) => t.medium, campaign: (t) => t.campaign || '(none)', term: (t) => t.term || '(none)', content: (t) => t.content || '(none)', type: (t) => t.type };
export default handler(async (q) => {
  const { p, users } = await load(q);
  const dim = DIMS[q.dim] ? q.dim : 'channel';
  const fn = DIMS[dim];
  const rows = groupRollup(users, (u) => fn(touch(u, p.f.model)), (list) => (dim === 'campaign' ? { sources: [...new Set(list.map((u) => `${touch(u, p.f.model).source} / ${touch(u, p.f.model).medium}`))].slice(0, 2).join(', ') } : {}));
  return {
    dim, model: p.f.model, types: groupRollup(users, (u) => touch(u, p.f.model).type).sort((a, b) => b.visitors - a.visitors),
    clickIds: { gclid: users.filter((u) => touch(u, p.f.model).gclid).length, fbclid: users.filter((u) => touch(u, p.f.model).fbclid).length },
    ...paginate(sortRows(rows, p.sort || 'visitors', p.dir), p),
  };
});
