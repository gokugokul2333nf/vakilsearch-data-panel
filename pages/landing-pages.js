import { useRouter } from 'next/router';
import Layout from '../components/Layout.js';
import { Card, Load, Pager, Pill, Table, nf, pc, perfCols, useApi, useFilters, useSort } from '../components/ui.js';
import { FunnelTable, HBars } from '../components/charts.js';

function Detail({ f, landing }) {
  const a = useApi('/api/attribution', { ...f.params, dim: 'campaign' });
  const c = useApi('/api/attribution', { ...f.params, dim: 'channel' });
  const fn = useApi('/api/funnel', f.params);
  const ex = useApi('/api/experiments', f.params);
  return <>
    <Card title={`Funnel: ${landing}`} right={<Pill href={f.href('/users', f.dims)}>View users</Pill>}><Load q={fn} h={200}>{(d) => <FunnelTable rows={d.rows} />}</Load></Card>
    <div className="g2 b">
      <Card title="Traffic to this page"><Load q={c} h={120} empty={(d) => !d.total}>{(d) => <HBars rows={d.rows.map((x) => ({ l: x.key, v: x.visitors }))} />}</Load></Card>
      <Card title="Campaigns to this page"><Load q={a} h={80} empty={(d) => !d.total}>{(d) => <HBars rows={d.rows.slice(0, 6).map((x) => ({ l: x.key, v: x.visitors }))} />}</Load></Card>
    </div>
    <Card title="Experiment variants seen by these users"><Load q={ex} h={120} empty={(d) => !d.rows.length}>{(d) => <Table rows={d.rows.flatMap((e) => e.variants.map((v) => ({ ...v, exp: e.name })))} rowKey={(x) => x.exp + x.variant} cols={[{ k: 'exp', l: 'Experiment' }, { k: 'variant', l: 'Variant' }, { k: 'assigned', l: 'Assigned', r: 1 }, { k: 'onboarding', l: 'Onboarding', r: 1 }, { k: 'checkout', l: 'Checkout', r: 1 }, { k: 'payers', l: 'Paid', r: 1 }, { k: 'conversion', l: 'Conversion', r: 1, f: (x) => pc(x.conversion) }]} />}</Load></Card>
  </>;
}

export default function LandingPages() {
  const f = useFilters(); const r = useRouter(); const s = useSort(f);
  const landing = f.dims.landing;
  const q = useApi(f.ready ? '/api/landing-pages' : null, { ...f.params, sort: s.sort, dir: s.dir, page: f.query.page });
  return <Layout title="Landing Pages" sub={landing ? `Everything about visitors who landed on ${landing}` : 'Every landing page found in the data, with what its visitors did next.'}>
    {landing && <Detail f={f} landing={landing} />}
    <Card title="Landing page performance" sub="Click a page for its funnel, campaigns, variants and users">
      <Load q={q} h={360} empty={(d) => !d.total}>{(d) => <><Table {...s} sort={s.sort || 'visitors'} rows={d.rows} rowKey={(x) => x.key} onRow={(x) => r.push({ pathname: '/landing-pages', query: { ...f.globals, ...f.dims, landing: x.key } })}
        cols={[...perfCols({ k: 'key', l: 'Landing page' }).slice(0, 2), { k: 'views', l: 'Page views', r: 1, f: (x) => nf(x.views) }, ...perfCols({}).slice(2, 6), { k: 'onboardingRate', l: 'To onboarding', r: 1, f: (x) => pc(x.onboardingRate) }, { k: 'conversion', l: 'To payment', r: 1, f: (x) => pc(x.conversion) }, { k: 'dropRate', l: 'Drop-off', r: 1, f: (x) => pc(x.dropRate) }]} /><Pager d={d} set={f.set} /></>}</Load>
      <p className="note">{!f.globals.model ? 'Visitors = users with a landing visit on this page. Leads, checkouts and payments count here only when they came from that visit (the ticket created on this page, else the same visit), so a person who left a lead on one page and paid on another is counted on both, with the payment only on the page it came from.' : `Visitors = users whose ${f.globals.model === 'last' ? 'last attributed' : 'first'} landing was this page.`} Page views count every deduplicated view, including by people who landed elsewhere.</p>
    </Card>
  </Layout>;
}
