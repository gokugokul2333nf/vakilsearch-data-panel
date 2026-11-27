import { nf, pc, useTip } from './ui.js';

// Ordered teal ramp from the design, darkest = largest. Identity is never colour-alone: every slice is named beside it.
export const RAMP = ['#0a776e', '#3dbdab', '#7fe0c3', '#b4e8d6', '#cfe2df', '#dfe9e8'];

export function Funnel3D({ rows, onPick }) {
  const tip = useTip();
  const W = 236; const top = 18; const n = rows.length;
  const fills = ['#a4e8d1', '#7fddc5', '#45c0b0', '#1d9f93', '#128a80', '#0c746c'].slice(0, n);
  const widths = rows.map((_, i) => 1 - (i * 0.62) / Math.max(1, n - 1));
  let y = top;
  const parts = rows.map((r, i) => {
    const h = 50 - i * (n > 5 ? 3.5 : 4.5); const a = widths[i]; const b = i < n - 1 ? (widths[i] + widths[i + 1]) / 2 - 0.02 : a - 0.08;
    const x1 = (W - W * a) / 2; const x2 = (W - W * b) / 2; const c = 7; const y0 = y; y += h + 4;
    return { r, i, mid: y0 + h / 2 + 3, x1, d: `M${x1 + 3} ${y0} Q${W / 2} ${y0 + 9} ${W - x1 - 3} ${y0} Q${W - x1 + 2} ${y0 + 1} ${W - x1 - 1} ${y0 + c} L${W - x2 - 1} ${y0 + h - 4} Q${W - x2 - 4} ${y0 + h + 3} ${W - x2 - 14} ${y0 + h + 4} Q${W / 2} ${y0 + h + 8} ${x2 + 14} ${y0 + h + 4} Q${x2 + 4} ${y0 + h + 3} ${x2 + 1} ${y0 + h - 4} L${x1 + 1} ${y0 + c} Q${x1 - 2} ${y0 + 1} ${x1 + 3} ${y0}Z` };
  });
  return (
    <svg viewBox={`0 0 440 ${y + 8}`} width="100%" role="img" aria-label={`Funnel: ${rows.map((r) => `${r.label} ${r.users}`).join(', ')}`}>
      <defs>{parts.map((p) => <linearGradient key={p.i} id={`fg${p.i}`} x1="0" x2="1"><stop offset="0" stopColor={fills[p.i]} /><stop offset=".5" stopColor={fills[p.i]} stopOpacity=".86" /><stop offset="1" stopColor={fills[p.i]} /></linearGradient>)}</defs>
      <ellipse cx={W / 2} cy={top - 2} rx={W / 2 - 2} ry="9" fill="#c9eee2" /><ellipse cx={W / 2} cy={top - 3} rx={W / 2 - 8} ry="6" fill="#dcf4ec" />
      {parts.map((p) => (
        <g key={p.r.id} style={{ cursor: onPick ? 'pointer' : 'default' }} onClick={() => onPick?.(p.r)} {...tip([p.r.label, `${nf(p.r.users)} users${p.r.ofTop != null ? ` · ${pc(p.r.ofTop)} of landed` : ""}`, p.r.fromPrev != null ? `${pc(p.r.fromPrev)} of ${p.r.prevLabel}` : 'Top of funnel'])}>
          <path d={p.d} fill={`url(#fg${p.i})`} />
          <text x={W / 2} y={p.mid + 5} textAnchor="middle" fontSize="15" fontWeight="600" fill={p.i < 3 ? '#0d2240' : '#fff'}>{nf(p.r.users)}</text>
          <line x1={W - p.x1 + 3} x2="252" y1={p.mid} y2={p.mid} stroke="#c6d8d8" />
          <text x="262" y={p.mid + 5} fontSize="14" fontWeight="650" fill="#0d2240">{nf(p.r.users)}</text>
          <text x="308" y={p.mid + 5} fontSize="13" fill="#4a6072">{p.r.short || p.r.label}</text>
        </g>))}
    </svg>);
}

// axis top = 4 round steps, so every tick label is a clean number
const nice = (m) => { const s = Math.max(1, m / 4); const p = 10 ** Math.floor(Math.log10(s)); return [1, 2, ...(p >= 10 ? [2.5] : []), 5, 10].find((k) => k * p >= s) * p * 4; };

