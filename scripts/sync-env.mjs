// Builds .env.local from the QE values already kept in the sibling repos. Prints names, never secrets.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file, key) => {
  const line = fs.readFileSync(path.join(root, file), 'utf8').split('\n').find((l) => new RegExp(`^${key}\\s*=`).test(l));
  return line ? line.replace(/^[^=]*=\s*/, '').trim().replace(/^['"]|['"]$/g, '') : '';
};
const es = read('vakilsearch-next/.env', 'ES_QE_URL');
if (!es) throw new Error('ES_QE_URL not found in vakilsearch-next/.env');
const host = new URL(es).hostname;
if (/production|prod/i.test(host)) throw new Error('ES_QE_URL points at production; refusing');
const out = {
  APP_ENV: 'qe',
  ES_QE_URL: es,
  QE_ES_HOST: host,
  UTS_INDEX: 'vakilsearch-site-users-track', // micro-js-user-tracking/src/service/handlers.js
  EVENTS_INDEX: 'vakilsearch_event_tracking', // micro-js-event-tracking/src/workers/vakilsearch-event-tracking.js
  REQUEST_REGISTRY_INDEX: 'test_payway_request_registry', // next-payments/next.config.js (non-prod)
  TRANSACTION_LOGS_INDEX: 'test_payway_transaction_logs',
  NATIVE_PG_LOGS_INDEX: 'test_payway_native_pg_logs',
};
const file = path.join(import.meta.dirname, '../.env.local');
fs.writeFileSync(file, `${Object.entries(out).map(([k, v]) => `${k}=${v}`).join('\n')}\n`, { mode: 0o600 });
console.log(`.env.local written: ${Object.keys(out).join(', ')}`);
