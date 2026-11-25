import { handler, load, paginate, sortRows } from '../../lib/api.js';
import { groupRollup, landingOf } from '../../lib/metrics.js';

export default handler(async (q) => {
  const { p, users } = await load(q);
  const views = new Map(); const seenBy = new Map();
  for (const u of users) for (const h of u.landingViews) { views.set(h.page.key, (views.get(h.page.key) || 0) + 1); if (!seenBy.has(h.page.key)) seenBy.set(h.page.key, new Set()); seenBy.get(h.page.key).add(u.id); }
  let rows = groupRollup(users, (u) => landingOf(u, p.f.model), (list, key) => ({ views: views.get(key) || 0, allVisitors: seenBy.get(key)?.size || 0, sessions: list.reduce((s, u) => s + u.sessions, 0) }));
  if (p.q) rows = rows.filter((r) => r.key.toLowerCase().includes(p.q.toLowerCase()));
  return { model: p.f.model, ...paginate(sortRows(rows, p.sort || 'visitors', p.dir), p) };
});
