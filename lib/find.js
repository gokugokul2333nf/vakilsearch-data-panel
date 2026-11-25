import { hitsByTicket, registryByPrid, registryByUuid, hitsByGa } from './store.js';
import { UUID_RE, gaKey } from './taxonomy.js';
import { nativeByTxn } from './store.js';

// Exact-id lookup across all QE history: GA id, ticket id, payment id, account UUID, gateway transaction id.
export async function globalFind(q) {
  const s = q.trim();
  let gas = [];
  if (UUID_RE.test(s)) {
    const id = s.toLowerCase().slice(0, 36);
    const regs = [...await registryByPrid([id]), ...await registryByUuid([id])];
    gas = (await hitsByTicket(regs.map((r) => r.metadata?.ticketId).filter(Boolean))).map((h) => gaKey(h.ga));
  } else if (/^\d{4,9}$/.test(s)) gas = (await hitsByTicket([s])).map((h) => gaKey(h.ga));
  else if (/^(GA\d\.\d\.)?[\w]+\.\d{9,11}$/i.test(s)) gas = (await hitsByGa([gaKey(s)])).slice(0, 1).map((h) => gaKey(h.ga));
  else if (/^(pay_\w+|\d{10,20})$/.test(s)) {
    const n = await nativeByTxn(s);
    const regs = await registryByPrid(n.map((x) => x.requestId));
    gas = (await hitsByTicket(regs.map((r) => r.metadata?.ticketId).filter(Boolean))).map((h) => gaKey(h.ga));
  }
  return [...new Set(gas.filter(Boolean))].slice(0, 10);
}
