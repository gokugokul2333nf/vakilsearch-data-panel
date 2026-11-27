import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { Icon, Link, MODELS, MODEL_HINT, STAGE, day, useApi, useFilters } from './ui.js';
import Picker from './Picker.js';

const NAV = [['/', 'Overview', 'home'], ['/attribution', 'Attribution', 'megaphone'], ['/landing-pages', 'Landing Pages', 'page'], ['/funnels', 'Funnels', 'funnel'], ['/experiments', 'Experiments', 'flask'], ['/users', 'Users', 'users'], ['/revenue', 'Revenue', 'rupee']];
const FOOT = [['/data-health', 'Data Health', 'shield'], ['/help', 'Help', 'help']];
const RANGES = [['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['month', 'This month']];

const IST = 330 * 60e3; const DAY = 864e5;
export const rangeText = (g) => {
  const today = Math.floor((Date.now() + IST) / DAY) * DAY - IST; const r = g.range || '30d';
  const d = new Date(today + IST);
  const [a, b] = r === 'today' ? [today, today] : r === 'yesterday' ? [today - DAY, today - DAY] : r === '7d' ? [today - 6 * DAY, today] : r === 'month' ? [Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - IST, today] : r === 'custom' && g.from && g.to ? [Date.parse(`${g.from}T00:00:00+05:30`), Date.parse(`${g.to}T00:00:00+05:30`)] : [today - 29 * DAY, today];
  return a === b ? day(a) : `${day(a)} – ${day(b)}`;
};


function DateRange({ f }) {
  const [open, setOpen] = useState(false);
  const [c, setC] = useState({ from: '', to: '' });
  const ref = useRef(null);
  useEffect(() => { const h = (e) => { if (e.key === 'Escape' || (e.type === 'mousedown' && !ref.current?.contains(e.target))) setOpen(false); }; document.addEventListener('mousedown', h); document.addEventListener('keydown', h); return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', h); }; }, []);
  const cur = f.globals.range || '30d';
  const bad = !c.from || !c.to || c.to < c.from;
  return <div className="pop" ref={ref}><button className="pillbtn big" aria-expanded={open} onClick={() => setOpen(!open)}><Icon n="cal" s={18} /><span suppressHydrationWarning>{rangeText(f.globals)}</span><Icon n="down" s={15} /></button>
    {open && <div className="menu">{RANGES.map(([v, l]) => <button key={v} className={cur === v ? 'on' : ''} onClick={() => { f.set({ range: v, from: '', to: '' }); setOpen(false); }}>{l}</button>)}
      <div className="dates"><label><span className="sr">From</span><input type="date" value={c.from} onChange={(e) => setC({ ...c, from: e.target.value })} /></label><label><span className="sr">To</span><input type="date" value={c.to} onChange={(e) => setC({ ...c, to: e.target.value })} /></label><button className="go" disabled={bad} onClick={() => { f.set({ range: 'custom', ...c }); setOpen(false); }}>Apply custom range</button></div></div>}</div>;
}

const NOUN = { channel: 'channels', source: 'sources', medium: 'mediums', campaign: 'campaigns', landing: 'landing pages', service: 'services', device: 'devices', experiment: 'experiments', variant: 'variants', stage: 'stages', pay: 'payment states', term: 'terms', content: 'contents' };
const DIM_LABEL = { channel: 'Channel', source: 'Source', medium: 'Medium', campaign: 'Campaign', landing: 'Landing page', service: 'Service', device: 'Device', experiment: 'Experiment', variant: 'Variant', stage: 'Last stage', reached: 'Reached', pay: 'Payment', term: 'Term', content: 'Content' };
export function FilterBar({ f, dims = ['channel', 'source', 'medium', 'campaign', 'landing', 'service', 'device', 'experiment'] }) {
  const q = useApi(f.ready ? '/api/filters' : null, f.globals);
  const o = q.data || {};
  const opts = { ...o, experiment: o.experiments, variant: (o.experiments || []).find((e) => e.v === f.dims.experiment)?.variants.map((v) => ({ v })), stage: ['landing', 'start', 'progress', 'complete', 'checkout', 'paid'].map((v) => ({ v, l: STAGE[v] })), pay: ['success', 'failed', 'pending', 'not attempted', 'none'].map((v) => ({ v })) };
  const list = f.dims.experiment && dims.includes('experiment') ? [...dims, 'variant'] : dims;
  return <div className="filters">
    {list.map((k) => (f.dims[k] ? <span className="chip" key={k}><span>{DIM_LABEL[k]}: {opts[k]?.find?.((x) => x.v === f.dims[k])?.l || f.dims[k]}</span><button aria-label={`Clear ${DIM_LABEL[k]}`} onClick={() => f.set(k === 'experiment' ? { experiment: '', variant: '' } : { [k]: '' })}><Icon n="x" s={13} /></button></span>
      : <Picker key={k} label={DIM_LABEL[k]} options={q.data ? opts[k] || [] : undefined} onPick={(x) => f.set({ [k]: x.v })} split={k === 'landing'} noun={NOUN[k]} />))}
    {Object.keys(f.dims).filter((k) => !list.includes(k)).map((k) => <span className="chip" key={k}><span>{DIM_LABEL[k]}: {f.dims[k]}</span><button aria-label={`Clear ${DIM_LABEL[k]}`} onClick={() => f.set({ [k]: '' })}><Icon n="x" s={13} /></button></span>)}
    {Object.keys(f.dims).length > 0 && <button className="pillbtn" onClick={() => f.set(Object.fromEntries(Object.keys(f.dims).map((k) => [k, ''])))}>Clear all</button>}
  </div>;
}

export default function Layout({ title, sub, hello, children, after, alerts, filters = true, dims, hideScope, quiet }) {
  const f = useFilters();
  const r = useRouter();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState(false);
  const [showF, setShowF] = useState(!quiet);
  const [term, setTerm] = useState('');
  useEffect(() => { setTerm(r.pathname === '/users' ? String(r.query.q || '') : ''); setOpen(false); }, [r.asPath]); // eslint-disable-line react-hooks/exhaustive-deps
  const isOn = (p) => (p === '/' ? r.pathname === '/' : r.pathname.startsWith(p));
  const link = ([p, l, i]) => <Link key={p} href={f.href(p)} className={isOn(p) ? 'on' : ''} aria-current={isOn(p) ? 'page' : undefined}><Icon n={i} />{l}</Link>;
  const env = f.globals.env === 'all'; const bots = f.globals.bots === 'include'; const model = f.globals.model || '';
  return <div className="shell">
    <Head><title>{`${title} · Zolvit Attribution (QE)`}</title><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 36 38'%3E%3Cpath d='M2 14C2 6 8 2 34 1c1 10 0 18-5 24-4 5-9 8-16 8C5 33 2 24 2 14z' fill='%230f8f80'/%3E%3C/svg%3E" /><meta name="robots" content="noindex" /><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>
    <aside className={`side ${open ? 'open' : ''}`}><div className="side-in">
      <div className="side-top"><div className="brand"><svg width="36" height="38" viewBox="0 0 36 38" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="1" x2="1" y2="0"><stop stopColor="#0a776e" /><stop offset="1" stopColor="#5fdcc0" /></linearGradient></defs><path d="M2 14C2 6 8 2 34 1c1 10 0 18-5 24-4 5-9 8-16 8C5 33 2 24 2 14z" fill="url(#lg)" /><path d="M5 32C7 22 14 13 27 8" stroke="#d8fff3" strokeWidth="2" fill="none" strokeLinecap="round" opacity=".7" /></svg><div><b>Zolvit</b><small>Attribution &amp;<br />Funnel Analytics</small></div></div>
        <button className="burger" onClick={() => setOpen(!open)} aria-expanded={open}>Menu</button></div>
      <div className="navs" style={{ display: undefined }}><nav className="nav" aria-label="Main">{NAV.map(link)}</nav></div>
      <div className="quote">Every payment<br />has a first click.<br />Trace it here.</div>
      <div className="navs"><nav className="nav" aria-label="Support">{FOOT.map(link)}</nav></div>
    </div></aside>
    <main className="main">
      <div className="top">
        <form className="search" role="search" onSubmit={(e) => { e.preventDefault(); r.push(f.href('/users', { q: term.trim() })); }}><Icon n="search" s={19} /><input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search UUID, GA ID, ticket, payment…" aria-label="Search users" /></form>
        <div className="top-r"><Link className="bell" href={f.href('/data-health')} aria-label={`${alerts ?? 0} data notes`}><Icon n="bell" s={21} />{alerts ? <i>{alerts}</i> : null}</Link>
          <div className="pop"><button className="who" onClick={() => setScope(!scope)} aria-expanded={scope}><span className="ava">QE</span><span style={{ textAlign: 'left' }}>QE Workspace<small>Read only</small></span><Icon n="down" s={16} /></button>
            {scope && <div className="menu"><button className={!env ? 'on' : ''} onClick={() => f.set({ env: '' })}>QE hosts only</button><button className={env ? 'on' : ''} onClick={() => f.set({ env: 'all' })}>All hosts (with localhost)</button><button className={bots ? 'on' : ''} onClick={() => f.set({ bots: bots ? '' : 'include' })}>{bots ? 'Including crawlers' : 'Include crawlers'}</button></div>}</div></div>
      </div>
      <header className="head"><div>{hello && <p>{hello}</p>}<h1>{title}</h1><div className="sub">{sub}</div></div>
        <div className="head-r"><DateRange f={f} /><div className="head-b">{filters && <button className={`pillbtn ${showF ? 'on' : ''}`} aria-expanded={showF} onClick={() => setShowF(!showF)}><Icon n="funnel" s={14} />Filters{Object.keys(f.dims).length ? ` (${Object.keys(f.dims).length})` : ''}</button>}{!hideScope && <select className="pillbtn" aria-label="Attribution model" value={model} title={MODEL_HINT[model]} onChange={(e) => f.set({ model: e.target.value })}>{MODELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}</div></div></header>
      {filters && (showF || Object.keys(f.dims).length > 0) && <FilterBar f={f} dims={dims} />}
      {children}
    </main>
    {after && <div className="full">{after}</div>}
  </div>;
}
