import Layout from '../components/Layout.js';
import { Card } from '../components/ui.js';

export default function Help() {
  return <Layout title="Help" sub="How each number is counted." filters={false} hideScope>
    <Card title="Definitions" className="prose">
      <h3>User</h3><p>One browser (GA client id). Two browsers become one user only when both checked out with the same single account UUID. A browser that used several accounts stays one user and is marked as shared.</p>
      <h3>Session, page view, event</h3><p>A session ends after 30 minutes without activity. The same page loaded twice within 5 seconds is one page view. Events are never added to user counts.</p>
      <h3>Landing visit (default)</h3><p>Works like Mixpanel: every landing page visit is its own attempt, and each lead, checkout and payment belongs to the visit that produced it. A payment is tied to its landing page in this order: the landing saved on the lead by the website; else the page where its ticket was created; else the visit of its checkout; else the last landing page in the 30 days before it. A visit ends after 30 minutes without activity, when the tracked session id changes, or when a new campaign or outside referrer arrives. A direct visit carries the last campaign within 30 days, as Mixpanel’s last touch does. A person who left a lead on one page and paid on another is counted on both pages, with the payment only on the page it came from.</p>
      <h3>First and last touch</h3><p>First touch is the earliest recorded visit, even if it was before the selected range, and it never changes. Last touch is the latest visit with a known source before the first payment; a direct return does not erase it. Both credit the person as a whole. Switch with the menu under the date.</p>
      <h3>Paid, organic, unknown</h3><p>Paid needs a Google click id or a paid utm_medium. An fbclid alone is not called paid, because Facebook adds it to unpaid links too. Anything without evidence is Unattributed.</p>
      <h3>Funnel</h3><p>Users who landed in the range, each counted once per stage, and only for stages after that landing. Experiment, progress and completion are optional stages.</p>
      <h3>Experiment variant</h3><p>The first recorded assignment is kept for good. Only actions after it count, and revenue counts only for the services that experiment’s own events name.</p>
      <h3>Payment</h3><p>A payment is successful only if the gateway transaction log says so. Retries of one payment request count once. A payment that cannot be tied to exactly one user is left unattributed.</p>
      <h3>Drop-off</h3><p>“Confirmed” means the last thing recorded was an exit event. Otherwise we show the last stage seen and call it inferred.</p>
      <h3>Time</h3><p>All days and hours are India time. Today refreshes every minute.</p>
    </Card>
  </Layout>;
}
