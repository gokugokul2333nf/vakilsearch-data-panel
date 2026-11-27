// Recomputes dashboard totals with separate, direct Elasticsearch queries and compares.
process.loadEnvFile(new URL('../.env.local', import.meta.url));
const { load } = await import('../lib/api.js');
const m = await import('../lib/metrics.js');
const { search } = await import('../lib/es.js');
const { IDX } = await import('../lib/config.js');
const { isBot, basePrid, classifyPage } = await import('../lib/taxonomy.js');

let bad = 0;
const check = (name, a, b) => { const ok = a === b; if (!ok) bad += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: dashboard ${a} / source ${b}`); };
for (const range of ['7d', '30d', 'month']) {
  const q = { range };
  const { p, ds, users, filtered } = await load(q);
  const k = m.kpis(users, ds.payments, filtered);
  console.log(`\n${range}: ${new Date(p.from).toISOString()} to ${new Date(p.to).toISOString()}`);
  const r = { range: { createdOn: { gte: p.from, lt: p.to, format: 'epoch_millis' } } };
  // payments: distinct payment requests with a success row, amount from gateway log
  const tx = await search(IDX.txn, { size: 5000, query: { bool: { filter: [r, { term: { 'status.keyword': 'success' } }] } } });
  const ids = [...new Set(tx.hits.hits.map((h) => basePrid(h._source.requestId)))];
  check('successful payments', k.payments, ids.length);
  const nat = await search(IDX.native, { size: 5000, query: { bool: { filter: [{ terms: { 'requestId.keyword': ids } }, { term: { 'logType.keyword': 'payment success' } }] } } });
  const amt = new Map(); for (const h of nat.hits.hits) { const s = h._source; const id = basePrid(s.requestId); if (!amt.has(id)) amt.set(id, s.gateway === 'razorpay' ? s.amount / 100 : Number(s.amount)); }
  check('revenue', k.revenue, Math.round(ids.reduce((s, i) => s + (amt.get(i) || 0), 0)));
  // rows
  const c = await search(IDX.uts, { size: 0, track_total_hits: true, query: { bool: { filter: [r] } } });
  check('user-track rows read', ds.audit.utsRows, c.hits.total.value);
  // unique QE-host GA ids, via composite-free terms agg on ga + ua + page
  const agg = await search(IDX.uts, { size: 0, query: { bool: { filter: [r, { regexp: { 'page.keyword': 'https://qe[a-z0-9-]*\\.(vakilsearch|zolvit)\\.com.*' } }] } }, aggs: { g: { terms: { field: 'ga.keyword', size: 20000 }, aggs: { ua: { terms: { field: 'userAgent.keyword', size: 50 }, aggs: { pg: { terms: { field: 'page.keyword', size: 500 } } } } } } } });
  const people = new Set(); const landed = new Set();
  for (const b of agg.aggregations.g.buckets) for (const u of b.ua.buckets) if (!isBot(u.key)) for (const pg of u.pg.buckets) { const kind = classifyPage(pg.key).kind; if (!['app', 'other'].includes(kind)) people.add(b.key); if (kind === 'landing') landed.add(b.key); }
  check('unique visitors (before UUID merges)', k.visitors + ds.audit.mergedBrowsers, people.size);
  check('users who landed (before UUID merges)', k.landed + ds.audit.mergedBrowsers, landed.size);
  check('revenue split by landing page adds up', m.groupRollup(users, (u) => u.firstLanding).reduce((s, x) => s + x.revenue, 0) + k.unattributedRevenue, k.revenue);
  check('revenue split by landing visit adds up', m.groupTouches(users, 'visit', (t) => t.page).reduce((s, x) => s + x.revenue, 0) + k.unattributedRevenue, k.revenue);
  check('revenue split by visit channel adds up', m.groupTouches(users, 'visit', (t) => t.attr.channel).reduce((s, x) => s + x.revenue, 0) + k.unattributedRevenue, k.revenue);
  check('users split by channel add up', m.groupRollup(users, (u) => u.firstTouch.channel).reduce((s, x) => s + x.visitors, 0), k.visitors);
  const f = m.funnel(users).filter((x) => x.core); check('core funnel never increases', f.every((x, i) => !i || x.users <= f[i - 1].users), true);
}
process.exitCode = bad ? 1 : 0;
