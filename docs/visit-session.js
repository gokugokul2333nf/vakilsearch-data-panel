// Reference implementation for docs/tracking-spec.md (website side, not used by this dashboard).
// Visit id `vs_sid` + visit context `vs_visit`, shared by every *.vakilsearch.com host (qe, qe-pay, ...),
// 30 minutes rolling. In the website: export touchVisit() and call it on every page view and before
// every tracking call. To try it in a browser: paste this whole file into the DevTools console, then run touchVisit().

const VISIT_MAX_AGE = 30 * 60; // seconds; each call pushes the expiry 30 min ahead
const CAMPAIGN_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid'];
const OWN_SITES = /(^|\.)(vakilsearch\.com|zolvit\.com|payu\.in|razorpay\.com)$/i; // never an acquisition source

function visitRootDomain() {
  const m = location.hostname.match(/(?:^|\.)(vakilsearch\.com|zolvit\.com)$/i);
  return m ? `.${m[1].toLowerCase()}` : ''; // localhost: host-only cookie
}
function readVisitCookie(name) {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}
function writeVisitCookie(name, value) {
  const domain = visitRootDomain();
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${VISIT_MAX_AGE}; Path=/; SameSite=Lax`
    + (location.protocol === 'https:' ? '; Secure' : '') + (domain ? `; Domain=${domain}` : '');
}
function newVisitId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = crypto.getRandomValues(new Uint8Array(1))[0] & 15;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}
// only campaign parameters survive: no tokens, magic keys, email or phone
function campaignOf(href) {
  const q = new URL(href).searchParams;
  return CAMPAIGN_KEYS.filter((k) => q.get(k)).map((k) => `${k}=${encodeURIComponent(q.get(k))}`).join('&');
}
function outsideReferrer() {
  try { const r = new URL(document.referrer); return OWN_SITES.test(r.hostname) ? '' : `${r.origin}${r.pathname}`; } catch { return ''; }
}

function touchVisit() {
  let sid = readVisitCookie('vs_sid');
  let visit = null;
  try { visit = JSON.parse(readVisitCookie('vs_visit') || 'null'); } catch { visit = null; }

  // zolvit.com cannot read .vakilsearch.com cookies: it passes the id in the URL when it sends people to checkout
  const handoff = new URL(location.href).searchParams.get('vs_sid');
  if (handoff && /^[0-9a-f-]{36}$/i.test(handoff) && handoff !== sid) {
    sid = handoff;
    visit = { sid, start: Date.now(), landingUrl: '', referrer: '', campaign: '', handoff: true };
  }

  const campaign = campaignOf(location.href);
  const referrer = outsideReferrer();
  const isNew = !sid || !visit || visit.sid !== sid
    || Boolean(campaign && campaign !== visit.campaign) // arrived from a different campaign link
    || Boolean(referrer && referrer !== visit.referrer); // arrived from another site (Google, partner, ...)
  if (isNew) {
    sid = newVisitId();
    const u = new URL(location.href);
    visit = { sid, start: Date.now(), landingUrl: `${u.origin}${u.pathname}${campaign ? `?${campaign}` : ''}`, referrer, campaign };
  }
  writeVisitCookie('vs_sid', sid);
  writeVisitCookie('vs_visit', JSON.stringify(visit));
  return { sessionId: sid, visit, isNew };
}

// Where to call it in the website (names are examples; use the real ones):
//   1. every page view: on load and on each client-side route change (Next.js: router.events 'routeChangeComplete')
//   2. user-track payload:        { ...row, sessionId: touchVisit().sessionId }
//   3. lead form submit:          send touchVisit().visit to the API that creates the ticket; save it on the ticket
//   4. payment request (payway):  copy the ticket's visit into metadata.landing = { url, referrer, ts, sessionId }
//   5. zolvit -> checkout link:   append `vs_sid=<touchVisit().sessionId>` to the qe-pay URL
