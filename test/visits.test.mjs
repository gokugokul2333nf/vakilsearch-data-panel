import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUser, prepHits, splitVisits } from '../lib/journeys.js';
import { applyFilters, funnel, groupTouches, landingOf, reached, rollup } from '../lib/metrics.js';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/156.0.0.0 Safari/537.36';
const QE = 'https://qe.vakilsearch.com';
const PAY = 'https://qe-pay.vakilsearch.com';
const GA = '1.1000000000';
const P1 = '11111111-1111-4111-8111-111111111111';
const DAY = 864e5; const MIN = 60e3;
const T0 = Date.parse('2026-11-25T10:00:00+05:30');
let n = 0;
const hit = (url, t, x = {}) => ({ _id: `v${n += 1}`, _t: t, ga: `GA1.2.${GA}`, url, navigation: 'ingress', userAgent: UA, ...x });
const pay = (x = {}) => ({ prid: P1, status: 'success', ts: T0 + DAY + 12 * MIN, ticketId: '4540200', serviceId: '1', amount: 5000, uuid: 'U1', ...x });
const make = (rows, payments, opt = {}) => buildUser(GA, { hits: prepHits(rows), payments, from: T0 - DAY, ...opt });

// The reported case: day 1 trademark lead (no payment), day 2 organic company-registration lead + payment.
const twoDays = () => [
  hit(`${QE}/trademark-registration`, T0),
  hit(`${QE}/trademark-registration`, T0 + 2 * MIN, { navigation: 'cart', ticketId: 4540100, serviceId: 78 }),
  hit(`${QE}/private-limited-company-registration`, T0 + DAY, { referrer: 'https://www.google.com/' }),
  hit(`${QE}/private-limited-company-registration`, T0 + DAY + 3 * MIN, { navigation: 'cart', ticketId: 4540200, serviceId: 1 }),
  hit(`${PAY}/vs/checkout?k=${P1}`, T0 + DAY + 8 * MIN, { navigation: 'checkout', ticketId: 4540200, serviceId: 1 }),
  hit(`${PAY}/vs/success?k=${P1}`, T0 + DAY + 12 * MIN, { navigation: 'payment-done', ticketId: 4540200 }),
];

test('payment is credited to the landing visit that created its ticket, not the first landing', () => {
  const p = pay();
  const u = make(twoDays(), [p]);
  assert.equal(u.firstLanding, '/trademark-registration'); // first touch is kept as history
  assert.equal(landingOf(u, 'first'), '/trademark-registration');
  assert.equal(u.convertingLanding, '/private-limited-company-registration');
  assert.equal(landingOf(u, 'visit'), '/private-limited-company-registration');
  assert.equal(u.convertingTouch.channel, 'Organic search');
  assert.equal(p.landing.key, '/private-limited-company-registration');
  assert.equal(p.landing.via, 'lead page');
  assert.equal(u.attempts.length, 2);
});

test('landing pages: lead counted on both pages, payment and revenue only on the paying page', () => {
  const u = make(twoDays(), [pay()]);
  const rows = Object.fromEntries(groupTouches([u], 'visit', (t) => t.page).map((r) => [r.key, r]));
  const tm = rows['/trademark-registration']; const co = rows['/private-limited-company-registration'];
  assert.equal(tm.landed, 1); assert.equal(tm.onboarding, 1); assert.equal(tm.checkout, 0); assert.equal(tm.payments, 0); assert.equal(tm.revenue, 0);
  assert.equal(co.landed, 1); assert.equal(co.onboarding, 1); assert.equal(co.checkout, 1); assert.equal(co.payments, 1); assert.equal(co.revenue, 5000);
  // revenue adds up across pages: never counted twice
  assert.equal(Object.values(rows).reduce((s, r) => s + r.revenue, 0), rollup([u]).revenue);
  // channel split follows each visit's own source
  const ch = Object.fromEntries(groupTouches([u], 'visit', (t) => t.attr.channel).map((r) => [r.key, r]));
  assert.equal(ch.Direct.payments, 0); assert.equal(ch['Organic search'].revenue, 5000);
});

test('landing filter + funnel: the trademark funnel stops at lead, the company funnel reaches payment', () => {
  const u = make(twoDays(), [pay()]);
  const [tm] = applyFilters([u], { model: 'visit', landing: '/trademark-registration' });
  const [co] = applyFilters([u], { model: 'visit', landing: '/private-limited-company-registration' });
  assert.equal(reached(tm, 'start'), true); assert.equal(reached(tm, 'paid'), false); assert.equal(tm.payments.length, 0); assert.equal(tm.lastStage, 'start');
  assert.equal(reached(co, 'paid'), true); assert.equal(co.revenue, 5000);
  const f = Object.fromEntries(funnel([tm]).map((r) => [r.id, r.users]));
  assert.equal(f.landing, 1); assert.equal(f.start, 1); assert.equal(f.paid, 0);
  // under first touch the old person-level behaviour is unchanged
  assert.equal(applyFilters([u], { model: 'first', landing: '/trademark-registration' })[0].revenue, 5000);
});

