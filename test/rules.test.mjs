import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../lib/taxonomy.js';
import { buildUser, matchPayment, prepHits, reducePayments, resolveIdentity } from '../lib/journeys.js';
import { experiments, funnel, rollup } from '../lib/metrics.js';
import { assertQe } from '../lib/config.js';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/156.0.0.0 Safari/537.36';
let n = 0;
const hit = (ga, url, t, x = {}) => ({ _id: `i${n += 1}`, _t: t, ga: `GA1.2.${ga}`, url, navigation: 'ingress', userAgent: UA, ...x });
const P1 = '11111111-1111-4111-8111-111111111111';
const user = (rows, opt = {}) => buildUser('1.1000000000', { hits: prepHits(rows), ...opt });
const QE = 'https://qe.vakilsearch.com';

test('channel rules never claim paid or organic without evidence', () => {
  assert.equal(T.attribution({ url: `${QE}/a?gclid=x`, navigation: 'ingress' }).type, 'paid');
  assert.equal(T.attribution({ url: `${QE}/a?fbclid=x`, navigation: 'ingress' }).type, 'unknown');
  assert.equal(T.attribution({ url: `${QE}/a?fbclid=x&utm_medium=paid_social`, navigation: 'ingress' }).channel, 'Meta Ads');
  assert.equal(T.attribution({ url: `${QE}/a`, referrer: 'https://www.google.com/', navigation: 'ingress' }).channel, 'Organic search');
  assert.equal(T.attribution({ url: `${QE}/a`, referrer: 'https://test.payu.in/', navigation: 'ingress' }).channel, 'Unattributed');
  assert.equal(T.attribution({ url: `${QE}/a`, navigation: 'ingress' }).channel, 'Direct');
  assert.equal(T.attribution({ url: `${QE}/a`, navigation: 'navigate' }).channel, 'Unattributed');
});

test('tokens and magic keys never leave the API', () => {
  const s = T.safeUrl('https://qe-grc.vakilsearch.com/grc/upload-documents/jMdmxU9TPQ?token=abc&utm_source=crm&ticketMagicKey=q');
  assert.ok(!/abc|jMdmxU9TPQ|MagicKey/.test(s)); assert.ok(s.includes('utm_source=crm'));
});

test('page classes and base paths', () => {
  assert.equal(T.classifyPage(`${QE}/tax/ad-gst-registration?x=1`).key, '/ad-gst-registration');
  assert.equal(T.classifyPage(`${QE}/onboarding-v1/step-2`).kind, 'onboarding');
  assert.equal(T.classifyPage('https://qe-pay.vakilsearch.com/vs/checkout?k=1').kind, 'checkout');
  assert.equal(T.classifyPage('https://qe-grc.vakilsearch.com/grc/dashboard').kind, 'app');
  assert.equal(T.hostScope('http://localhost:3000/tax'), 'other');
});

test('double page loads count once', () => {
  const h = prepHits([hit('1.1000000000', `${QE}/a`, 1000), hit('1.1000000000', `${QE}/a`, 2500), hit('1.1000000000', `${QE}/a`, 90000)]);
  assert.equal(h.filter((x) => x.isView).length, 2);
});

test('first landing and first variant survive later visits', () => {
  const u = user([
    hit('1.1000000000', `${QE}/ad-gst-registration?utm_source=google&utm_medium=cpc&utm_campaign=GST`, 1000),
    hit('1.1000000000', `${QE}/ad-gst-registration?onboarding_design=v2`, 2000, { navigation: 'navigate', data: { event: 'onboarding_experiment_assigned', onboardingExperiment: 'AD-GST-REG-ONBOARDING-EXP', onboardingDesign: 'v2', assignmentSource: 'experiment' } }),
    hit('1.1000000000', `${QE}/llp-registration`, 9e6),
    hit('1.1000000000', `${QE}/ad-gst-registration`, 9.1e6, { data: { onboardingExperiment: 'AD-GST-REG-ONBOARDING-EXP', onboardingDesign: 'v3' } }),
  ]);
  assert.equal(u.firstLanding, '/ad-gst-registration'); assert.equal(u.firstTouch.campaign, 'GST');
  assert.equal(u.lastTouch.campaign, 'GST'); // a direct return does not erase the campaign
  assert.equal(u.assignments[0].variant, 'v2'); assert.deepEqual(u.assignments[0].conflict, ['v3']);
  assert.equal(u.sessions, 2);
});

