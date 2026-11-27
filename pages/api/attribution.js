import { handler, load, paginate, sortRows } from '../../lib/api.js';
import { groupTouches, touch, touches } from '../../lib/metrics.js';

const DIMS = { channel: (t) => t.channel, source: (t) => t.source, medium: (t) => t.medium, campaign: (t) => t.campaign || '(none)', term: (t) => t.term || '(none)', content: (t) => t.content || '(none)', type: (t) => t.type };
export default handler(async (q) => {
  const { p, users } = await load(q);
  const dim = DIMS[q.dim] ? q.dim : 'channel';
  const fn = DIMS[dim];
  const rows = groupTouches(users, p.f.model, (t) => fn(t.attr), (list) => (dim === 'campaign' ? { sources: [...new Set(list.map((u) => `${touch(u, p.f.model).source} / ${touch(u, p.f.model).medium}`))].slice(0, 2).join(', ') } : {}));
  return {
    dim, model: p.f.model, types: groupTouches(users, p.f.model, (t) => t.attr.type).sort((a, b) => b.visitors - a.visitors),
    clickIds: { gclid: users.filter((u) => touches(u, p.f.model).some((t) => t.attr.gclid)).length, fbclid: users.filter((u) => touches(u, p.f.model).some((t) => t.attr.fbclid)).length },
    ...paginate(sortRows(rows, p.sort || 'visitors', p.dir), p),
  };
});
