import { Client } from '@elastic/elasticsearch';
import { assertQe } from './config.js';

let client;
const get = () => {
  if (client) return client;
  assertQe();
  client = new Client({ node: process.env.ES_QE_URL, requestTimeout: 40000, maxRetries: 2 });
  return client;
};

// Read-only surface on purpose: nothing in this app can write to Elasticsearch.
export const search = async (index, body) => get().search({ index, ...body });
export const count = async (index, query) => (await get().count({ index, query })).count;

// Every doc in [from, to), oldest first. Pages on createdOn and drops repeats at the page edge.
export async function scan(index, { from, to, filter = [], mustNot = [], source }) {
  const out = [];
  const size = 5000;
  let cursor = from;
  let edge = new Set();
  for (;;) {
    const res = await search(index, {
      size,
      _source: source,
      track_total_hits: false,
      sort: [{ createdOn: 'asc' }],
      query: { bool: { filter: [{ range: { createdOn: { gte: cursor, lt: to, format: 'epoch_millis' } } }, ...filter], must_not: mustNot } },
    });
    const hits = res.hits.hits;
    for (const h of hits) if (!edge.has(h._id)) out.push({ _id: h._id, _t: h.sort[0], ...h._source });
    if (hits.length < size) return out;
    const last = hits[hits.length - 1].sort[0];
    if (last === cursor) throw new Error(`${index}: more than ${size} docs share one timestamp`);
    cursor = last;
    edge = new Set(hits.filter((h) => h.sort[0] === last).map((h) => h._id));
  }
}

export const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

export async function termsFetch(index, field, values, { source, filter = [], sort = [{ createdOn: 'asc' }], size = 5000, collapse } = {}) {
  const lists = await Promise.all(chunk([...new Set(values)].filter(Boolean), 500).map((part) => search(index, {
    size, _source: source, track_total_hits: false, sort, ...(collapse ? { collapse: { field: collapse } } : {}),
    query: { bool: { filter: [{ terms: { [field]: part } }, ...filter] } },
  })));
  return lists.flatMap((r) => r.hits.hits.map((h) => ({ _id: h._id, _t: h.sort?.[0], ...h._source })));
}
