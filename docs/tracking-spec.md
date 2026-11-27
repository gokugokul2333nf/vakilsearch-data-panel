# Tracking spec: visit id and landing page on the lead

For: the website (vakilsearch-next / zolvit), user-track (UTS) and payway teams.
Why: the attribution dashboard must credit each payment to the landing page the customer bought from. Today it infers this from the lead's `ticketId`. These fields make it exact, including payments made later, from a payment link, or on another device.

## Example the fields must handle

| Day | Customer | Must be recorded as |
|---|---|---|
| 1 | Lands on `/trademark-registration` (direct), fills the lead form | Lead for trademark, landing `/trademark-registration`, source direct |
| 2 | Lands on `/private-limited-company-registration` from Google, fills the lead form, pays | Payment for company registration, landing `/private-limited-company-registration`, source google / organic |

The same GA id is used on both days. The day-1 visit must never get credit for the day-2 payment.

## 1. Visit id: cookie `vs_sid`

- Value: a random UUID v4.
- Cookie: `Domain=.vakilsearch.com`, `Path=/`, `SameSite=Lax`, `Secure`. It is readable by the tracking script, so not `HttpOnly`.
- **Use a cookie, not `sessionStorage`.** `sessionStorage` is per tab and per host, so it is lost when the customer returns from the payment gateway to `qe-pay.vakilsearch.com`.
- **Rolling 30-minute expiry.** Rewrite the cookie with `Max-Age=1800` on every tracked page view or event. Do not use a shorter timeout: lead forms, onboarding and payment OTP or UPI approval often take more than 3 minutes without a page load.
- Start a new visit (new `vs_sid`) when any of these is true:
  1. The cookie is missing or expired.
  2. The URL has `utm_*`, `gclid`, `gbraid`, `wbraid`, `fbclid` or `msclkid` values that differ from the current visit's.
  3. `document.referrer` is an outside host. Our own sites and payment gateways do not count: vakilsearch, zolvit, payu, razorpay.
- When a visit starts, also store its context in a cookie `vs_visit` (same attributes, URL-encoded JSON, under 1 KB):
  ```json
  { "sid": "…", "start": 1764050400000, "landingUrl": "https://qe.vakilsearch.com/private-limited-company-registration?utm_source=…", "referrer": "https://www.google.com/" }
  ```
  `landingUrl` keeps only `utm_*` and click-id parameters. Drop tokens, magic keys, email and phone.
- zolvit.com cannot read a `.vakilsearch.com` cookie. When zolvit sends a customer to checkout on `qe-pay.vakilsearch.com`, pass the visit id as `vs_sid=<id>` in the redirect URL, and have the pay host adopt it.

## 2. Device id: cookie `vs_did` (optional)

- A random UUID v4, set **by the server** in the HTML response (`Set-Cookie`, `Max-Age=34560000` (400 days, the browser maximum), same domain and attributes as above).
- Reason: Safari deletes cookies set from JavaScript, including `_ga`, after 7 days. A returning Safari customer then looks like a new person.
- The dashboard reads it but does not use it yet. It will be used to link browsers to the account UUID.

## 3. Send on every user-track row

Add these two top-level fields to every document written to `vakilsearch-site-users-track`:

| Field | Value |
|---|---|
| `sessionId` | current `vs_sid` |
| `deviceId` | current `vs_did`, if set |

Also add both under `eventProperties` in `vakilsearch_event_tracking`.

## 4. Save the landing on the lead

When a lead form creates a ticket, save the visit context from `vs_visit` on the ticket:
`landingUrl`, `landingReferrer`, `landingTs` (the visit start), `sessionId`, `deviceId`, `ga`.

## 5. Copy it into the payment request

When payway creates a payment request for a ticket (`payway_request_registry`), copy the ticket's values into:

```json
"metadata": {
  "landing": { "url": "<landingUrl>", "referrer": "<landingReferrer>", "ts": 1764050400000, "sessionId": "…", "deviceId": "…" }
}
```

The dashboard reads `metadata.landing.url`, `referrer` and `ts`. This is the most important change. It ties the payment to its landing page however the customer paid: the same visit, a later visit, a payment link sent on WhatsApp, or another device.

## Related existing bug

`landingUrl` is empty on every QE user-track row. UTS looks up the first page in the alias `vakilsearch-site-users`, which points to an old index holding one document. Fixing that alias alone would only give the first page ever (first touch). It does not replace steps 4–5.

## How the dashboard uses it

Order used for each payment (`lib/journeys.js buildAttempts`):

1. `metadata.landing` (step 5): "saved on lead"
2. the visit that created the payment's ticket: "lead page"
3. the visit of its checkout: "checkout visit"
4. the last landing page within 30 days: "last landing (30 days)"

`sessionId` (step 3) replaces the 30-minute guess when splitting visits.

## Checks before release (on QE)

1. Run the two-day example above. In the dashboard: Users → the GA id shows "Converted from: /private-limited-company-registration". Landing Pages shows trademark with a lead and no payment, and company registration with the payment.
2. Pay from a payment link on a second device. The payment still shows the company-registration landing, matched by "saved on lead".
3. Go from zolvit.com to checkout. The checkout row has the same `sessionId` as the zolvit landing row.
4. Data Health → "How each matched payment found its landing page": the "saved on lead" share grows as new leads come in.