test('no ticket on the rows: payment falls back to the visit of its checkout', () => {
  const rows = twoDays().map((h) => ({ ...h, ticketId: undefined }));
  const p = pay({ ticketId: '' });
  make(rows, [p]);
  assert.equal(p.landing.key, '/private-limited-company-registration');
  assert.equal(p.landing.via, 'checkout visit');
});

test('nothing links the payment: last landing within 30 days, and none after that', () => {
  const near = pay({ ticketId: '', prid: 'x' });
  make([hit(`${QE}/llp-registration`, T0)], [near]);
  assert.equal(near.landing.via, 'last landing (30 days)');
  const far = pay({ ticketId: '', prid: 'x', ts: T0 + 40 * DAY });
  make([hit(`${QE}/llp-registration`, T0)], [far]);
  assert.equal(far.landing, null);
});

test('landing saved on the lead by the website wins over inference', () => {
  const p = pay({ saved: { url: `${QE}/company-registration?utm_source=google&utm_medium=cpc&utm_campaign=PVT`, referrer: '', ts: T0 + DAY - 5 * MIN } });
  const u = make(twoDays(), [p]);
  assert.equal(p.landing.key, '/company-registration'); assert.equal(p.landing.via, 'saved on lead');
  assert.equal(u.convertingLanding, '/company-registration'); assert.equal(u.convertingTouch.campaign, 'PVT');
  // the ticket's checkout moved with it, so the inferred page keeps only its own lead
  const rows = Object.fromEntries(groupTouches([u], 'visit', (t) => t.page).map((r) => [r.key, r]));
  assert.equal(rows['/private-limited-company-registration'].checkout, 0);
  assert.equal(rows['/company-registration'].payments, 1);
});

test('direct return carries the last campaign within 30 days (Mixpanel last touch)', () => {
  const p = pay();
  const rows = twoDays();
  rows[0] = hit(`${QE}/trademark-registration?utm_source=google&utm_medium=cpc&utm_campaign=TM`, T0);
  rows[2] = hit(`${QE}/private-limited-company-registration`, T0 + DAY); // typed in, no referrer
  const u = make(rows, [p]);
  assert.equal(u.convertingLanding, '/private-limited-company-registration'); // the page is still the paying visit
  assert.equal(u.convertingTouch.campaign, 'TM'); assert.equal(u.convertingTouch.carried, true);
});

test('same visit, lead on a second page starts a new landing visit', () => {
  const p = pay({ ts: T0 + 20 * MIN, ticketId: '4540300' });
  const u = make([
    hit(`${QE}/trademark-registration`, T0),
    hit(`${QE}/company-registration`, T0 + 2 * MIN, { navigation: 'navigate' }),
    hit(`${QE}/company-registration`, T0 + 4 * MIN, { navigation: 'cart', ticketId: 4540300, serviceId: 1 }),
    hit(`${PAY}/vs/checkout?k=${P1}`, T0 + 10 * MIN, { navigation: 'checkout', ticketId: 4540300 }),
  ], [p]);
  assert.deepEqual(u.attempts.map((a) => a.page), ['/trademark-registration', '/company-registration']);
  assert.equal(u.attempts[1].ts, T0 + 2 * MIN); // starts at the page view, not at the form submit
  assert.equal(p.landing.key, '/company-registration');
});

test('visits split on 30 min inactivity, a new session id, or a new campaign', () => {
  const v = splitVisits(prepHits([
    hit(`${QE}/a`, T0), hit(`${QE}/b`, T0 + 20 * MIN, { navigation: 'navigate' }), // same visit
    hit(`${QE}/c`, T0 + 60 * MIN), // gap
    hit(`${QE}/d?utm_source=fb&utm_medium=paid_social`, T0 + 62 * MIN), // new campaign
    hit(`${QE}/e`, T0 + 63 * MIN, { sessionId: 's1' }), hit(`${QE}/f`, T0 + 64 * MIN, { sessionId: 's2', navigation: 'navigate' }),
  ]));
  assert.deepEqual(v.map((x) => x.hits.length), [2, 1, 2, 1]);
});
