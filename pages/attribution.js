import { useRouter } from 'next/router';
import Layout from '../components/Layout.js';
import { Card, Load, Pager, Table, inr, nf, pc, perfCols, useApi, useFilters, useSort } from '../components/ui.js';
import { HBars } from '../components/charts.js';

const DIMS = [['channel', 'Channel'], ['source', 'Source'], ['medium', 'Medium'], ['campaign', 'Campaign'], ['term', 'Term'], ['content', 'Content']];
const TYPES = { paid: 'Paid', organic: 'Organic', direct: 'Direct', referral: 'Referral', owned: 'Email & messaging', unknown: 'Unknown / unattributed' };

export default function Attribution() {
  const f = useFilters(); const r = useRouter(); const s = useSort(f);
  const dim = f.query.dim || 'channel';
  const q = useApi(f.ready ? '/api/attribution' : null, { ...f.params, dim, sort: s.sort, dir: s.dir, page: f.query.page });
  const model = f.globals.model === 'last' ? 'Last touch' : 'First touch';
  return <Layout title="Marketing Attribution" sub={`${model}: which source, medium and campaign brought each user.`}>
    <div className="g2 b">
      <Card title="Paid, organic and unknown" sub="A visit is called paid or organic only when the URL or referrer proves it"><Load q={q} h={160} empty={(d) => !d.total}>{(d) => <HBars rows={d.types.map((t) => ({ l: TYPES[t.key] || t.key, v: t.visitors }))} />}</Load></Card>
      <Card title="Revenue by type" sub={`${model} attribution of verified payments`}><Load q={q} h={160} empty={(d) => !d.total}>{(d) => <><HBars rows={d.types.map((t) => ({ l: TYPES[t.key] || t.key, v: t.revenue }))} fmt={inr} /><p className="note">Users with a Google click id (gclid / gbraid / wbraid): {nf(d.clickIds.gclid)} · with fbclid: {nf(d.clickIds.fbclid)}</p></>}</Load></Card>
    </div>
    <Card title="Performance" right={<div className="tabs">{DIMS.map(([v, l]) => <button key={v} className={`pillbtn ${dim === v ? 'on' : ''}`} onClick={() => f.set({ dim: v, sort: '', dir: '' })}>{l}</button>)}</div>}>
      <Load q={q} h={300} empty={(d) => !d.total}>{(d) => <><Table {...s} sort={s.sort || 'visitors'} rows={d.rows} rowKey={(x) => x.key} cols={[...perfCols({ k: 'key', l: DIMS.find((x) => x[0] === dim)[1], f: (x) => <>{x.key}{x.sources && <small>{x.sources}</small>}</> }), { k: 'onboardingRate', l: 'Landing → start', r: 1, f: (x) => pc(x.onboardingRate) }]} onRow={(x) => r.push(f.href('/users', { ...f.dims, [dim]: x.key }))} /><Pager d={d} set={f.set} /></>}</Load>
      <p className="note">Conversion = users who landed and then paid ÷ users who landed. Payments and revenue include payments by these users that began from a payment link.</p>
    </Card>
  </Layout>;
}
