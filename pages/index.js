import { useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout.js';
import { Card, Icon, Kpi, Link, Load, Pill, ago, day, inr, nf, pc, useApi, useFilters, userLabel } from '../components/ui.js';
import { Area, Bars, Donut, Funnel3D } from '../components/charts.js';

const SHORT = { visitors: 'Visitors', landing: 'Landing', start: 'Lead', progress: 'Onboarding', complete: 'Completed', checkout: 'Checkout', paid: 'Paid' };
const TAG = { Tracking: 'violet', Revenue: '', Identity: 'blue', Experiment: 'amber', Quality: 'grey' };
const METRICS = { visitors: ['Visitors', nf, ''], views: ['Page views', nf, ''], conversion: ['Conversion', pc, '%'], revenue: ['Revenue', inr, '₹'], payments: ['Payments', nf, ''] };

// Long ranges are shown as weeks so the line stays readable; rates are recomputed, never averaged.
function points(daily, m) {
  const size = daily.length > 16 ? 7 : 1; const out = [];
  for (let end = daily.length; end > 0; end -= size) out.unshift(daily.slice(Math.max(0, end - size), end));
  const fmt = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return out.map((g) => { const sum = (k) => g.reduce((s, d) => s + d[k], 0); const y = m === 'conversion' ? (sum('cohort') ? Math.round((sum('payers') / sum('cohort')) * 1000) / 10 : null) : sum(m); return { x: fmt(g[0].date), y, extra: size > 1 ? [`${g.length} days from ${fmt(g[0].date)}`] : [] }; });
}

export default function Overview() {
  const f = useFilters();
  const r = useRouter();
  const [metric, setMetric] = useState('conversion');
  const [exp, setExp] = useState(0);
  const q = useApi(f.ready ? '/api/overview' : null, f.params);
  const d = q.data; const k = d?.kpis; const dl = d?.delta || {};
  const toUsers = (x) => r.push(f.href('/users', { ...f.dims, ...x }));
  const kpi = (icon, key, label, fmt, unit, hint) => <Kpi key={key} icon={icon} value={k ? fmt(k[key]) : '…'} label={label} d={k ? dl[key] : null} unit={unit} hint={hint} />;
  return <Layout quiet title="Attribution Dashboard" hello={<>Welcome back 👋</>} sub="Turn first clicks into traceable payments." alerts={d?.alerts.length}
    after={<div className="g2" style={{ gridTemplateColumns: undefined }}>
      <Card title="Experiment Performance" right={d?.experiments.length ? <select className="pillbtn" aria-label="Experiment" value={exp} onChange={(e) => setExp(Number(e.target.value))}>{d.experiments.map((e, i) => <option key={e.name} value={i}>{e.name}</option>)}</select> : null}>
        <Load q={q} h={210} empty={(x) => !x.experiments.length}>{(x) => { const e = x.experiments[Math.min(exp, x.experiments.length - 1)]; const max = Math.max(1, ...e.variants.map((v) => v.conversion || 0)); return <div className="tw"><table><thead><tr><th>Variant</th><th>Assigned</th><th>Checkout</th><th>Paid</th><th>Conversion</th><th /></tr></thead><tbody>{e.variants.map((v) => <tr key={v.variant} className="link" onClick={() => toUsers({ experiment: e.name, variant: v.variant })}><td><span style={{ display: 'flex', alignItems: 'center', gap: 13 }}><span className="ava" style={{ width: 34, height: 34, fontSize: 12 }}>{v.variant.slice(0, 3)}</span>{v.variant}</span></td><td className="num">{nf(v.assigned)}</td><td className="num">{nf(v.checkout)}</td><td className="num">{nf(v.payers)}</td><td className="num">{pc(v.conversion)}</td><td style={{ width: '30%' }}><div className="bar"><i style={{ width: `${((v.conversion || 0) / max) * 100}%` }} /></div></td></tr>)}</tbody></table><p className="note">Conversion = users who paid after being assigned ÷ users assigned. <Link href={f.href('/experiments')} style={{ color: 'var(--teal-d)' }}>All experiments</Link></p></div>; }}</Load>
      </Card>
      <Card title="Customer Activity" right={<Pill href={f.href('/users')}>View All</Pill>}>
        <Load q={q} h={210} empty={(x) => !x.activity.length}>{(x) => <div className="rows">{x.activity.map((u) => { const [cls, ic] = { paid: ['g', 'card'], checkout: ['a', 'cart'], landing: ['b', 'eye'] }[u.stage] || ['g', 'check']; return <Link key={u.id} className="row" href={f.href(`/users/${u.id}`)}><span className={`ic ${cls}`}><Icon n={ic} s={18} /></span><span className="t"><b style={{ fontWeight: 600 }} title={userLabel(u)}>{userLabel(u)}</b><small title={u.lastPage}>last seen on {u.lastPage}</small></span><span className="ago">{ago(u.lastTs)}</span></Link>; })}</div>}</Load>
      </Card></div>}>
    <div className="g4">{kpi('users', 'visitors', 'Unique Visitors', nf, '%', 'Unique people with at least one tracked page in range')}{kpi('eye', 'landingVisits', 'Landing Visits', nf, '%', 'Deduplicated page views on landing pages')}{kpi('check', 'onboarding', 'Onboarding Starts', nf, '%', 'Unique people who submitted a lead or opened onboarding after landing')}{kpi('spark', 'completed', 'Onboarding Done', nf, '%', 'Unique people who finished onboarding after landing')}</div>
    <div className="g4">{kpi('cart', 'checkout', 'Checkouts', nf, '%', 'Unique people who opened checkout after landing')}{kpi('card', 'payments', 'Payments', nf, '%', 'Gateway-verified payments, one per payment request')}{kpi('rupee', 'revenue', 'Total Revenue', inr, '%', 'Gateway amount of successful payments')}{kpi('chart', 'conversion', 'Conversion Rate', pc, ' pts', 'People who landed and then paid ÷ people who landed')}</div>
    <div className="g2">
      <Card title="Conversion Funnel" right={<Pill href={f.href('/funnels', f.dims)}>View All</Pill>}><Load q={q} h={236} empty={(x) => !x.funnel[0].users}>{(x) => <Funnel3D rows={[{ id: 'visitors', label: 'Unique visitors', users: x.kpis.visitors, ofTop: null, fromPrev: null }, ...x.funnel.filter((s) => s.core)].map((s) => ({ ...s, short: SHORT[s.id] }))} onPick={(s) => toUsers(s.id === 'visitors' ? {} : { reached: s.id })} />}</Load></Card>
      <Card title="Users by Last Stage" right={<Pill href={f.href('/users', f.dims)}>View All</Pill>}><Load q={q} h={236}>{(x) => <Bars rows={x.stages.map((s) => ({ ...s, short: SHORT[s.id] }))} onPick={(s) => toUsers({ stage: s.id })} />}</Load></Card>
    </div>
    <div className="g2 b">
      <Card title="Traffic Sources" right={<Pill href={f.href('/attribution', f.dims)}>View All</Pill>}><Load q={q} h={200} empty={(x) => !x.channels.length}>{(x) => { const top = x.channels.slice(0, 5); const rest = x.channels.slice(5); const rows = [...top.map((c) => ({ l: c.key, v: c.visitors, k: c.key })), ...(rest.length ? [{ l: 'Other', v: rest.reduce((s, c) => s + c.visitors, 0) }] : [])]; return <Donut rows={rows} total={x.kpis.visitors} label="Visitors" onPick={(s) => s.k && toUsers({ channel: s.k })} />; }}</Load></Card>
      <Card title={METRICS[metric][0] + (metric === 'conversion' ? ' Rate' : '')} right={<select className="pillbtn" aria-label="Metric" value={metric} onChange={(e) => setMetric(e.target.value)}>{Object.entries(METRICS).map(([v, m]) => <option key={v} value={v}>{m[0]}</option>)}</select>}><Load q={q} h={200}>{(x) => <Area pts={points(x.series.daily, metric)} fmt={METRICS[metric][1]} unit={METRICS[metric][2]} name={METRICS[metric][0]} />}</Load></Card>
    </div>
    <div className="g2 b">
      <Card title="Needs Attention" right={<Pill href={f.href('/data-health')}>View All</Pill>}><Load q={q} h={240} empty={(x) => !x.alerts.length}>{(x) => <div className="rows">{x.alerts.slice(0, 4).map((a) => <div className="row" key={a.title}><span className="ring" /><span className="ic"><Icon n={a.tag === 'Revenue' ? 'rupee' : a.tag === 'Identity' ? 'users' : a.tag === 'Experiment' ? 'flask' : 'shield'} s={18} /></span><span className="t"><b title={a.title}>{a.title}</b><small title={a.sub}>{a.sub}</small></span><span className={`tag ${TAG[a.tag]}`}>{a.tag}</span></div>)}</div>}</Load></Card>
      <Card title="Recent Payments" right={<Pill href={f.href('/revenue', f.dims)}>View All</Pill>}><Load q={q} h={240} empty={(x) => !x.payments.length}>{(x) => <div className="tw"><table><thead><tr><th>Service</th><th>Value</th><th className="hide-s">Attribution</th><th>Date</th></tr></thead><tbody>{x.payments.map((p) => <tr key={p.prid} className={p.person ? 'link' : ''} onClick={() => p.person && r.push(f.href(`/users/${p.person}`))}><td title={p.service}><span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}><span className="ic g" style={{ width: 28, height: 28 }}><Icon n="card" s={15} /></span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.service || `Service ${p.serviceId}`}</span></span></td><td className="num">{inr(p.amount)}</td><td className="hide-s">{p.person ? <span className="tag">Matched</span> : <span className="tag amber">Unattributed</span>}</td><td>{day(p.ts).replace(/ \d{4}$/, '')}</td></tr>)}</tbody></table></div>}</Load></Card>
    </div>
  </Layout>;
}
