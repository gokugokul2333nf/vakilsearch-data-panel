import Layout from '../components/Layout.js';
import { Card, Load, nf, useApi, useFilters } from '../components/ui.js';
import { HBars } from '../components/charts.js';

const MAP = [['Person key', 'user-track', 'ga (GA client id)', 'Yes'], ['Account UUID', 'payment request registry', 'metadata.uuid', 'Only after checkout'], ['First landing', 'user-track', 'earliest url (landingUrl is empty on QE)', 'Derived'], ['UTM / gclid / fbclid', 'user-track', 'url query string', 'When in the URL'], ['Experiment + variant', 'user-track', 'data.onboardingExperiment / onboardingDesign', 'Since 25 Nov 2026 IST; checkout rows can lack the name'], ['Experiment + variant', 'event tracking', 'eventProperties.abExperiment / onboardingExperiment', 'Yes'], ['Onboarding steps', 'user-track + event tracking', 'onboarding pages, step events', 'Yes'], ['Checkout', 'user-track', 'navigation = checkout', 'Yes'], ['Payment status', 'gateway transaction log', 'status', 'Yes'], ['Payment amount', 'native gateway log', 'amount (Razorpay in paise)', 'Yes'], ['Ticket ↔ payment', 'both', 'ticketId, payment id in checkout URL', 'Yes'], ['Mixpanel', '–', 'account blocked for non-payment on 23 Nov 2026', 'Not used'], ['QE Postgres', '–', 'rejects connections from this machine', 'Not used']];
export default function Health() {
  const f = useFilters();
  const q = useApi(f.ready ? '/api/health' : null, f.globals);
  return <Layout title="Data Health" sub="What the numbers rest on, and what is missing." filters={false} hideScope alerts={q.data?.alerts.length}>
    <Load q={q} h={400}>{(d) => <div className="main">
      <div className="g2 b">
        <Card title="Notes for this range"><div className="rows">{d.alerts.map((a) => <div className="row" key={a.title}><span className="ring" style={{ borderColor: a.level === 'high' ? '#cf4f2d' : a.level === 'med' ? '#e09a1f' : undefined }} /><span className="t"><b style={{ whiteSpace: 'normal' }}>{a.title}</b><small style={{ whiteSpace: 'normal' }}>{a.sub}</small></span><span className="tag grey">{a.tag}</span></div>)}</div></Card>
        <Card title="Payment matching" sub={`${nf(d.payments)} successful payments`}><HBars rows={[...Object.entries(d.matches), ...Object.entries(d.reasons).map(([k, v]) => [`Unattributed: ${k}`, v])].map(([l, v]) => ({ l, v }))} /><p className="note">{nf(d.withUuid)} of {nf(d.users)} users have an account UUID · {nf(d.returning)} were first seen before this range · {nf(d.audit.mergedBrowsers)} browsers merged by UUID · {nf(d.audit.sharedBrowsers)} browsers with several accounts</p></Card>
      </div>
      <div className="g2 b">
        <Card title="Rows read"><dl className="kv" style={{ gridTemplateColumns: '1fr auto' }}>{[['User-track rows in range', d.audit.utsRows], ['Used after host and crawler rules', d.audit.utsInScope], ['From localhost or other hosts', d.audit.otherHostRows], ['From crawlers and automation', d.audit.botRows], ['Repeat page loads removed', d.audit.duplicateViews], ['Rows with landingUrl', d.audit.landingUrlFilled], ['Rows with onboarding data block', d.audit.dataRows], ['Journey and experiment events', d.audit.events], ['Gateway transaction rows', d.audit.txnRows]].map(([k, v]) => [<dt key={k}>{k}</dt>, <dd key={`${k}v`} className="num">{nf(v)}</dd>])}</dl></Card>
        <Card title="QE indices"><dl className="kv">{Object.entries(d.indices).map(([k, v]) => [<dt key={k}>{{ uts: 'User-track', events: 'Events', registry: 'Payment requests', txn: 'Transactions', native: 'Gateway log' }[k]}</dt>, <dd key={`${k}v`} className="mono">{v}</dd>])}</dl></Card>
      </div>
      <Card title="Field mapping"><div className="tw"><table><thead><tr><th>Needed</th><th>Source</th><th>Field</th><th>Available</th></tr></thead><tbody>{MAP.map((m, i) => <tr key={i}>{m.map((c, j) => <td key={j} style={{ maxWidth: 420, whiteSpace: 'normal' }}>{c}</td>)}</tr>)}</tbody></table></div></Card>
    </div>}</Load>
  </Layout>;
}
