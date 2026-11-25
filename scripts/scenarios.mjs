// Finds a real QE user for each scenario in the brief and checks the detail endpoint agrees with the list.
const B = process.env.BASE || 'http://127.0.0.1:3120';
const get = async (p) => { const r = await fetch(B + p); return { s: r.status, j: await r.json() }; };
const all = []; for (let i = 1; ; i += 1) { const { j } = await get(`/api/users?range=custom&from=2026-09-01&to=2026-11-25&size=100&page=${i}`); all.push(...j.rows); if (all.length >= j.total || !j.rows.length) break; }
console.log('users', all.length);
const S = [
  ['lands and pays', (u) => u.stage === 'paid'], ['visits, no lead', (u) => u.stage === 'landing'], ['starts, drops', (u) => ['start', 'progress'].includes(u.stage)],
  ['completes onboarding, no pay', (u) => ['complete', 'checkout'].includes(u.stage) && u.payStatus !== 'success'], ['failed payment', (u) => u.payStatus === 'failed'],
  ['v1', (u) => u.variant === 'v1'], ['v2', (u) => u.variant === 'v2'], ['v3', (u) => u.variant === 'v3'], ['Google Ads', (u) => u.channel === 'Google Ads'], ['organic', (u) => u.channel === 'Organic search'],
  ['returning, many sessions', (u) => u.sessions > 2], ['shared browser', (u) => u.shared], ['merged browsers', (u) => u.gas.length > 1],
];
for (const [n, f] of S) {
  const u = all.find(f); if (!u) { console.log('NONE ', n); continue; }
  const { s, j } = await get(`/api/users/${u.id}`);
  console.log(s === 200 ? 'OK   ' : `HTTP${s}`, n, '|', u.id, u.stage, '->', j.user?.stage, '| events', j.timeline?.length, '| pays', j.payments?.filter((p) => p.status === 'success').length, '| variant', u.variant, j.user?.variant);
}
const paid = all.find((u) => u.stage === 'paid' && u.uuids.length); const d = (await get(`/api/users/${paid.id}`)).j; const p = d.payments.find((x) => x.status === 'success');
for (const [k, v] of [['uuid', p.uuid], ['ga', `GA1.2.${paid.id}`], ['ticket', p.ticketId], ['payment id', p.prid], ['txn', p.txnId]]) { const { j } = await get(`/api/users?range=today&q=${encodeURIComponent(v)}`); console.log('search', k, '->', j.total ? j.rows.map((r) => r.id) : j.outside, j.total || j.outside.includes(paid.id) ? 'OK' : 'MISS'); }
console.log('bad range', (await get('/api/overview?range=custom&from=x&to=y')).s, 'too long', (await get('/api/overview?range=custom&from=2024-01-01&to=2026-01-01')).s, 'bad id', (await get('/api/users/zzz')).s, 'unknown', (await get('/api/users/1.1111111111')).s, 'POST', (await fetch(`${B}/api/overview`, { method: 'POST' })).status);
const blob = JSON.stringify([all, d, (await get('/api/revenue?range=30d&size=100')).j]);
console.log('leaks: email', /@[\w-]+\.(com|in)/.test(blob), 'phone', /(^|[^\d.])[6-9]\d{9}([^\d]|$)/.test(blob.replace(/\d+\.\d{10}/g, '').replace(/"txnId":"[^"]*"|"txn":"[^"]*"/g, '')), 'token', /token=|MagicKey/i.test(blob), 'cookie', /_fbp|auth_token/.test(blob));
const un = (await get('/api/revenue?range=custom&from=2026-06-01&to=2026-11-25&matched=no&status=success&size=100')).j; console.log('unattributed successes since June:', un.total, [...new Set(un.rows.map((r) => r.reason))]);
