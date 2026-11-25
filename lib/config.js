export const IDX = {
  uts: process.env.UTS_INDEX || 'vakilsearch-site-users-track',
  events: process.env.EVENTS_INDEX || 'vakilsearch_event_tracking',
  registry: process.env.REQUEST_REGISTRY_INDEX || 'test_payway_request_registry',
  txn: process.env.TRANSACTION_LOGS_INDEX || 'test_payway_transaction_logs',
  native: process.env.NATIVE_PG_LOGS_INDEX || 'test_payway_native_pg_logs',
};

// Throws unless every guard says this is QE.
export function assertQe(env = process.env) {
  if (env.APP_ENV !== 'qe') throw new Error('APP_ENV must be "qe"');
  const host = new URL(env.ES_QE_URL || '').hostname;
  if (!env.QE_ES_HOST || host !== env.QE_ES_HOST) throw new Error('ES_QE_URL host is not the pinned QE host');
  if (/prod/i.test(host)) throw new Error('Refusing a production Elasticsearch host');
  for (const k of ['registry', 'txn', 'native']) {
    if (!IDX[k].startsWith('test_')) throw new Error(`${k} index "${IDX[k]}" is not a QE (test_) index`);
  }
}

export const MAX_RANGE_DAYS = 180;
export const SESSION_GAP_MS = 30 * 60 * 1000;
export const DEDUPE_MS = 5000;
export const IST_MS = 330 * 60 * 1000;
export const DAY_MS = 86400000;
