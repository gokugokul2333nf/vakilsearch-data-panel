# QE attribution dashboard

Read-only marketing attribution, onboarding funnel and user journey analytics on **QE** data. Nothing here writes to Elasticsearch, and no tracking code was changed.

```
npm run env        # fills .env.local from ../vakilsearch-next/.env (QE values only)
npm run dev        # http://localhost:3120, bound to this machine
npm test           # rules: channels, identity, dedupe, payments, funnel, variants, QE guard
npm run validate   # recomputes totals with direct ES queries and compares
node scripts/scenarios.mjs   # needs the dev server; walks real users for each QA scenario
```

## QE isolation
- The app refuses to query unless `APP_ENV=qe`, the ES host equals the pinned `QE_ES_HOST`, the host name does not contain `prod`, and payment indices start with `test_`.
- The ES client exposes search and count only. Use a read-only ES user before hosting it: the repos' QE URL carries the `elastic` superuser.
- A production build serves nothing until `DASHBOARD_USER` and `DASHBOARD_ACCESS_KEY` are set (HTTP Basic).
- Cookies, email and phone are never requested from ES. URLs are cut down to utm / click-id params, and magic keys in paths are masked.

## Field mapping (verified on QE, 25 Nov 2026)
| Needed | Source | Field | Available |
|---|---|---|---|
| Person | `vakilsearch-site-users-track` | `ga` | Yes |
| Account UUID | `test_payway_request_registry` | `metadata.uuid` | Only after a checkout; user-track has none |
| Landing URL | user-track | earliest `url` | Derived. `landingUrl` is empty on every QE row |
| UTM, gclid, fbclid | user-track | `url` query | When present in the URL |
| Experiment, variant | user-track | `data.onboardingExperiment`, `data.onboardingDesign` | Rows since 25 Nov 2026 02:05 IST. The first journey had the experiment name only on the landing row; onboarding, checkout and payment rows had the variant but an empty experiment, page and landingUrl |
| Experiment, variant | `vakilsearch_event_tracking` | `eventProperties.abExperiment/abVariant`, `onboardingExperiment/onboardingDesign`, `experimentId/variationId` | Yes |
| Onboarding | user-track pages, event tracking | `/onboarding*`, `step-N`, step events | Yes |
| Checkout | user-track | `navigation = checkout` | Yes |
| Payment status | `test_payway_transaction_logs` | `status` | Yes |
| Amount, transaction id | `test_payway_native_pg_logs` | `amount` (Razorpay in paise), `mihpayid` / `id` | Yes |
| Payment ↔ journey | both | payment id in checkout URL, `ticketId` | Yes |
| Payment ↔ landing page | user-track | `ticketId` on the lead row (`navigation = cart`), whose `url` is the page with the form | Yes |
| Landing saved on the lead | payment registry | `metadata.landing.url / referrer / ts` | Not yet: see [docs/tracking-spec.md](docs/tracking-spec.md) |
| Visit id | user-track | `sessionId` | Not yet: visits are split by 30 min inactivity until it exists |
| QE Postgres | – | `pg_hba.conf` rejects this machine's IP | Not used |
| Mixpanel | – | account blocked for non-payment, 23 Nov 2026 | Not used |

`landingUrl` is empty because UTS writes to `vakilsearch-site-users-track` on QE but looks the first page up in `vakilsearch-site-users`, an alias to an old index holding one document. The same lookup feeds UTS source inheritance.

## Rules
- **Identity** (`lib/journeys.js resolveIdentity`): person = GA client id. Browsers merge only when each used exactly one account UUID and it is the same one. Shared browsers stay separate and are flagged. IP is never used.
- **Payment match** (`matchPayment`): payment id on the success page, then on checkout, then a ticket seen by exactly one person. Otherwise unattributed.
- **Revenue**: gateway `success` rows only, one per payment request, gateway amount.
- **Landing visit** (default model, Mixpanel-like): each landing page visit is an attempt, and each lead, checkout and payment belongs to the attempt that produced it (`lib/journeys.js buildAttempts`). Payment → landing page: `metadata.landing` saved on the lead, else the visit that created the payment's ticket, else the visit of its checkout, else the last landing within 30 days. A visit ends after 30 min idle, a new `sessionId`, or a new campaign / outside referrer; a lead on a second page in the same visit starts a new attempt. A direct visit carries the last campaign within 30 days. Grouped reports count a person once per group with only that group's stages and payments (`lib/metrics.js groupTouches / project`), so revenue adds up.
- **First touch** is the earliest row ever, also before the range. **Last touch** is the last non-direct entry before the first payment. Both credit the person as a whole; pick them from the model menu.
- **Variant**: first recorded assignment wins (90-day lookback). Only later actions count; checkout and revenue only for services or tickets named by that experiment's events.
- **Funnel**: closed cohort of people who landed in range; stages count at or after that landing. Assignment, progress and completion are optional stages.
- **Dedupe**: same person, page and kind within 5 s is one view. Sessions split at 30 min.
- **Scope**: `https://qe*.vakilsearch.com / zolvit.com` by default; localhost and crawlers are off and can be switched on from the workspace menu.
- **Time**: Asia/Kolkata.

## How it stays fast
Days are read once (trimmed `_source`) and kept as in-memory shards: closed days 1 hour, today 1 minute. All pages compute from the same in-memory journeys, so totals agree and every number drills down. User detail uses its own queries. Ranges are capped at 180 days. This suits QE volume (about 10k rows a month); production volume would need a transform or a warehouse table instead.
