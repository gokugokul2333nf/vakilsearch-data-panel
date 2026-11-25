import { DAY_MS, MAX_RANGE_DAYS } from './config.js';
import { getDataset } from './journeys.js';
import { applyFilters, isFiltered } from './metrics.js';
import { dayStart } from './store.js';

const str = (v) => (typeof v === 'string' ? v.slice(0, 300) : '');
const istMidnight = (s) => { const m = /^\d{4}-\d{2}-\d{2}$/.test(s) ? Date.parse(`${s}T00:00:00+05:30`) : NaN; return Number.isFinite(m) ? m : null; };

export function parseQuery(q) {
  const today = dayStart(Date.now());
  const preset = str(q.range) || '30d';
  let from; let to = today + DAY_MS;
  if (preset === 'today') from = today;
  else if (preset === 'yesterday') { from = today - DAY_MS; to = today; }
  else if (preset === '7d') from = today - 6 * DAY_MS;
  else if (preset === 'month') { const d = new Date(today + 330 * 60e3); from = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - 330 * 60e3; }
  else if (preset === 'custom') {
    from = istMidnight(str(q.from)); const end = istMidnight(str(q.to));
    if (from == null || end == null || end < from) throw Object.assign(new Error('Custom range needs a valid from and to date'), { status: 400 });
    to = end + DAY_MS;
  } else from = today - 29 * DAY_MS;
  if (to - from > MAX_RANGE_DAYS * DAY_MS) throw Object.assign(new Error(`Range is limited to ${MAX_RANGE_DAYS} days`), { status: 400 });
  const f = { model: q.model === 'last' ? 'last' : 'first' };
  for (const k of ['source', 'medium', 'channel', 'campaign', 'term', 'content', 'landing', 'service', 'device', 'experiment', 'variant', 'stage', 'reached', 'pay']) f[k] = str(q[k]);
  return { from, to, env: q.env === 'all' ? 'all' : 'qe', bots: q.bots === 'include' ? 'include' : 'exclude', f, page: Math.max(1, Number(q.page) || 1), size: Math.min(100, Number(q.size) || 25), sort: str(q.sort), dir: q.dir === 'asc' ? 1 : -1, q: str(q.q).trim() };
}

export async function load(query) {
  const p = parseQuery(query);
  const ds = await getDataset(p);
  return { p, ds, users: applyFilters(ds.users, p.f), filtered: isFiltered(p.f) };
}
export async function loadPrev(p) {
  const span = p.to - p.from;
  const ds = await getDataset({ ...p, from: p.from - span, to: p.from });
  return { ds, users: applyFilters(ds.users, p.f) };
}

export const handler = (fn) => async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Read only' });
  try {
    res.status(200).json(await fn(req.query));
  } catch (e) {
    const status = e.status || 502;
    console.error('[api]', req.url.split('?')[0], e.name, e.message);
    res.status(status).json({ error: status === 400 || status === 404 ? e.message : 'QE data source did not answer. Try again in a moment.' });
  }
  return undefined;
};

export const sortRows = (rows, key, dir) => (key ? [...rows].sort((a, b) => { const x = a[key]; const y = b[key]; if (x == null) return 1; if (y == null) return -1; return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir; }) : rows);
export const paginate = (rows, { page, size }) => ({ total: rows.length, page, size, rows: rows.slice((page - 1) * size, page * size) });
