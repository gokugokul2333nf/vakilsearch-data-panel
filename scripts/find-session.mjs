// Read-only: is a visit id (vs_sid) stored on QE? Looks in user-track rows and payment requests.
// Usage: node --env-file=.env.local scripts/find-session.mjs <sessionId>
import { IDX } from '../lib/config.js';
import { search } from '../lib/es.js';

const id = String(process.argv[2] || '').trim();
if (!/^[0-9a-f-]{36}$/i.test(id)) { console.error('Give a visit id (UUID), e.g. 1cf025a8-4384-4bc8-8d03-287ca349e8fc'); process.exit(1); }

const field = async (index, f) => search(index, {
  size: 20, sort: [{ createdOn: 'desc' }], _source: ['createdOn', 'navigation', 'url', 'ga', 'ticketId', 'sessionId', 'deviceId', 'metadata.ticketId', 'metadata.landing', 'prid'],
  query: { bool: { should: [{ term: { [`${f}.keyword`]: id } }, { match_phrase: { [f]: id } }], minimum_should_match: 1 } },
}).then((r) => r.hits.hits).catch((e) => { console.log(`  (${index}: ${e.message.split('\n')[0]})`); return []; });

const short = (u) => String(u || '').replace(/\?.*/, '');
const [uts, reg] = await Promise.all([field(IDX.uts, 'sessionId'), field(IDX.registry, 'metadata.landing.sessionId')]);
console.log(`user-track rows with sessionId ${id}: ${uts.length}`);
for (const h of uts) { const s = h._source; console.log(' ', new Date(s.createdOn).toISOString(), s.navigation || '-', short(s.url), s.ticketId ? `ticket ${s.ticketId}` : ''); }
console.log(`payment requests with metadata.landing.sessionId ${id}: ${reg.length}`);
for (const h of reg) { const s = h._source; console.log(' ', new Date(s.createdOn).toISOString(), `ticket ${s.metadata?.ticketId}`, short(s.metadata?.landing?.url)); }
if (!uts.length) {
  // was the field dropped? show whether ANY recent row carries sessionId at all
  const any = await search(IDX.uts, { size: 1, sort: [{ createdOn: 'desc' }], _source: ['createdOn', 'url'], query: { exists: { field: 'sessionId' } } });
  const h = any.hits.hits[0];
  console.log(h ? `latest row that has any sessionId: ${new Date(h._source.createdOn).toISOString()} ${short(h._source.url)}` : 'No user-track row has a sessionId field yet: the API is not storing it (or nothing has sent it).');
}
