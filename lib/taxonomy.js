// Pure rules: page classes, marketing channels, device, event meaning. No I/O, unit-tested.

const QE_HOST = /^(qe[\w-]*\.(vakilsearch|zolvit)\.com)$/i;
const APP_HOST = /^qe-(grc|crm|helpdesk|admin)/i;
const PAY_HOST = /^qe-pay\./i;
const BASE_PATHS = /^\/(tax|business-setup|tmip|tts|ts|otherservices|legal-experts|bs)(?=\/)/i;
const KEEP_PARAMS = /^(utm_\w+|gclid|gbraid|wbraid|fbclid|msclkid|onboarding_design|onboarding_variant|onboardingVariant|src)$/;

export const parseUrl = (raw) => { try { return new URL(raw); } catch { return null; } };

const safeDecode = (v) => { try { return decodeURIComponent(v.replace(/\+/g, ' ')); } catch { return v; } };

// Never let magic links, tokens or hashes out of the API: only attribution params survive.
export function safeUrl(raw) {
  const u = parseUrl(raw);
  if (!u) return '';
  const keep = [...u.searchParams].filter(([k]) => KEEP_PARAMS.test(k));
  const qs = keep.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `${u.host}${redactPath(u.pathname)}${qs ? `?${qs}` : ''}`;
}

// App paths carry magic keys (/upload-documents/jMdmxU9TPQ); mask anything that looks like one.
export const redactPath = (p) => p.split('/').map((s) => (/^(?=.*\d)(?=.*[A-Z])[\w=-]{8,}$/.test(s) || s.length > 70 ? ':key' : s)).join('/');

export const hostScope = (raw) => {
  const u = parseUrl(raw);
  if (!u) return 'none';
  return QE_HOST.test(u.hostname) && u.protocol === 'https:' ? 'qe' : 'other';
};