test('payment counts once, uses gateway amount, paise handled', () => {
  const [p] = reducePayments([{ requestId: `${P1}-1`, status: 'failed', gateway: 'payU', _t: 1 }, { requestId: `${P1}-2`, status: 'success', gateway: 'payU', ticketId: 4540000, _t: 2 }, { requestId: `${P1}-2`, status: 'success', gateway: 'payU', _t: 3 }], [{ prid: P1, metadata: { uuid: 'U', serviceId: '78' }, priceBreakups: { payableAmount: 9999 } }], [{ requestId: P1, amount: '1499.00', gateway: 'payU' }]);
  assert.equal(p.status, 'success'); assert.equal(p.amount, 1499); assert.equal(p.ts, 2);
  const [r] = reducePayments([{ requestId: P1, status: 'success', gateway: 'razorpay', _t: 1 }], [], [{ requestId: P1, amount: 9900, gateway: 'razorpay' }]);
  assert.equal(r.amount, 99);
});

test('ambiguous payments stay unattributed', () => {
  const canon = (x) => x; const p = { prid: P1, ticketId: '4540000' };
  const two = new Map([['4540000', [{ gk: 'a' }, { gk: 'b' }]]]);
  assert.equal(matchPayment(p, new Map(), two, canon).person, '');
  assert.equal(matchPayment(p, new Map([[P1, [{ gk: 'a', navigation: 'payment-done' }, { gk: 'b', navigation: 'checkout' }]]]), two, canon).person, 'a');
  assert.equal(matchPayment(p, new Map(), new Map(), canon).person, '');
});

test('browsers merge only on one shared account UUID', () => {
  const c = resolveIdentity(new Map([['a', new Set(['U1'])], ['b', new Set(['U1'])], ['c', new Set(['U1', 'U2'])]]));
  assert.equal(c('b'), c('a')); assert.equal(c('c'), 'c');
});

test('funnel: no experiment is fine, stages before landing do not count', () => {
  const plain = user([hit('1.1000000000', `${QE}/a`, 1e6), hit('1.1000000000', `https://qe-pay.vakilsearch.com/vs/checkout?k=${P1}`, 2e6, { navigation: 'checkout' })]);
  const payFirst = user([hit('1.1000000000', `https://qe-pay.vakilsearch.com/vs/checkout?k=${P1}`, 1e6, { navigation: 'checkout' }), hit('1.1000000000', `${QE}/a`, 9e6)]);
  const f = Object.fromEntries(funnel([plain, payFirst]).map((r) => [r.id, r.users]));
  assert.equal(f.landing, 2); assert.equal(f.assigned, 0); assert.equal(f.checkout, 1);
  assert.equal(rollup([plain]).checkout, 1);
});

test('variant revenue ignores payments before assignment and for other services', () => {
  const e = (t) => ({ _t: t, eventTime: t, eventName: 'ab_experiment_assigned', serviceId: 78, url: `${QE}/tm`, eventProperties: { abExperiment: 'TM', abVariant: 'v2' } });
  const pay = (ts, serviceId, amount) => ({ status: 'success', ts, serviceId, amount });
  const u = user([hit('1.1000000000', `${QE}/tm`, 1e6)], { events: [e(2e6)], payments: [pay(1e6, '78', 5), pay(3e6, '248', 7), pay(4e6, '78', 11)] });
  const [x] = experiments([u]);
  assert.equal(x.variants[0].revenue, 11); assert.equal(x.variants[0].payers, 1);
});

test('QE guard refuses production', () => {
  assert.throws(() => assertQe({ APP_ENV: 'production' }));
  assert.throws(() => assertQe({ APP_ENV: 'qe', ES_QE_URL: 'https://vs-production.es.x:9243', QE_ES_HOST: 'vs-production.es.x' }));
  assert.throws(() => assertQe({ APP_ENV: 'qe', ES_QE_URL: 'https://a.es:9243', QE_ES_HOST: 'b.es' }));
  assertQe({ APP_ENV: 'qe', ES_QE_URL: 'https://a.es:9243', QE_ES_HOST: 'a.es' });
});

test('legal experts assignment keeps its service, so other services are not its revenue', () => {
  const a = T.assignmentFromEvent({ eventName: 'legal_experts_listing_experiment_landing', serviceId: 738, eventProperties: { value: '1' } });
  assert.equal(a.variant, 'v2'); assert.equal(a.service, '738');
});
