import { useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout.js';
import { Card, Load, Table, day, inr, nf, pc, useApi, useFilters } from '../components/ui.js';
import { FunnelTable } from '../components/charts.js';

export default function Experiments() {
  const f = useFilters(); const r = useRouter();
  const q = useApi(f.ready ? '/api/experiments' : null, { ...f.params, experiment: '', variant: '' });
  const [vs, setVs] = useState('');
  const name = f.query.exp;
  return <Layout title="A/B Experiments" sub="Found in recorded assignments. The first variant a user got is kept to the end." dims={['channel', 'source', 'landing', 'service', 'device']}>
    <Load q={q} h={300} empty={(d) => !d.rows.length}>{(d) => {
      const e = d.rows.find((x) => x.name === name) || d.rows[0];
      const v = e.variants.find((x) => x.variant === vs) || e.variants[0];
      const small = e.variants.some((x) => x.assigned < 100);
      return <div className="main" style={{ gap: 14 }}>
        <Card title="All experiments"><Table rows={d.rows} rowKey={(x) => x.name} onRow={(x) => { setVs(''); f.set({ exp: x.name }); }} cols={[{ k: 'name', l: 'Experiment', f: (x) => <span style={{ fontWeight: x.name === e.name ? 650 : 400 }}>{x.name}<small>{x.pages.join(', ') || 'page not recorded'}</small></span> }, { k: 'assigned', l: 'Assigned users', r: 1, f: (x) => nf(x.assigned) }, { k: 'vv', l: 'Variants', f: (x) => x.variants.map((y) => `${y.variant}: ${y.assigned}`).join('   ') }, { k: 'payers', l: 'Paid users', r: 1, f: (x) => nf(x.payers) }, { k: 'revenue', l: 'Revenue', r: 1, f: (x) => inr(x.revenue) }, { k: 'sources', l: 'Recorded by', f: (x) => x.sources.join(', ') }]} /></Card>
        <Card title={e.name} sub={`First seen ${day(e.firstSeen)} · last seen ${day(e.lastSeen)}${e.services.length ? ` · services ${e.services.join(', ')}` : ''}`}>
          <Table rows={e.variants} rowKey={(x) => x.variant} onRow={(x) => r.push(f.href('/users', { ...f.dims, experiment: e.name, variant: x.variant }))} cols={[{ k: 'variant', l: 'Variant', f: (x) => <><b style={{ fontWeight: 600 }}>{x.variant}</b>{x.labels.length > 0 && <small>{x.labels.join(', ')}</small>}</> }, { k: 'assigned', l: 'Assigned users', r: 1, f: (x) => nf(x.assigned) }, { k: 'onboarding', l: 'Onboarding', r: 1, f: (x) => nf(x.onboarding) }, { k: 'completed', l: 'Completed', r: 1, f: (x) => nf(x.completed) }, { k: 'checkout', l: 'Checkout', r: 1, f: (x) => nf(x.checkout) }, { k: 'payments', l: 'Payments', r: 1, f: (x) => nf(x.payments) }, { k: 'revenue', l: 'Revenue', r: 1, f: (x) => inr(x.revenue) }, { k: 'conversion', l: 'Conversion', r: 1, f: (x) => <>{pc(x.conversion)}<small>95% range {pc(x.ciLow)}–{pc(x.ciHigh)}</small></> }, { k: 'conflicted', l: 'Saw another variant', r: 1, f: (x) => nf(x.conflicted) }]} />
          <p className="note">{small ? 'Fewer than 100 users in a variant: read this as a tracking check, not a winner. ' : ''}Only steps after the assignment count. {e.services.length ? `Checkout and revenue count only services ${e.services.join(', ')} (or the experiment’s own tickets).` : 'No service is recorded for this experiment, so any later payment counts.'}</p>
        </Card>
        <Card title="Variant funnel" right={<div className="tabs">{e.variants.map((x) => <button key={x.variant} className={`pillbtn ${x.variant === v.variant ? 'on' : ''}`} onClick={() => setVs(x.variant)}>{x.variant}</button>)}</div>}><FunnelTable rows={v.funnel.map((s) => ({ ...s, core: s.id === 'complete' ? false : undefined }))} /></Card>
      </div>;
    }}</Load>
  </Layout>;
}
