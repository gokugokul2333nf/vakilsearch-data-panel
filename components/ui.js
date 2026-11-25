import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

// ---------- format ----------
export const nf = (n) => (n == null ? '–' : Number(n).toLocaleString('en-IN'));
export const inr = (n) => (n == null ? '–' : `₹${Math.round(n).toLocaleString('en-IN')}`);
export const pc = (n) => (n == null ? '–' : `${n}%`);
const D = (o) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', ...o });
export const dt = (t) => (t ? D({ day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(t) : '–');
export const day = (t) => D({ day: 'numeric', month: 'short', year: 'numeric' }).format(t);
export const dayLong = (t) => D({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(t);
export const tm = (t) => D({ hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(t);
export const ago = (t) => { const s = (Date.now() - t) / 1000; if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)} minutes ago`; if (s < 86400) { const h = Math.floor(s / 3600); return `${h} hour${h > 1 ? 's' : ''} ago`; } const d = Math.floor(s / 86400); return `${d} day${d > 1 ? 's' : ''} ago`; };
export const STAGE = { landing: 'Landing', assigned: 'Assigned', start: 'Lead / start', progress: 'In onboarding', complete: 'Completed', checkout: 'Checkout', paid: 'Paid', other: 'Other' };
const STAGE_TAG = { landing: 'grey', start: 'blue', progress: 'blue', complete: 'violet', checkout: 'amber', paid: '', other: 'grey' };
export const StageTag = ({ s }) => <span className={`tag ${STAGE_TAG[s] ?? 'grey'}`}>{STAGE[s] || s}</span>;
const PAY_TAG = { success: '', failed: 'red', pending: 'amber', 'not attempted': 'grey', none: 'grey' };
export const PayTag = ({ s }) => <span className={`tag ${PAY_TAG[s] ?? 'grey'}`}>{s === 'none' ? 'No checkout' : s}</span>;
export const userLabel = (u) => (u.uuids?.length === 1 ? u.uuids[0].slice(0, 13) : `GA ${u.id}`);

// ---------- data ----------
const cache = new Map();
const inflight = new Map();
export function useApi(path, params) {
  const url = useMemo(() => { if (!path) return null; const q = new URLSearchParams(); for (const [k, v] of Object.entries(params || {})) for (const x of [v].flat()) if (x) q.append(k, x); q.sort(); const s = q.toString(); return `${path}${s ? `?${s}` : ''}`; }, [path, JSON.stringify(params)]); // eslint-disable-line react-hooks/exhaustive-deps
  const [state, set] = useState({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!url) return undefined;
    let live = true;
    const hit = cache.get(url);
    if (hit && Date.now() - hit.at < 60e3 && !tick) { set({ data: hit.data, error: null, loading: false }); return undefined; }
    set((s) => ({ ...s, error: null, loading: true }));
    const p = inflight.get(url) || fetch(url).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Request failed'); return j; }).finally(() => inflight.delete(url));
    inflight.set(url, p);
    p.then((data) => { cache.set(url, { at: Date.now(), data }); if (live) set({ data, error: null, loading: false }); }).catch((e) => live && set({ data: null, error: e.message, loading: false }));
    return () => { live = false; };
  }, [url, tick]);
  return { ...state, retry: () => setTick((t) => t + 1) };
}

// ---------- filters live in the URL: every view is linkable and shared by all pages ----------
export const GLOBAL = ['range', 'from', 'to', 'env', 'bots', 'model'];
export const DIMS = ['channel', 'source', 'medium', 'campaign', 'landing', 'service', 'device', 'experiment', 'variant', 'stage', 'reached', 'pay', 'term', 'content'];
export function useFilters() {
  const r = useRouter();
  const pick = (keys) => Object.fromEntries(keys.filter((k) => r.query[k]).map((k) => [k, String(r.query[k])]));
  const params = pick([...GLOBAL, ...DIMS]);
  const set = useCallback((patch, opt = {}) => {
    const q = { ...r.query, ...patch };
    for (const k of Object.keys(q)) if (q[k] === '' || q[k] == null) delete q[k];
    if (!('page' in patch)) delete q.page;
    r.push({ pathname: opt.path || r.pathname, query: q }, undefined, { scroll: Boolean(opt.path), shallow: !opt.path });
  }, [r]);
  const href = (path, extra = {}) => { const q = new URLSearchParams({ ...pick(GLOBAL), ...extra }); for (const [k, v] of [...q]) if (!v) q.delete(k); const s = q.toString(); return `${path}${s ? `?${s}` : ''}`; };
  return { ready: r.isReady, params, globals: pick(GLOBAL), dims: pick(DIMS), query: r.query, set, href };
}

// ---------- tooltip ----------
const Tip = createContext(() => {});
export function TipHost({ children }) {
  const [t, set] = useState(null);
  const ref = useRef(null);
  return <Tip.Provider value={set}>{children}{t && <div className="tip" ref={ref} role="status" style={{ left: Math.min(t.x + 14, (typeof window === 'undefined' ? 900 : window.innerWidth) - 240), top: Math.max(8, t.y - 14) }}>{t.lines.map((l, i) => <div key={i}>{i ? l : <b>{l}</b>}</div>)}</div>}</Tip.Provider>;
}
export const useTip = () => { const set = useContext(Tip); return (lines) => ({ onMouseMove: (e) => set({ x: e.clientX, y: e.clientY, lines }), onMouseLeave: () => set(null), onFocus: (e) => { const b = e.currentTarget.getBoundingClientRect(); set({ x: b.right, y: b.top, lines }); }, onBlur: () => set(null) }); };

// ---------- icons ----------
const P = {
  home: <path d="M3 11.2 12 4l9 7.2V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" fill="currentColor" stroke="none" />, users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20v-1.5C3 16 5.500 14.500 9 14.500s6 1.500 6 4V20zM16 5.200a3 3 0 0 1 0 5.600M17.500 14.800c2.200.5 3.500 1.800 3.500 3.700V20h-3" /></>,
  megaphone: <path d="M4 10v4h3l8 4V6L7 10zM18 9.500a4 4 0 0 1 0 5M7 14l1 5h2.500" />, page: <><rect x="4" y="4" width="16" height="16" rx="2.500" /><path d="M4 9h16M8 13h8M8 16.500h5" /></>, funnel: <path d="M3.500 5h17l-6.500 8v6l-4 2v-8z" />, flask: <path d="M9.500 3h5M10.500 3v6L5 19a1.500 1.500 0 0 0 1.300 2h11.400A1.500 1.500 0 0 0 19 19L13.500 9V3M8 15h8" />,
  rupee: <path d="M7 5h10M7 9h10M8 5c7 0 7 8 0 8l7 7" />, chart: <path d="M5 20v-6M10 20V8M15 20v-9M20 20V4" strokeWidth="3" />, gear: <><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.600 5.600l2.100 2.100M16.300 16.300l2.100 2.100M5.600 18.400l2.100-2.100M16.300 7.700l2.100-2.100" /></>, help: <><circle cx="12" cy="12" r="9" /><path d="M9.500 9.500a2.500 2.500 0 1 1 3.600 2.200c-.8.4-1.100.9-1.100 1.800M12 17v.2" /></>,
  bell: <path d="M6 16V11a6 6 0 0 1 12 0v5l1.500 2h-15zM10 20.500h4" fill="currentColor" />, search: <><circle cx="10.500" cy="10.500" r="6.500" /><path d="m20 20-4.700-4.700" /></>, cal: <><rect x="4" y="5" width="16" height="16" rx="2.500" /><path d="M4 10h16M8.500 3v4M15.500 3v4M8 14h2M8 17h2" /></>, down: <path d="m6 9 6 6 6-6" />, cart: <><path d="M5 8h14l-1 12H6z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  eye: <><path d="M2.500 12S6 5.500 12 5.500 21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12z" /><circle cx="12" cy="12" r="2.600" fill="currentColor" /></>, check: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8 12 3 3 5-6" /></>, shield: <path d="M12 3 4.500 6v6c0 5 3.500 8 7.500 9 4-1 7.500-4 7.500-9V6z" />, spark: <path d="M13 3 5 14h6l-1 7 8-11h-6z" />, card: <><rect x="3" y="5.500" width="18" height="13" rx="2.500" /><path d="M3 10h18" /></>, x: <path d="m6 6 12 12M18 6 6 18" />,
};
export const Icon = ({ n, s = 20 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{P[n]}</svg>;

// ---------- blocks ----------
export const Card = ({ title, sub, right, children, className = '', style }) => <section className={`card ${className}`} style={style}>{title && <div className="ch"><h2>{title}{sub && <small>{sub}</small>}</h2>{right}</div>}{children}</section>;
export const Pill = ({ href, children }) => <Link className="pillbtn" href={href}>{children}</Link>;
export function Load({ q, h = 180, children, empty }) {
  if (q.error) return <div className="err" role="alert">{q.error} <button className="pillbtn" onClick={q.retry} style={{ marginLeft: 8 }}>Retry</button></div>;
  if (!q.data) return <div className="skel" style={{ height: h }} aria-label="Loading" />;
  if (empty?.(q.data)) return <div className="empty">No QE data matches this range and these filters.</div>;
  return <div style={{ opacity: q.loading ? 0.55 : 1, transition: 'opacity .15s' }}>{children(q.data)}</div>;
}
export const Delta = ({ v, unit = '%' }) => (v == null ? <span className="tag flat">no prior data</span> : <span className={`tag ${v < 0 ? 'down' : v === 0 ? 'flat' : ''}`}>{v < 0 ? '↓' : v > 0 ? '↑' : '='} {Math.abs(v)}{unit}</span>);
export const Kpi = ({ icon, value, label, d, unit, hint }) => <div className="card kpi" title={hint}><div className="tile"><Icon n={icon} s={25} /></div><div style={{ minWidth: 0 }}><b className="num">{value}</b><span>{label}</span><Delta v={d} unit={unit} /><small>vs. prev. period</small></div></div>;

export function Table({ cols, rows, sort, dir, onSort, onRow, rowKey }) {
  return <div className="tw"><table><thead><tr>{cols.map((c) => <th key={c.k} className={`${c.r ? 'r' : ''} ${sort === c.k ? 'on' : ''}`} aria-sort={sort === c.k ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>{onSort && c.sort !== false ? <button onClick={() => onSort(c.k)}>{c.l}{sort === c.k ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}</button> : c.l}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={rowKey ? rowKey(r) : i} className={onRow ? 'link' : ''} tabIndex={onRow ? 0 : undefined} onClick={onRow ? () => onRow(r) : undefined} onKeyDown={onRow ? (e) => e.key === 'Enter' && onRow(r) : undefined}>{cols.map((c) => <td key={c.k} className={`${c.r ? 'r num' : ''}`} title={typeof r[c.k] === 'string' ? r[c.k] : undefined}>{c.f ? c.f(r) : r[c.k] ?? '–'}</td>)}</tr>)}</tbody></table></div>;
}
export function Pager({ d, set }) {
  const pages = Math.max(1, Math.ceil(d.total / d.size));
  return <div className="pager"><span>{nf(d.total)} rows · page {d.page} of {pages}</span><div><button className="pillbtn" disabled={d.page <= 1} onClick={() => set({ page: String(d.page - 1) })}>Previous</button><button className="pillbtn" disabled={d.page >= pages} onClick={() => set({ page: String(d.page + 1) })}>Next</button></div></div>;
}
export const useSort = (f) => ({ sort: f.query.sort || '', dir: f.query.dir || 'desc', onSort: (k) => f.set({ sort: k, dir: f.query.sort === k && f.query.dir !== 'asc' ? 'asc' : 'desc' }) });
export const perfCols = (first) => [first,
  { k: 'visitors', l: 'Visitors', r: 1, f: (r) => nf(r.visitors) }, { k: 'onboarding', l: 'Onboarding', r: 1, f: (r) => nf(r.onboarding) }, { k: 'checkout', l: 'Checkouts', r: 1, f: (r) => nf(r.checkout) },
  { k: 'payments', l: 'Payments', r: 1, f: (r) => nf(r.payments) }, { k: 'revenue', l: 'Revenue', r: 1, f: (r) => inr(r.revenue) }, { k: 'conversion', l: 'Conversion', r: 1, f: (r) => pc(r.conversion) }];
export { Link };
