import { useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout.js';
import { Card, Load, PayTag, Pill, STAGE, StageTag, dayLong, dt, inr, nf, tm, useApi, useFilters } from '../../components/ui.js';

const GROUPS = [['all', 'Everything'], ['key', 'Key moments']];
const Attr = ({ a }) => <>{[`${a.source} / ${a.medium}`, a.campaign && `campaign ${a.campaign}`, a.term && `term ${a.term}`, a.content && `content ${a.content}`, a.gclid && 'Google click id', a.fbclid && 'fbclid', a.referrer && `referrer ${a.referrer}`].filter(Boolean).join(' · ')}</>;

export default function User() {
  const f = useFilters(); const r = useRouter();
  const [view, setView] = useState('key');
  const [allIds, setAllIds] = useState(false);
  const q = useApi(f.ready ? `/api/users/${encodeURIComponent(r.query.id)}` : null, {});
  return <Layout title="User Journey" sub={<span className="mono">GA {r.query.id}</span>} filters={false} hideScope>
    <Load q={q} h={500}>{({ user: u, payments, timeline, truncated }) => {
      const paid = u.stage === 'paid';
      const list = view === 'all' ? timeline : timeline.filter((x, i) => x.type !== 'page' && !(x.type === 'onboarding' && timeline[i - 1]?.title === x.title));
      let last = '';
      return <div className="main">
        <div className="g3">
          <Card title="Outcome" right={<StageTag s={u.stage} />}>
            <dl className="kv"><dt>{paid ? 'Result' : 'Last seen at'}</dt><dd>{paid ? `Paid ${inr(u.revenue)}` : STAGE[u.stage]}{!paid && <small style={{ display: 'block', color: 'var(--mute)' }}>{u.exitConfirmed ? 'Confirmed: an exit event was the last thing recorded' : 'Inferred from the last recorded activity, not a confirmed exit'}</small>}</dd><dt>Payment</dt><dd><PayTag s={u.payStatus} /></dd><dt>Last page</dt><dd>{u.lastPage}</dd><dt>Last activity</dt><dd>{dt(u.lastTs)}</dd><dt>Sessions</dt><dd>{nf(u.sessions)} · {nf(u.pageViews)} page views</dd><dt>Device</dt><dd>{u.device}</dd></dl>
          </Card>
          <Card title="Identity">
            <dl className="kv"><dt>Account UUID</dt><dd className="mono">{u.uuids.length ? <>{(allIds ? u.uuids : u.uuids.slice(0, 4)).map((x) => <div key={x} className="uuid" title={x}>{x}</div>)}{u.uuids.length > 4 && <button className="more" onClick={() => setAllIds(!allIds)}>{allIds ? 'Show less' : `+${u.uuids.length - 4} more accounts`}</button>}</> : 'None yet: no checkout on record'}</dd><dt>GA client id</dt><dd className="mono">{u.gas.join(', ')}</dd><dt>Tickets</dt><dd className="mono">{u.tickets.length ? u.tickets.slice(-12).join(', ') : 'None'}{u.tickets.length > 12 ? ` +${u.tickets.length - 12} older` : ''}</dd><dt>Services</dt><dd>{u.services.join(', ') || '–'}</dd></dl>
            {u.shared && <p className="note">This browser checked out with {u.uuids.length} accounts, so it may be more than one person. They are not merged with other browsers.</p>}
          </Card>
          <Card title="Attribution">
            <dl className="kv"><dt>{paid ? 'Converted from' : 'Latest visit'}</dt><dd>{u.convertingPage || '–'}<small style={{ display: 'block', color: 'var(--mute)' }}>{u.convertingPage ? <>{dt(u.convertingTs)} · {u.convertingTouch.channel}: <Attr a={u.convertingTouch} /></> : 'No landing visit before the payment'}</small></dd>
              <dt>First landing</dt><dd>{u.landing}<small style={{ display: 'block', color: 'var(--mute)' }}>{dt(u.firstTs)} · {u.firstTouch.channel}: <Attr a={u.firstTouch} /></small></dd><dt>Last touch</dt><dd>{u.lastTouch.channel}: <Attr a={u.lastTouch} /></dd></dl>
          </Card>
        </div>
        <Card title="Landing visits" sub="Each landing page visit, and what came of it. A payment belongs to the visit that created its ticket.">{u.visits.length ? <div className="tw"><table><thead><tr><th>Landing page</th><th>Source</th><th>Reached</th><th>Tickets</th><th className="r">Paid</th><th>When</th></tr></thead><tbody>{[...u.visits].reverse().slice(0, 20).map((v, i) => <tr key={i}><td title={v.url}>{v.page}{v.saved && <small>saved on the lead</small>}</td><td>{v.attr.channel}<small>{v.attr.source} / {v.attr.medium}{v.attr.campaign ? ` · ${v.attr.campaign}` : ''}{v.attr.carried ? ' · carried from an earlier visit' : ''}</small></td><td><StageTag s={v.stage} /></td><td className="mono">{v.tickets.join(', ') || '–'}</td><td className="r num">{v.payments ? inr(v.revenue) : '–'}</td><td>{dt(v.ts)}</td></tr>)}</tbody></table></div> : <div className="empty">No landing page visit recorded.</div>}</Card>
        <div className="g2 b">
          <Card title="Experiments">{u.assignments.length ? <div className="rows">{u.assignments.map((a) => <div className="row" key={a.experiment}><span className="ava" style={{ width: 36, height: 36, fontSize: 12 }}>{a.variant.slice(0, 3)}</span><span className="t"><b>{a.experiment}</b><small>{a.label && a.label !== a.variant ? `${a.label} · ` : ''}{dt(a.ts)} · {a.from}{a.conflict.length ? ` · later saw ${a.conflict.join(', ')}` : ''}</small></span></div>)}</div> : <div className="empty">No experiment assignment recorded.</div>}</Card>
          <Card title="Payments">{payments.length ? <div className="tw"><table><thead><tr><th>Service</th><th>Status</th><th className="r">Amount</th><th>Payment id</th><th>Date</th></tr></thead><tbody>{[...payments].sort((a, b) => b.ts - a.ts).slice(0, 12).map((p) => <tr key={p.prid}><td>{p.service || p.serviceId}<small>ticket {p.ticketId || '–'}</small></td><td><PayTag s={p.status} /></td><td className="r num">{inr(p.amount)}</td><td className="mono" title={p.prid}>{p.prid.slice(0, 8)}<small>{p.gateway}{p.txnId ? ` ${p.txnId}` : ''}</small><small>{p.landing ? `from ${p.landing} (${p.landingVia})` : 'no landing page found'}</small></td><td>{dt(p.ts)}</td></tr>)}</tbody></table></div> : <div className="empty">No gateway payment record for this user.</div>}</Card>
        </div>
        <Card title="Timeline" sub={truncated ? `Showing the latest 600 moments; ${nf(truncated)} older ones are hidden` : 'Full QE history for this user, India time'} right={<div className="tabs">{GROUPS.map(([v, l]) => <button key={v} className={`pillbtn ${view === v ? 'on' : ''}`} onClick={() => setView(v)}>{l}</button>)}<Pill href={f.href('/users')}>All users</Pill></div>}>
          <div className="tl">{list.map((x, i) => { const d = dayLong(x.ts); const head = d !== last; last = d; return <div key={i}>{head && <div className="daysep">{d}</div>}<div className={`ev ${x.type}`}><time>{tm(x.ts)}</time><b>{x.title}{x.amount != null ? ` · ${inr(x.amount)}` : ''}</b><small>{[x.page, x.ticket && `ticket ${x.ticket}`, x.service && `service ${x.service}`, x.prid && `payment ${x.prid.slice(0, 8)}`, x.txn && `txn ${x.txn}`].filter(Boolean).join(' · ')}</small>{x.attr && <small>{x.attr.channel}: <Attr a={x.attr} /></small>}{x.note && <small>{x.note}</small>}</div></div>; })}</div>
        </Card>
      </div>;
    }}</Load>
  </Layout>;
}