export function Bars({ rows, onPick }) {
  const tip = useTip();
  const W = 420; const H = 236; const L = 40; const B = 34; const T = 24; const max = nice(Math.max(1, ...rows.map((r) => r.users)));
  const bw = (W - L - 8) / rows.length; const y = (v) => T + (1 - v / max) * (H - T - B);
  const grad = ['#86e6cb', '#4fcfcb', '#4fcfcb', '#4fc5c8', '#8bd3ca', '#8fe3c5'];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={rows.map((r) => `${r.label} ${r.users}`).join(', ')}>
      <defs>{rows.map((r, i) => <linearGradient key={r.id} id={`bg${i}`} x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor={grad[i % 6]} stopOpacity=".85" /><stop offset="1" stopColor={grad[(i + 1) % 6]} /></linearGradient>)}</defs>
      {[0, 1, 2, 3, 4].map((k) => { const v = (max / 4) * k; return <g key={k}><line x1={L} x2={W - 4} y1={y(v)} y2={y(v)} stroke="#e0ebea" /><text x={L - 10} y={y(v) + 4} fontSize="11.500" textAnchor="end" fill="#4a6072">{nf(v)}</text></g>; })}
      <line x1={L} x2={L} y1={T} y2={H - B} stroke="#e0ebea" />
      {rows.map((r, i) => { const x = L + i * bw + bw * 0.14; const w = bw * 0.72; const yy = y(r.users); return (
        <g key={r.id} style={{ cursor: onPick ? 'pointer' : 'default' }} onClick={() => onPick?.(r)} {...tip([r.label, `${nf(r.users)} users stopped here`])}>
          <rect x={L + i * bw} y={T} width={bw} height={H - T - B} fill="transparent" />
          <path d={`M${x} ${H - B}V${Math.min(yy + 6, H - B)}Q${x} ${yy} ${x + 6} ${yy}H${x + w - 6}Q${x + w} ${yy} ${x + w} ${Math.min(yy + 6, H - B)}V${H - B}Z`} fill={`url(#bg${i})`} opacity={r.users ? 1 : 0} />
          <text x={x + w / 2} y={yy - 8} fontSize="12" textAnchor="middle" fill="#0d2240">{nf(r.users)}</text>
          <text x={x + w / 2} y={H - 13} fontSize="11.500" textAnchor="middle" fill="#4a6072">{r.short || r.label}</text>
        </g>); })}
    </svg>);
}

export function Donut({ rows, total, label, onPick }) {
  const tip = useTip();
  const sum = rows.reduce((s, r) => s + r.v, 0) || 1; const R = 80; const r0 = 47; let a = -Math.PI / 2;
  const arc = (a0, a1) => { const l = a1 - a0 > Math.PI ? 1 : 0; const p = (r, t) => `${90 + r * Math.cos(t)} ${90 + r * Math.sin(t)}`; return `M${p(R, a0)}A${R} ${R} 0 ${l} 1 ${p(R, a1)}L${p(r0, a1)}A${r0} ${r0} 0 ${l} 0 ${p(r0, a0)}Z`; };
  return (
    <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
      <svg viewBox="0 0 180 180" style={{ width: 'min(180px,46%)', flex: 'none' }} role="img" aria-label={rows.map((r) => `${r.l} ${r.v}`).join(', ')}>
        <defs><filter id="ds" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#3f8f86" floodOpacity=".22" /></filter></defs>
        <g filter="url(#ds)">{rows.map((r, i) => { const d = (r.v / sum) * Math.PI * 2; const s = a; a += d; if (!r.v) return null; return <path key={r.l} d={arc(s, Math.min(a, s + Math.PI * 2 - 0.0001))} fill={RAMP[i] || RAMP[5]} stroke="#f6fbfa" strokeWidth="1.5" style={{ cursor: 'pointer' }} onClick={() => onPick?.(r)} {...tip([r.l, `${nf(r.v)} · ${Math.round((r.v / sum) * 100)}%`])} />; })}</g>
        <circle cx="90" cy="90" r={r0} fill="#f4fbf9" /><text x="90" y="88" textAnchor="middle" fontSize="19" fontWeight="700" fill="#0d2240">{nf(total)}</text><text x="90" y="106" textAnchor="middle" fontSize="11.500" fill="#4a6072">{label}</text>
      </svg>
      <div className="legend" >{rows.map((r, i) => <button key={r.l} onClick={() => onPick?.(r)}><i className="dot" style={{ background: RAMP[i] || RAMP[5] }} /><span>{r.l}</span><b className="num">{Math.round((r.v / sum) * 100)}%</b></button>)}</div>
    </div>);
}

