// Things a reader must know before trusting a number, computed from the loaded data.
export function alerts(ds, users) {
  const a = ds.audit; const out = [];
  const ok = ds.payments.filter((p) => p.status === 'success');
  const un = ok.filter((p) => !p.person);
  if (a.utsRows && !a.landingUrlFilled) out.push({ tag: 'Tracking', level: 'high', title: 'Landing URL is never stored', sub: 'Derived from the earliest row' });
  if (!a.dataRows) out.push({ tag: 'Tracking', level: 'high', title: 'No variant rows stored yet', sub: 'Variants come from events and the URL' });
  if (un.length) out.push({ tag: 'Revenue', level: 'med', title: `${un.length} of ${ok.length} payments unattributed`, sub: 'Kept in revenue totals, not forced to a user' });
  const est = ok.filter((p) => p.amountFrom !== 'gateway');
  if (est.length) out.push({ tag: 'Revenue', level: 'med', title: `${est.length} amounts not from gateway`, sub: 'No gateway amount was logged' });
  const noUuid = users.filter((u) => !u.uuids.length).length;
  if (users.length) out.push({ tag: 'Identity', level: 'low', title: `${Math.round(((users.length - noUuid) / users.length) * 100)}% of users have a UUID`, sub: 'The rest use the GA client id' });
  const conf = users.filter((u) => u.assignments.some((x) => x.conflict.length)).length;
  if (conf) out.push({ tag: 'Experiment', level: 'med', title: `${conf} saw 2+ variants`, sub: 'First assignment is kept' });
  if (a.sharedBrowsers) out.push({ tag: 'Identity', level: 'med', title: `${a.sharedBrowsers} browsers used several accounts`, sub: 'Kept as one journey each, flagged shared' });
  if (a.botRows) out.push({ tag: 'Quality', level: 'low', title: `${a.botRows.toLocaleString('en-IN')} crawler rows in range`, sub: 'Excluded unless you include bots' });
  return out;
}
