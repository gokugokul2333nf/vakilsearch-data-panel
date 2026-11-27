// Tools the chat bot can call. Each one runs the same read-only API route the dashboard uses,
// in-process, so the bot sees exactly the numbers on screen (QE only, nothing is written).
import overview from '../pages/api/overview.js';
import revenue from '../pages/api/revenue.js';
import funnel from '../pages/api/funnel.js';
import attribution from '../pages/api/attribution.js';
import landingPages from '../pages/api/landing-pages.js';
import experiments from '../pages/api/experiments.js';
import users from '../pages/api/users/index.js';
import user from '../pages/api/users/[id].js';
import health from '../pages/api/health.js';
import filters from '../pages/api/filters.js';

const ROUTES = { overview, revenue, funnel, attribution, 'landing-pages': landingPages, experiments, users, user, health, filters };

export const LABELS = {
  overview: 'Reading the overview', revenue: 'Checking revenue', funnel: 'Walking the funnel', attribution: 'Looking at attribution',
  'landing-pages': 'Scanning landing pages', experiments: 'Comparing experiments', users: 'Searching users', user: 'Tracing a user journey',
  health: 'Checking data health', filters: 'Looking up filter values',
};

const PARAM_KEYS = ['range', 'from', 'to', 'model', 'env', 'bots', 'source', 'medium', 'channel', 'campaign', 'term', 'content', 'landing', 'service', 'device', 'experiment', 'variant', 'stage', 'reached', 'pay', 'dim', 'q', 'sort', 'dir', 'page', 'size', 'status', 'matched', 'compare', 'id'];

export const TOOLS = [{
  name: 'query_panel',
  eager_input_streaming: true,
  description: `Read live QE data from the Zolvit attribution dashboard. Call it whenever a question needs numbers, names or a user's journey; call it several times (in parallel when independent) to compare periods or segments. Endpoints:
- overview: KPIs (unique visitors, landing visits, onboarding starts/done, checkouts, payments, revenue, conversion %) with previous-period deltas, funnel, users by last stage, channels, devices, top landing pages, daily series, recent payments, experiment summary, recent activity, data alerts.
- revenue: revenue, payments, AOV with deltas; success/failed/pending counts; revenue split by channel, source, campaign, landing page, service, gateway and experiment variant; daily series; payment rows (params: status=success|failed|pending, matched=no for unattributed, q to search ids, sort, dir, page, size).
- funnel: stage funnel for the cohort that landed in range, drop-offs by last stage with their pages. compare: up to 4 comma-separated "dimension:value" specs (channel, source, campaign, landing, service, device, experiment, or variant as "variant:EXPERIMENT~v2").
- attribution: rows grouped by dim=channel|source|medium|campaign|term|content|type with visitors, stage counts, payers, revenue; gclid/fbclid counts.
- landing-pages: per landing page visitors, views, sessions, stages, payments, revenue (q filters by path).
- experiments: every A/B experiment with per-variant assigned, onboarding, checkout, payers, conversion, revenue.
- users: people list, paginated, sorted by lastTs; q searches UUID, GA id, ticket, payment id, landing URL, campaign.
- user: one person's full journey timeline; id is a GA client id like "1857955446.1794318522".
- health: data quality notes, payment match rates, unattributed payment reasons.
- filters: the exact values that exist for channel, source, medium, campaign, landing, service, device and experiment, with counts. Use it to find the exact spelling before filtering.
Common params (all strings, all optional): range=today|yesterday|7d|30d|month|custom (default 30d), from/to=YYYY-MM-DD with range=custom (max 180 days), model=visit|first|last (default visit), and filters source, medium, channel, campaign, term, content, landing, service, device, experiment, variant, stage, reached, pay.`,
  input_schema: {
    type: 'object',
    properties: {
      endpoint: { type: 'string', enum: Object.keys(ROUTES) },
      params: { type: 'object', description: 'Query parameters as strings', additionalProperties: { type: 'string' } },
    },
    required: ['endpoint'],
  },
}];

// Long arrays (daily series, payment rows) are trimmed so one call stays a few thousand tokens.
const trim = (v, depth = 0) => {
  if (Array.isArray(v)) { const out = v.slice(0, depth === 0 ? 60 : 40).map((x) => trim(x, depth + 1)); if (v.length > out.length) out.push(`… ${v.length - out.length} more`); return out; }
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, trim(x, depth + 1)]));
  return typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v;
};

// The model's tool input is untrusted: check its shape before running anything.
export function validate(input) {
  if (!input || typeof input !== 'object' || !ROUTES[input.endpoint]) return { error: `endpoint must be one of ${Object.keys(ROUTES).join(', ')}` };
  const raw = input.params ?? {};
  if (typeof raw !== 'object' || Array.isArray(raw)) return { error: 'params must be an object of strings' };
  const params = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!PARAM_KEYS.includes(k)) return { error: `unknown param "${k}"` };
    if (v == null || v === '') continue;
    if (!['string', 'number'].includes(typeof v)) return { error: `param "${k}" must be a string` };
    params[k] = String(v).slice(0, 300);
  }
  if (params.compare) params.compare = params.compare.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 4);
  return { endpoint: input.endpoint, params };
}

export async function runTool({ endpoint, params }) {
  let status = 200; let body = null;
  const res = { status(c) { status = c; return res; }, json(b) { body = b; return res; } };
  await ROUTES[endpoint]({ method: 'GET', query: endpoint === 'user' ? { id: params.id || '' } : params, url: `/api/${endpoint}` }, res);
  if (status !== 200) return { isError: true, text: JSON.stringify({ status, error: body?.error || 'request failed' }) };
  const text = JSON.stringify(trim(body));
  return { isError: false, text: text.length > 60000 ? `${text.slice(0, 60000)}… [truncated: narrow the query with filters, page or size]` : text };
}