export function classifyPage(raw) {
  const u = parseUrl(raw);
  if (!u) return { kind: 'other', key: '', path: '' };
  const path = (u.pathname.replace(BASE_PATHS, '').replace(/\/+$/, '') || '/');
  const host = u.hostname.replace(/^www\./, '');
  const key = host === 'qe.vakilsearch.com' ? path : `${host}${path === '/' ? '' : path}`;
  let kind = 'landing';
  if (PAY_HOST.test(host) || /^\/vs\/(checkout|success)/.test(path)) {
    kind = /\/success/.test(path) ? 'success' : /\/checkout/.test(path) ? 'checkout' : 'other';
  } else if (APP_HOST.test(host)) kind = 'app';
  else if (/\.(json|xml|txt|js|css|png|jpe?g|svg|ico|webp|map)$/i.test(path) || /^\/(404|500|_error|thank-you|cart)(\/|$)/.test(path) || /\/auth\//.test(path) || path.includes('[')) kind = 'other';
  else if (/^\/(onboarding-v1|onboarding|pre-bundle|onboard|company-onboarding)(\/|$)/.test(path) || /\/step-\d+$/.test(path)) kind = 'onboarding';
  return { kind, key, path: redactPath(path), host };
}

export const onboardingStep = (path) => {
  const m = path.match(/step-(\d+)/);
  if (m) return `step-${m[1]}`;
  const b = path.match(/bundle\/(v\d+)/);
  if (b) return `bundle ${b[1]}`;
  return path.split('/').filter(Boolean).pop() || 'onboarding';
};

const PAID = /^(cpc|ppc|paid|paidsearch|paid[_-]?social|cpm|display|sem|pmax|ads?)$/i;
const MESSAGING = /^(email|e-mail|mail|sms|whatsapp|rcs|push|newsletter)$/i;
const SEARCH = /(^|\.)(google|bing|yahoo|duckduckgo|yandex|ecosia|baidu)\./i;
const SOCIAL = /(^|\.)(facebook|instagram|linkedin|twitter|x|t|youtube|reddit|pinterest|lnkd)\.(com|co|in)$/i;
const AI = /(chatgpt|openai|perplexity|claude\.ai|gemini\.google|copilot)/i;
// Own sites, payment gateways and debug tools are never an acquisition source.
const IGNORED_REF = /(vakilsearch|zolvit|localhost|127\.0\.0\.1|payu|razorpay|tagassistant|ngrok|vercel\.app)/i;

const refHost = (r) => { const u = parseUrl(r); return u ? u.hostname.toLowerCase() : ''; };

// One entry hit -> { source, medium, campaign, term, content, clickId, channel, type }
export function attribution({ url, referrer, source, medium, navigation }) {
  const u = parseUrl(url);
  const q = (k) => safeDecode(u?.searchParams.get(k) || '').trim().slice(0, 120);
  const utm = { source: q('utm_source'), medium: q('utm_medium'), campaign: q('utm_campaign'), term: q('utm_term'), content: q('utm_content') };
  const gclid = Boolean(q('gclid') || q('gbraid') || q('wbraid'));
  const fbclid = Boolean(q('fbclid'));
  const ref = refHost(referrer);
  const ext = ref && !IGNORED_REF.test(ref) ? ref : '';
  const partner = /\/partners\/([^/?]+)/.exec(u?.pathname || '');
  let channel; let type; let src = utm.source; let med = utm.medium;

  if (gclid) { channel = 'Google Ads'; type = 'paid'; src ||= 'google'; med ||= 'cpc'; }
  else if (fbclid && PAID.test(utm.medium)) { channel = 'Meta Ads'; type = 'paid'; src ||= 'facebook'; }
  // fbclid is added to organic Facebook/Instagram clicks too, so on its own it does not prove paid.
  else if (fbclid) { channel = 'Meta click (fbclid)'; type = 'unknown'; src ||= 'facebook'; med ||= '(not set)'; }
  else if (PAID.test(utm.medium)) { channel = /google/i.test(utm.source) ? 'Google Ads' : /(facebook|meta|instagram|^fb$|^ig$)/i.test(utm.source) ? 'Meta Ads' : 'Other paid'; type = 'paid'; }
  else if (MESSAGING.test(utm.medium)) { channel = 'Email & messaging'; type = 'owned'; }
  else if (utm.medium.toLowerCase() === 'organic') { channel = 'Organic search'; type = 'organic'; }
  else if (partner) { channel = 'Partner / affiliate'; type = 'referral'; src ||= partner[1]; med ||= 'partner'; }
  else if (utm.source || utm.campaign) { channel = 'Other campaign'; type = 'unknown'; src ||= '(not set)'; med ||= '(not set)'; }
  else if (ext && AI.test(ext)) { channel = 'AI assistant'; type = 'referral'; src = ext; med = 'referral'; }
  else if (ext && SEARCH.test(ext)) { channel = 'Organic search'; type = 'organic'; src = ext.replace(/^www\./, '').split('.')[0]; med = 'organic'; }
  else if (ext && SOCIAL.test(ext)) { channel = 'Social'; type = 'organic'; src = ext.replace(/^(www|m|l|lm)\./, '').split('.')[0]; med = 'social'; }
  else if (ext) { channel = 'Referral'; type = 'referral'; src = ext.replace(/^www\./, ''); med = 'referral'; }
  else if (!ref && navigation === 'ingress') { channel = 'Direct'; type = 'direct'; src = '(direct)'; med = '(none)'; }
  else { channel = 'Unattributed'; type = 'unknown'; src = '(unknown)'; med = '(unknown)'; }
  // UTS affiliate resolution is the only case where the stored source knows more than the URL.
  if (channel === 'Unattributed' && source === 'affiliate') { channel = 'Partner / affiliate'; type = 'referral'; src = 'affiliate'; med = medium || 'partner'; }
  return { source: src, medium: med || '(not set)', campaign: utm.campaign || '', term: utm.term, content: utm.content, gclid, fbclid, referrer: ext, channel, type };
}

export const hasCampaign = (a) => !['Direct', 'Unattributed'].includes(a.channel);

// Real Chrome freezes its build to x.0.0.0; a full build on Linux desktop is bundled Chromium (Playwright/Puppeteer).
const AUTOMATION = /X11; Linux x86_64.*Chrome\/\d+\.0\.[1-9]\d*\./;
export const isBot = (ua = '') => AUTOMATION.test(ua) || /(bot|crawl|spider|slurp|headless|lighthouse|pingdom|webindexer|facebookexternalhit|GoogleOther|APIs-Google|python|curl|axios|compatible;\s*[a-z])/i.test(ua);

export const deviceOf = (ua = '') => (!ua ? 'Unknown' : /iPad|Tablet|Android(?!.*Mobile)/i.test(ua) ? 'Tablet' : /Mobi|Android|iPhone/i.test(ua) ? 'Mobile' : 'Desktop');

// GA1.1.x.y and GA1.2.x.y are the same browser: UTS rewrites the prefix, events do not.
export const gaKey = (ga) => (typeof ga === 'string' && ga.split('.').length >= 2 ? ga.split('.').slice(-2).join('.') : '');
export const gaForms = (key) => [`GA1.2.${key}`, `GA1.1.${key}`, `GA1.3.${key}`, key];

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
// Gateway retries are logged as <prid>-1, <prid>-2; they are one payment request.
export const basePrid = (id) => { const m = UUID_RE.exec(String(id || '')); return m ? m[0].toLowerCase() : String(id || ''); };
export const pridFromUrl = (raw) => {
  const u = parseUrl(raw);
  if (!u || !/\/vs\/(checkout|success)/.test(u.pathname)) return '';
  const id = u.searchParams.get('k') || u.searchParams.get('id') || '';
  return UUID_RE.test(id) ? basePrid(id) : '';
};

const clean = (v) => (v === undefined || v === null ? '' : String(v).trim());

// Experiment assignment carried by a user-track row (the onboardingVariantTracking.js `data` block).
export function assignmentFromHit(h) {
  const d = h.data || {};
  const design = clean(d.onboardingDesign);
  if (design) {
    return { experiment: clean(d.onboardingExperiment), variant: design, label: clean(d.onboardingVariant), source: clean(d.assignmentSource) || 'user-track', page: clean(d.landingPage || d.onboardingPage), landingUrl: clean(d.landingUrl), from: 'user-track', service: clean(d.serviceId || h.serviceId), ticket: clean(d.ticketId || h.ticketId) };
  }
  const u = parseUrl(h.url);
  const param = clean(u?.searchParams.get('onboarding_design'));
  if (/^v\d+$/.test(param)) return { experiment: '', variant: param, label: '', source: 'url', page: '', landingUrl: '', from: 'url' };
  return null;
}

// Experiment assignment carried by an event-tracking row.
export function assignmentFromEvent(e) {
  const p = e.eventProperties || {};
  if (e.eventName === 'legal_experts_listing_experiment_landing') {
    const v = clean(p.value);
    return v === '0' || v === '1' ? { experiment: 'LEGAL-EXPERTS-LISTING', variant: v === '1' ? 'v2' : 'v1', label: v, source: 'event', page: '', landingUrl: '', from: 'event', service: clean(e.serviceId), ticket: '' } : null;
  }
  const experiment = clean(p.onboardingExperiment || p.abExperiment || (e.eventName === 'experiment_viewed' ? p.experimentId : ''));
  const variant = clean(p.onboardingDesign || p.abVariant || (e.eventName === 'experiment_viewed' ? p.variationId : ''));
  if (!experiment || !variant) return null;
  return { experiment, variant, label: clean(p.onboardingVariant), source: clean(p.assignmentSource) || 'event', page: '', landingUrl: '', from: 'event', service: clean(p.serviceId || e.serviceId), ticket: clean(p.ticketId || e.ticketId) };
}

const START = /^(tm_onboarding_step_viewed|gst_check_viewed|onboarding_page_visit|onboarding_page_load|slot_type_calendar_page_visit|calendar_page_visit)$/;
const PROGRESS = /^(tm_onboarding_(mark_type_submitted|category_selected|plan_selected|class_toggled)|gst_check_(option_selected|cta_clicked)|date_selection|time_selection|language_selection|next_button_click|next_click|next_click_proceed)$/;
const COMPLETE = /^(tm_onboarding_checkout_clicked|make_payment|proceed_to_pay|next_click_proceed)$/;
const LEAD = /^(ab_lead_created|gst_check_lead_created|lead_created_successfully_from_captcha|lead_creation_success|book_click_success|submit_click_success)$/;

export function eventMeaning(e) {
  const n = e.eventName || '';
  const wf = e.workflow || '';
  if (/^(grc|generic|web-to-grc|onepage_crm|bd_quotation|GRC)/i.test(wf)) return null;
  const out = { start: START.test(n), progress: PROGRESS.test(n), complete: COMPLETE.test(n), lead: LEAD.test(n), exit: /^(page_exit|page_left)$/.test(n) };
  return out.start || out.progress || out.complete || out.lead || out.exit ? out : null;
}

export const EVENT_NAMES = [
  'tm_onboarding_step_viewed', 'gst_check_viewed', 'onboarding_page_visit', 'onboarding_page_load', 'slot_type_calendar_page_visit', 'calendar_page_visit',
  'tm_onboarding_mark_type_submitted', 'tm_onboarding_category_selected', 'tm_onboarding_plan_selected', 'tm_onboarding_class_toggled', 'gst_check_option_selected', 'gst_check_cta_clicked',
  'date_selection', 'time_selection', 'language_selection', 'next_button_click', 'next_click', 'next_click_proceed',
  'tm_onboarding_checkout_clicked', 'make_payment', 'proceed_to_pay',
  'ab_lead_created', 'gst_check_lead_created', 'lead_created_successfully_from_captcha', 'lead_creation_success', 'book_click_success', 'submit_click_success',
  'page_exit', 'page_left', 'ab_experiment_assigned', 'experiment_viewed', 'legal_experts_listing_experiment_landing',
];

export const STAGES = [
  { id: 'landing', label: 'Landing page visit', core: true },
  { id: 'assigned', label: 'Experiment assignment', core: false },
  { id: 'start', label: 'Lead / onboarding start', core: true },
  { id: 'progress', label: 'Onboarding progress', core: false },
  { id: 'complete', label: 'Onboarding completion', core: false },
  { id: 'checkout', label: 'Checkout initiated', core: true },
  { id: 'paid', label: 'Payment success', core: true },
];
export const stageLabel = (id) => STAGES.find((s) => s.id === id)?.label || id;
