import { useRouter } from 'next/router';
import Layout from '../../components/Layout.js';
import { Card, Icon, Link, Load, PayTag, Pager, StageTag, Table, dt, inr, useApi, useFilters, useSort } from '../../components/ui.js';

export default function Users() {
  const f = useFilters(); const r = useRouter(); const s = useSort(f);
  const term = String(f.query.q || '');
  const q = useApi(f.ready ? '/api/users' : null, { ...f.params, q: term, sort: s.sort, dir: s.dir, page: f.query.page });
  return <Layout title="User Explorer" sub="Follow one person from first landing to payment or last seen step." dims={['channel', 'source', 'campaign', 'landing', 'experiment', 'stage', 'pay', 'service', 'device']}>
    {term && <div className="filters"><span className="chip"><span>Search: {term}</span><button aria-label="Clear search" onClick={() => f.set({ q: '' })}><Icon n="x" s={13} /></button></span></div>}
    <Card title="Users">
      <Load q={q} h={420}>{(d) => (!d.total ? <div className="empty">{d.outside.length ? <>Not in this date range, but found in QE history: {d.outside.map((id) => <Link key={id} className="pillbtn" style={{ margin: 4 }} href={f.href(`/users/${id}`)}>GA {id}</Link>)}</> : 'No users match. Try a wider date range, or search an exact UUID, GA ID, ticket or payment ID.'}</div> : <>
        <Table {...s} sort={s.sort || 'lastTs'} rows={d.rows} rowKey={(x) => x.id} onRow={(x) => r.push(f.href(`/users/${x.id}`))} cols={[
          { k: 'id', l: 'User', sort: false, f: (x) => <><span className="mono">{x.uuids[0] ? x.uuids[0].slice(0, 13) : 'no UUID yet'}{x.uuids.length > 1 ? ` +${x.uuids.length - 1}` : ''}</span><small className="mono">GA {x.gas.join(', ')}</small></> },
          { k: 'landing', l: 'First page', f: (x) => <div style={{ maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.landing}<small title={x.landingUrl}>{x.landingUrl}</small></div> },
          { k: 'convertingPage', l: 'Converting visit', f: (x) => <div style={{ maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis' }} title={x.convertingUrl}>{x.convertingPage || '–'}<small>{x.convertingPage ? `${x.convertingChannel} · ${dt(x.convertingTs)}${x.visits > 1 ? ` · ${x.visits} visits` : ''}` : ''}</small></div> }, { k: 'source', l: 'Source', f: (x) => <div style={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis' }} title={x.campaign}>{x.source} / {x.medium}<small>{x.campaign || 'no campaign'}</small></div> },
          { k: 'experiment', l: 'Experiment', f: (x) => (x.experiment ? <div style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }} title={x.experiment}>{x.variant}<small>{x.experiment}{x.moreExp ? ` +${x.moreExp}` : ''}</small></div> : '–') }, { k: 'lastPage', l: 'Last page', f: (x) => <div style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }} title={x.lastPage}>{x.lastPage.replace(/^qe[\w-]*\.(vakilsearch|zolvit)\.com(?=\/)/, '')}</div> }, { k: 'stage', l: 'Stage', f: (x) => <StageTag s={x.stage} /> }, { k: 'payStatus', l: 'Payment', f: (x) => <PayTag s={x.payStatus} /> }, { k: 'revenue', l: 'Paid', r: 1, f: (x) => (x.revenue ? inr(x.revenue) : '–') }, { k: 'lastTs', l: 'Last activity', r: 1, f: (x) => dt(x.lastTs) }]} />
        <Pager d={d} set={f.set} /></>)}</Load>
    </Card>
  </Layout>;
}
