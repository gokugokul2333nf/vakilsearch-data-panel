import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon, nf } from './ui.js';

// Filter dropdown: searchable, keyboard-driven, counts as bars. Replaces the native <select>, whose menu the
// browser draws in its own style. `split` groups landing pages by host and shows only the path.
const splitKey = (v) => {
  if (v.startsWith('/')) return ['qe.vakilsearch.com', v];
  if (v.startsWith('(')) return ['Other', v];
  const i = v.indexOf('/');
  return i < 0 ? [v, '/'] : [v.slice(0, i), v.slice(i)];
};

function Mark({ text, q }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

export default function Picker({ label, options, onPick, split = false, noun = 'options', unit = 'users' }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [act, setAct] = useState(0);
  const [right, setRight] = useState(false);
  const wrap = useRef(null); const btn = useRef(null); const input = useRef(null); const list = useRef(null);
  const id = useId();
  const all = options || [];
  const searchable = all.length > 8;
  const max = Math.max(1, ...all.map((o) => o.c || 0));

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const hit = all.filter((o) => !s || String(o.l || o.v).toLowerCase().includes(s) || String(o.v).toLowerCase().includes(s));
    let out;
    if (!split) out = hit.map((o) => ({ o, text: String(o.l || o.v) }));
    else {
      const groups = new Map();
      for (const o of hit) {
        const [h, p] = splitKey(String(o.v));
        if (!groups.has(h)) groups.set(h, { h, n: 0, items: [] });
        const g = groups.get(h); g.n += o.c || 0; g.items.push({ o, text: p });
        if (s && p.toLowerCase().includes(s)) g.pathHit = true;
      }
      // while searching, hosts whose pages match come before hosts that only match by name
      out = [...groups.values()].sort((a, b) => Number(Boolean(b.pathHit)) - Number(Boolean(a.pathHit)) || b.n - a.n).flatMap((g) => [{ head: g.h, size: g.items.length }, ...g.items]);
    }
    let i = 0;
    return out.map((r) => (r.head ? r : { ...r, i: i++ }));
  }, [all, q, split]);
  const count = rows.filter((r) => !r.head).length;

  const close = (refocus = true) => { setOpen(false); setQ(''); setAct(0); if (refocus) btn.current?.focus(); };
  const choose = (o) => { onPick(o); close(); };

  useEffect(() => {
    if (!open) return undefined;
    const r = btn.current.getBoundingClientRect();
    setRight(r.left + 400 > window.innerWidth);
    (searchable ? input.current : list.current)?.focus();
    const out = (e) => { if (!wrap.current?.contains(e.target)) close(false); };
    document.addEventListener('mousedown', out);
    return () => document.removeEventListener('mousedown', out);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setAct(0); }, [q]);
  useEffect(() => { list.current?.querySelector(`[data-i="${act}"]`)?.scrollIntoView({ block: 'nearest' }); }, [act]);

  const keys = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAct((a) => Math.min(count - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAct((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Home' && !searchable) { e.preventDefault(); setAct(0); }
    else if (e.key === 'End' && !searchable) { e.preventDefault(); setAct(count - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); const r = rows.find((x) => x.i === act); if (r) choose(r.o); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') close(false);
  };
  const optId = (i) => `${id}-o${i}`;

  return <div className="pick" ref={wrap}>
    <button ref={btn} type="button" className="pillbtn pick-btn" aria-haspopup="listbox" aria-expanded={open}
      onClick={() => (open ? close(false) : setOpen(true))} onKeyDown={(e) => { if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(true); } }}>
      {label}<Icon n="down" s={14} />
    </button>
    {open && <div className={`pick-pop ${right ? 'r' : ''}`}>
      {searchable && <div className="pick-search"><Icon n="search" s={16} />
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={keys} placeholder={`Search ${noun}`} aria-label={`Search ${noun}`}
          role="combobox" aria-expanded="true" aria-controls={`${id}-l`} aria-activedescendant={count ? optId(act) : undefined} aria-autocomplete="list" />
        {q && <button type="button" aria-label="Clear search" onClick={() => { setQ(''); input.current?.focus(); }}><Icon n="x" s={11} /></button>}
      </div>}
      <div className="pick-meta"><span>{options ? `${nf(count)} ${noun}` : 'Loading…'}</span>{all.some((o) => o.c != null) && <span>{unit}</span>}</div>
      <ul className="pick-list" id={`${id}-l`} role="listbox" aria-label={label} ref={list} tabIndex={searchable ? -1 : 0} onKeyDown={searchable ? undefined : keys}
        aria-activedescendant={!searchable && count ? optId(act) : undefined}>
        {rows.map((r) => (r.head
          ? <li key={`h${r.head}`} className="pick-head" role="presentation"><Mark text={r.head} q={q.trim()} /><span>{nf(r.size)} {r.size === 1 ? 'page' : 'pages'}</span></li>
          : <li key={String(r.o.v)} id={optId(r.i)} data-i={r.i} role="option" aria-selected={r.i === act} className={r.i === act ? 'act' : ''}
            onMouseMove={() => r.i !== act && setAct(r.i)} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(r.o)} title={String(r.o.l || r.o.v)}>
            <span className="pick-t"><Mark text={r.text} q={q.trim()} />{split && r.text === '/' && <small> home page</small>}</span>
            {r.o.c != null && <span className="pick-n"><span className="trk"><i style={{ width: `${Math.max(8, (r.o.c / max) * 100)}%` }} /></span><b>{nf(r.o.c)}</b></span>}
          </li>))}
      </ul>
      {options && !count && <div className="pick-empty">{q ? <>No {noun} match “{q}”</> : `No ${noun} in this range`}</div>}
      <div className="pick-foot"><kbd>↑</kbd><kbd>↓</kbd>move<kbd>↵</kbd>select<kbd>esc</kbd>close</div>
    </div>}
  </div>;
}