export function Area({ pts, fmt, unit, max: mx, name }) {
  const tip = useTip();
  const W = 430; const H = 226; const L = 46; const B = 32; const T = 18; const Rr = 18;
  const vals = pts.map((p) => p.y).filter((v) => v != null);
  const max = mx || nice(Math.max(1, ...vals));
  const x = (i) => L + 14 + (pts.length < 2 ? 0 : (i * (W - L - 14 - Rr)) / (pts.length - 1)); const y = (v) => T + (1 - v / max) * (H - T - B);
  const ok = pts.map((p, i) => ({ ...p, i })).filter((p) => p.y != null);
  const line = ok.map((p, k) => `${k ? 'L' : 'M'}${x(p.i)} ${y(p.y)}`).join('');
  const every = Math.ceil(pts.length / 7); const dots = pts.length <= 10;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${name}: ${ok.map((p) => `${p.x} ${fmt(p.y)}`).slice(-12).join(', ')}`}>
      <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5fd0bd" stopOpacity=".5" /><stop offset="1" stopColor="#c9eee5" stopOpacity=".12" /></linearGradient></defs>
      {[0, 1, 2, 3, 4].map((k) => { const v = (max / 4) * k; return <g key={k}><line x1={L} x2={W - 8} y1={y(v)} y2={y(v)} stroke="#e0ebea" /><text x={L - 10} y={y(v) + 4} fontSize="11.500" textAnchor="end" fill="#4a6072">{unit === '%' ? `${+v.toFixed(1)}%` : fmt(v)}</text></g>; })}
      {ok.length > 1 && <path d={`${line}L${x(ok[ok.length - 1].i)} ${y(0)}L${x(ok[0].i)} ${y(0)}Z`} fill="url(#ag)" />}
      <path d={line} fill="none" stroke="#23aa99" strokeWidth="2" strokeLinejoin="round" />
      {ok.map((p) => (dots || p.i === ok[ok.length - 1].i) && <circle key={p.i} cx={x(p.i)} cy={y(p.y)} r="4.600" fill="#0f9283" stroke="#f3fbf9" strokeWidth="1.5" />)}
      {dots && ok.map((p) => <text key={p.i} x={x(p.i)} y={y(p.y) - 11} fontSize="11" textAnchor="middle" fill="#0d2240">{fmt(p.y)}</text>)}
      {pts.map((p, i) => (i % every === 0 || i === pts.length - 1) && !(i === pts.length - 1 && i % every !== 0 && i % every < every / 2 + 1 && every > 1) && <text key={p.x} x={x(i)} y={H - 9} fontSize="11" textAnchor="middle" fill="#4a6072">{p.x}</text>)}
      {pts.map((p, i) => <rect key={p.x} x={x(i) - (W - L) / pts.length / 2} y={T} width={(W - L) / pts.length} height={H - T - B} fill="transparent" {...tip([p.x, `${name}: ${p.y == null ? 'no visitors that day' : fmt(p.y)}`, ...(p.extra || [])])} />)}
    </svg>);
}

export const HBars = ({ rows, fmt = nf, onPick }) => { const max = Math.max(1, ...rows.map((r) => r.v)); return <div>{rows.map((r) => <div className="hbar" key={r.l} title={r.l} onClick={() => onPick?.(r)} style={{ cursor: onPick ? 'pointer' : 'default' }}><span>{r.l}</span><div className="bar"><i style={{ width: `${(r.v / max) * 100}%` }} /></div><b className="num">{fmt(r.v)}</b></div>)}</div>; };

export function FunnelTable({ rows, onPick }) {
  const tip = useTip();
  return <div className="fun">{rows.map((r) => <div key={r.id} className={`f ${r.core === false ? 'opt' : ''}`} onClick={() => onPick?.(r)} style={{ cursor: onPick ? 'pointer' : 'default' }} {...tip([r.label, `${nf(r.users)} unique users`, `${pc(r.ofTop)} of the top stage`, ...(r.fromPrev != null ? [`${pc(r.fromPrev)} of ${r.prevLabel}`, `${nf(r.drop)} not seen here (${pc(r.dropPct)})`] : [])])}>
    <div className="lb">{r.label}{r.core === false && <small>optional stage</small>}</div><div className="tr"><i style={{ width: `${r.ofTop || 0}%` }} /></div>
    <div className="mt num"><b>{nf(r.users)}</b><span>{pc(r.ofTop)}</span><span>{r.fromPrev != null ? (r.drop ? `${pc(r.fromPrev)} of prev · −${nf(r.drop)} (${pc(r.dropPct)})` : `${pc(r.fromPrev)} of prev`) : ''}</span></div></div>)}</div>;
}
