import { useRouter } from 'next/router';
import { useState } from 'react';
import Layout from '../components/Layout.js';
import { Card, Kpi, Load, Pager, PayTag, Table, dt, inr, nf, useApi, useFilters, useSort } from '../components/ui.js';
import { Area, HBars } from '../components/charts.js';

const DIMS = [['channel', 'Channel'], ['source', 'Source / medium'], ['campaign', 'Campaign'], ['landing', 'Landing page'], ['variant', 'Experiment'], ['service', 'Service'], ['gateway', 'Gateway']];
export default function Revenue() {
  const f = useFilters(); const r = useRouter(); const s = useSort(f);
  const [dim, setDim] = useState('service');
  const q = useApi(f.ready ? '/api/revenue' : null, { ...f.params, status: f.query.status, matched: f.query.matched, sort: s.sort, dir: s.dir, page: f.query.page });
  const d = q.data;
  return <Layout title="Revenue & Payments" sub="Gateway-verified payments, joined back to the visit that caused them.">
    <div className="g4"><Kpi icon="rupee" value={d ? inr(d.kpis.revenue) : '…'} label="Verified revenue" d={d?.delta.revenue} /><Kpi icon="card" value={d ? nf(d.kpis.payments) : '…'} label="Successful payments" d={d?.delta.payments} /><Kpi icon="chart" value={d ? inr(d.kpis.aov) : '…'} label="Average payment" d={d?.delta.aov} /><div className="card kpi"><div><b>{d ? inr(d.kpis.unattributedRevenue) : '…'}</b><span>Unattributed revenue</span><small>{d ? `${nf(d.kpis.unattributed)} payments · failed ${nf(d.counts.failed)} · pending ${nf(d.counts.pending)}` : ''}</small></div></div></div>
    <div className="g2 b">
      <Card title="Revenue over time"><Load q={q} h={210}>{(x) => { const size = x.series.length > 31 ? 7 : x.series.length > 10 ? 3 : 1; const g = []; for (let e = x.series.length; e > 0; e -= size) g.unshift(x.series.slice(Math.max(0, e - size), e)); return <Area name="Revenue" fmt={inr} unit="₹" pts={g.map((p) => ({ x: new Date(`${p[0].date}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }), y: p.reduce((a, b) => a + b.revenue, 0), extra: [`${p.reduce((a, b) => a + b.payments, 0)} payments${size > 1 ? `, ${p.length} days` : ''}`] }))} />; }}</Load></Card>
      <Card title="Revenue by" right={<select className="pillbtn" aria-label="Break down by" value={dim} onChange={(e) => setDim(e.target.value)}>{DIMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}><Load q={q} h={210} empty={(x) => !x.dims[dim].length}>{(x) => <HBars fmt={inr} rows={x.dims[dim].slice(0, 8).map((y) => ({ l: y.key, v: y.revenue }))} />}</Load></Card>
    </div>
    <Card title="Payments" right={<div className="tabs">{[['', 'All'], ['success', 'Successful'], ['failed', 'Failed'], ['pending', 'Pending']].map(([v, l]) => <button key={l} className={`pillbtn ${(f.query.status || '') === v ? 'on' : ''}`} onClick={() => f.set({ status: v })}>{l}</button>)}<button className={`pillbtn ${f.query.matched ? 'on' : ''}`} onClick={() => f.set({ matched: f.query.matched ? '' : 'no' })}>Unattributed only</button></div>}>
      <Load q={q} h={320} empty={(x) => !x.total}>{(x) => <><Table {...s} sort={s.sort || 'ts'} rows={x.rows} rowKey={(p) => p.prid} onRow={(p) => p.person && r.push(f.href(`/users/${p.person}`))} cols={[{ k: 'ts', l: 'Date', f: (p) => dt(p.ts) }, { k: 'service', l: 'Service', f: (p) => <>{p.service || `Service ${p.serviceId}`}<small>ticket {p.ticketId || '–'}</small></> }, { k: 'status', l: 'Status', f: (p) => <PayTag s={p.status} /> }, { k: 'amount', l: 'Amount', r: 1, f: (p) => <>{inr(p.amount)}{p.status === 'success' && p.amountFrom !== 'gateway' && <small>from request</small>}</> }, { k: 'gateway', l: 'Gateway', f: (p) => <>{p.gateway}<small className="mono">{p.txnId}</small></> }, { k: 'prid', l: 'Payment / UUID', f: (p) => <span className="mono" title={`${p.prid}\n${p.uuid}`}>{p.prid.slice(0, 13)}<small>{p.uuid?.slice(0, 13) || 'no UUID'}</small></span> }, { k: 'landing', l: 'Landing visit', f: (p) => (p.landing ? <div style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.landingUrl}>{p.landing}<small>{p.landingChannel} · {p.landingVia}</small></div> : '–') }, { k: 'match', l: 'Attribution', f: (p) => (p.person ? <><span className="tag">Matched</span><small>{p.match}</small></> : <><span className="tag amber">Unattributed</span><small title={p.reason}>{p.reason}</small></>) }]} /><Pager d={x} set={f.set} /></>}</Load>
    </Card>
  </Layout>;
}
