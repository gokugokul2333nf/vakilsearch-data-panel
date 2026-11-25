import { useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout.js';
import { Card, Icon, Load, STAGE, Table, nf, pc, useApi, useFilters } from '../components/ui.js';
import { FunnelTable } from '../components/charts.js';

const DL = { channel: 'Channel', landing: 'Landing page', variant: 'Experiment variant', device: 'Device' };
export default function Funnels() {
  const f = useFilters(); const r = useRouter();
  const compare = [f.query.compare].flat().filter(Boolean);
  const [dim, setDim] = useState('variant');
  const q = useApi(f.ready ? '/api/funnel' : null, { ...f.params, compare });
  return <Layout title="Onboarding Funnels" sub="Unique users at every stage, from landing to verified payment.">
    <Card title="Landing to payment" sub="Closed cohort: users who landed in this range. A stage counts only after that landing.">
      <Load q={q} h={300} empty={(d) => !d.rows[0].users}>{(d) => <><FunnelTable rows={d.rows} onPick={(s) => r.push(f.href('/users', { ...f.dims, reached: s.id }))} />
        <p className="note">Striped stages are optional: not everyone gets an experiment or an onboarding flow, so they never reduce the next core stage. {nf(d.population - d.entered)} of {nf(d.population)} users had no landing page in range (payment links, bookmarks) and are outside this funnel.</p></>}</Load>
    </Card>
    <Card title="Compare funnels" sub="Up to four side by side" right={<div className="tabs"><select className="pillbtn" aria-label="Compare by" value={dim} onChange={(e) => setDim(e.target.value)}>{Object.entries(DL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select><select className="pillbtn" aria-label="Add funnel" value="" disabled={compare.length >= 4} onChange={(e) => e.target.value && f.set({ compare: [...compare, `${dim}:${e.target.value}`] })}><option value="">Add {DL[dim].toLowerCase()}…</option>{(q.data?.options[dim] || []).map((o) => <option key={o} value={o}>{o.replace('~', ' · ')}</option>)}</select></div>}>
      <div className="filters" style={{ marginBottom: 12 }}>{compare.map((c) => <span className="chip" key={c}><span>{c.replace(/^\w+:/, '').replace('~', ' · ')}</span><button aria-label="Remove" onClick={() => f.set({ compare: compare.filter((x) => x !== c) })}><Icon n="x" s={13} /></button></span>)}</div>
      {!compare.length ? <div className="empty">Add two or more funnels to compare channels, landing pages, variants or devices.</div>
        : <Load q={q} h={220}>{(d) => <Table rows={d.rows} rowKey={(x) => x.id} cols={[{ k: 'label', l: 'Stage' }, { k: 'users', l: 'All users', r: 1, f: (x) => `${nf(x.users)} · ${pc(x.ofTop)}` }, ...d.compare.map((c, i) => ({ k: `c${i}`, l: c.label, r: 1, f: (x) => { const y = c.rows.find((z) => z.id === x.id); return `${nf(y.users)} · ${pc(y.ofTop)}`; } }))]} />}</Load>}
    </Card>
    <Card title="Where unpaid users were last seen" sub="Confirmed = the browser sent an exit event last. Inferred = simply the last thing we observed.">
      <Load q={q} h={180} empty={(d) => !d.dropoffs.length}>{(d) => <Table rows={[...d.dropoffs].sort((a, b) => b.inferred + b.confirmed - a.inferred - a.confirmed)} rowKey={(x) => x.stage} onRow={(x) => r.push(f.href('/users', { ...f.dims, stage: x.stage }))} cols={[{ k: 'stage', l: 'Last stage', f: (x) => STAGE[x.stage] || x.stage }, { k: 'confirmed', l: 'Confirmed exit', r: 1 }, { k: 'inferred', l: 'Inferred drop-off', r: 1 }, { k: 'pages', l: 'Most common last pages', f: (x) => x.pages.map(([p, n]) => `${p} (${n})`).join(', ') }]} />}</Load>
    </Card>
  </Layout>;
}
