import { IDX, DAY_MS, IST_MS } from './config.js';
import { scan, termsFetch } from './es.js';
import { EVENT_NAMES, gaForms } from './taxonomy.js';

// Day shards (IST). Closed days are kept for an hour, today for a minute, so a filter or tab change
// never re-queries Elasticsearch; only missing days are read, in one ranged request.
const g = globalThis;
g.__shards ||= new Map();
const CLOSED_TTL = 3600e3;
const OPEN_TTL = 60e3;
const MAX_SHARDS = 1600;

const UTS_SRC = ['ga', 'url', 'navigation', 'source', 'medium', 'referrer', 'localreferrer', 'userAgent', 'ticketId', 'serviceId', 'landingUrl', 'data'];
const EVT_SRC = ['_ga', 'eventName', 'workflow', 'url', 'eventTime', 'ticketId', 'serviceId', 'paymentRequestId', 'eventProperties.pageUrl', 'eventProperties.step', 'eventProperties.abExperiment', 'eventProperties.abVariant', 'eventProperties.onboardingExperiment', 'eventProperties.onboardingDesign', 'eventProperties.onboardingVariant', 'eventProperties.assignmentSource', 'eventProperties.experimentId', 'eventProperties.variationId', 'eventProperties.label', 'eventProperties.value', 'eventProperties.ticketId', 'eventProperties.serviceId'];
const TXN_SRC = ['requestId', 'status', 'gateway', 'ticketId'];
const EXP_FILTER = { bool: { minimum_should_match: 1, should: [
  { terms: { 'eventName.keyword': EVENT_NAMES } },
  { exists: { field: 'eventProperties.onboardingExperiment' } },
  { exists: { field: 'eventProperties.abExperiment' } },
] } };

const KINDS = {
  uts: { index: IDX.uts, source: UTS_SRC, filter: [] },
  events: { index: IDX.events, source: EVT_SRC, filter: [{ exists: { field: '_ga' } }, EXP_FILTER] },
  txn: { index: IDX.txn, source: TXN_SRC, filter: [] },
};

export const dayStart = (ts) => Math.floor((ts + IST_MS) / DAY_MS) * DAY_MS - IST_MS;

async function load(kind, from, to) {
  const now = Date.now();
  const days = [];
  for (let d = dayStart(from); d < to; d += DAY_MS) days.push(d);
  const stale = days.filter((d) => {
    const s = g.__shards.get(`${kind}:${d}`);
    return !s || now - s.at > (d + DAY_MS + 3600e3 < now ? CLOSED_TTL : OPEN_TTL);
  });
  // contiguous runs -> one scan each
  for (let i = 0; i < stale.length;) {
    let j = i;
    while (j + 1 < stale.length && stale[j + 1] === stale[j] + DAY_MS) j += 1;
    const run = stale.slice(i, j + 1);
    const { index, source, filter } = KINDS[kind];
    const p = scan(index, { from: run[0], to: run[run.length - 1] + DAY_MS, source, filter }).then((rows) => {
      const by = new Map(run.map((d) => [d, []]));
      for (const r of rows) by.get(dayStart(r._t))?.push(r);
      return by;
    });
    for (const d of run) g.__shards.set(`${kind}:${d}`, { at: now, p: p.then((by) => by.get(d)) });
    p.catch(() => run.forEach((d) => g.__shards.delete(`${kind}:${d}`)));
    i = j + 1;
  }
  const lists = await Promise.all(days.map((d) => g.__shards.get(`${kind}:${d}`).p));
  while (g.__shards.size > MAX_SHARDS) g.__shards.delete(g.__shards.keys().next().value);
  return lists.flat().filter((r) => r._t >= from && r._t < to);
}

export const loadUts = (from, to) => load('uts', from, to);
export const loadEvents = (from, to) => load('events', from, to);
export const loadTxns = (from, to) => load('txn', from, to);

const before = (t) => ({ range: { createdOn: { lt: t, format: 'epoch_millis' } } });
const after = (t) => ({ range: { createdOn: { gte: t, format: 'epoch_millis' } } });

// Earliest row ever for each visitor (first touch that predates the selected range).
export const earliestHits = (gas, from) => termsFetch(IDX.uts, 'ga.keyword', gas.map((k) => `GA1.2.${k}`), { source: UTS_SRC, filter: [before(from)], collapse: 'ga.keyword', size: 1000 });
// Assignments made before the range, so a returning visitor keeps the original variant.
export const earlierAssignments = (gas, from) => termsFetch(IDX.events, '_ga.keyword', gas.flatMap(gaForms), { source: EVT_SRC, filter: [before(from), after(from - 90 * DAY_MS), { bool: { minimum_should_match: 1, should: EXP_FILTER.bool.should.slice(1).concat({ terms: { 'eventName.keyword': ['ab_experiment_assigned', 'experiment_viewed', 'legal_experts_listing_experiment_landing'] } }) } }] });
export const earlierDataHits = (gas, from) => termsFetch(IDX.uts, 'ga.keyword', gas.map((k) => `GA1.2.${k}`), { source: UTS_SRC, filter: [before(from), { exists: { field: 'data.onboardingDesign' } }] });
export const hitsByTicket = (tickets) => termsFetch(IDX.uts, 'ticketId.keyword', tickets.map(String), { source: UTS_SRC });
export const hitsByGa = (gas) => termsFetch(IDX.uts, 'ga.keyword', gas.map((k) => `GA1.2.${k}`), { source: UTS_SRC, size: 10000 });
export const eventsByGa = (gas) => termsFetch(IDX.events, '_ga.keyword', gas.flatMap(gaForms), { source: EVT_SRC, filter: [EXP_FILTER], size: 10000 });
const REG_SRC = ['prid', 'metadata.ticketId', 'metadata.uuid', 'metadata.serviceId', 'serviceId', 'uuid', 'ticketId', 'workflowName', 'experimentName', 'content.title', 'title', 'priceBreakups.payableAmount'];
export const registryByPrid = (prids) => termsFetch(IDX.registry, 'prid.keyword', prids, { source: REG_SRC });
export const registryByUuid = (uuids) => termsFetch(IDX.registry, 'metadata.uuid.keyword', uuids, { source: REG_SRC });
export const nativeSuccess = (prids) => termsFetch(IDX.native, 'requestId.keyword', prids, { source: ['requestId', 'amount', 'gateway', 'entity', 'currency', 'txnid', 'mihpayid', 'id', 'status'], filter: [{ term: { 'logType.keyword': 'payment success' } }] });
export const txnsByPrid = async (prids) => termsFetch(IDX.txn, 'requestId.keyword', prids.flatMap((p) => [p, ...Array.from({ length: 9 }, (_, i) => `${p}-${i + 1}`)]), { source: TXN_SRC });
export const txnsByTicket = (tickets) => termsFetch(IDX.txn, 'ticketId', tickets.map(Number).filter(Number.isFinite), { source: TXN_SRC });
export const nativeByTxn = async (id) => [...await termsFetch(IDX.native, 'id.keyword', [id], { source: ['requestId'] }), ...await termsFetch(IDX.native, 'mihpayid.keyword', [id], { source: ['requestId'] })];
