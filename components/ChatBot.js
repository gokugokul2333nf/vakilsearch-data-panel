import { useEffect, useRef, useState } from 'react';

const SUGGEST = [
  'How did revenue change vs the previous period?',
  'Which channel brings the most paying users?',
  'Where do people drop off in the funnel?',
  'Which experiment variant is winning?',
];
const KEY = 'zoe-chat-v1';

// Escape first, then add only our own tags, so model text can never inject HTML.
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
function md(src) {
  const out = []; const lines = src.split('\n'); let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^```/.test(l)) { const buf = []; i += 1; while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]); i += 1; out.push(`<pre>${esc(buf.join('\n'))}</pre>`); continue; }
    if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));
      const head = cells(l); i += 2; const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push(`<div class="zt"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`); continue;
    }
    if (/^\s*[-*•] /.test(l)) { const items = []; while (i < lines.length && /^\s*[-*•] /.test(lines[i])) items.push(`<li>${inline(lines[i++].replace(/^\s*[-*•] /, ''))}</li>`); out.push(`<ul>${items.join('')}</ul>`); continue; }
    if (/^\s*\d+[.)] /.test(l)) { const items = []; while (i < lines.length && /^\s*\d+[.)] /.test(lines[i])) items.push(`<li>${inline(lines[i++].replace(/^\s*\d+[.)] /, ''))}</li>`); out.push(`<ol>${items.join('')}</ol>`); continue; }
    const h = /^(#{1,4})\s+(.*)/.exec(l);
    if (h) { out.push(`<h4>${inline(h[2])}</h4>`); i += 1; continue; }
    if (l.trim()) out.push(`<p>${inline(l)}</p>`);
    i += 1;
  }
  return out.join('');
}

// The bot's face. `mood` drives the animation: idle (float + blink), think (eyes scan, ring spins), talk (mouth bars).
export function Bot({ mood = 'idle', size = 40 }) {
  return <span className={`zbot ${mood}`} style={{ width: size, height: size }} aria-hidden="true">
    <svg viewBox="0 0 48 48" width={size} height={size}>
      <defs>
        <linearGradient id="zb-face" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#b79cff" /><stop offset=".55" stopColor="#7c4dff" /><stop offset="1" stopColor="#4b1fb8" /></linearGradient>
        <radialGradient id="zb-shine" cx=".3" cy=".22" r=".6"><stop offset="0" stopColor="#fff" stopOpacity=".85" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
      </defs>
      <g className="zb-ring"><circle cx="24" cy="25" r="22" fill="none" stroke="url(#zb-face)" strokeWidth="1.6" strokeDasharray="10 7" strokeLinecap="round" /></g>
      <g className="zb-body">
        <line x1="24" y1="9" x2="24" y2="4.5" stroke="#6a3de8" strokeWidth="2" strokeLinecap="round" />
        <circle className="zb-ant" cx="24" cy="4" r="2.6" fill="#c9b5ff" />
        <rect x="8" y="10" width="32" height="28" rx="11" fill="url(#zb-face)" />
        <rect x="8" y="10" width="32" height="28" rx="11" fill="url(#zb-shine)" />
        <rect x="12.5" y="16" width="23" height="14" rx="7" fill="#1d0a52" opacity=".82" />
        <g className="zb-eyes"><ellipse className="zb-eye" cx="19.5" cy="22.4" rx="2.4" ry="2.9" fill="#9ff5ff" /><ellipse className="zb-eye" cx="28.5" cy="22.4" rx="2.4" ry="2.9" fill="#9ff5ff" /></g>
        <g className="zb-mouth" fill="#9ff5ff"><rect x="20" y="26.6" width="1.6" height="1.4" rx=".8" /><rect x="23.2" y="26.6" width="1.6" height="1.4" rx=".8" /><rect x="26.4" y="26.6" width="1.6" height="1.4" rx=".8" /></g>
        <circle cx="8" cy="24" r="2.2" fill="#8f6bff" /><circle cx="40" cy="24" r="2.2" fill="#8f6bff" />
      </g>
    </svg>
  </span>;
}

export default function ChatBot({ context }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // { kind: 'think'|'tool', label }
  const [seen, setSeen] = useState(true);
  const [ready, setReady] = useState(false); // saved chat restored; only then start saving
  const list = useRef(null); const box = useRef(null); const stop = useRef(null);

  useEffect(() => { try { const s = JSON.parse(sessionStorage.getItem(KEY) || '[]'); if (Array.isArray(s)) setMsgs(s); } catch { /* fresh chat */ } setSeen(Boolean(sessionStorage.getItem(`${KEY}-seen`))); setReady(true); }, []);
  useEffect(() => { if (ready && !busy) sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-40))); }, [msgs, busy, ready]);
  useEffect(() => { const el = list.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs, status, open]);
  useEffect(() => { if (open) { box.current?.focus(); sessionStorage.setItem(`${KEY}-seen`, '1'); setSeen(true); } }, [open]);
  useEffect(() => { const k = (e) => { if (e.key === 'Escape') setOpen(false); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, []);

  async function ask(text) {
    const q = text.trim(); if (!q || busy) return;
    const history = [...msgs, { role: 'user', text: q }];
    setMsgs([...history, { role: 'assistant', text: '', tools: [] }]); setInput(''); setBusy(true); setStatus({ kind: 'think', label: 'Thinking' });
    const patch = (fn) => setMsgs((m) => { const c = [...m]; c[c.length - 1] = fn({ ...c[c.length - 1] }); return c; });
    const ctl = new AbortController(); stop.current = ctl;
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history.map(({ role, text: t }) => ({ role, text: t })), context }), signal: ctl.signal });
      if (!r.ok || !r.body) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `Request failed (${r.status})`); }
      const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n'); buf = parts.pop();
        for (const p of parts) {
          if (!p.startsWith('data: ')) continue;
          const ev = JSON.parse(p.slice(6));
          if (ev.type === 'text') { setStatus(null); patch((m) => ({ ...m, text: m.text + ev.text })); }
          else if (ev.type === 'thinking') setStatus({ kind: 'think', label: 'Thinking' });
          else if (ev.type === 'tool') { setStatus({ kind: 'tool', label: ev.label }); patch((m) => ({ ...m, tools: [...(m.tools || []), ev.label] })); }
          else if (ev.type === 'step') { patch((m) => ({ ...m, text: m.text && !m.text.endsWith('\n') ? `${m.text}\n\n` : m.text })); setStatus({ kind: 'think', label: 'Reading the numbers' }); }
          else if (ev.type === 'error') patch((m) => ({ ...m, error: ev.message }));
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') patch((m) => ({ ...m, error: e.message }));
    } finally { setBusy(false); setStatus(null); stop.current = null; }
  }

  const mood = status ? 'think' : busy ? 'talk' : 'idle';
  return <>
    <button className={`zlaunch ${open ? 'gone' : ''}`} onClick={() => setOpen(true)} aria-label="Ask Zoe, the data assistant" aria-expanded={open}>
      <span className="zl-pulse" /><Bot mood={busy ? mood : 'idle'} size={44} />{!seen && <span className="zl-hi">Ask me anything</span>}
    </button>
    <section className={`zchat ${open ? 'on' : ''}`} role="dialog" aria-label="Zoe data assistant" aria-hidden={!open}>
      <header className="zc-head"><Bot mood={mood} size={42} /><div><b>Zoe</b><small>{status ? `${status.label}…` : busy ? 'Answering…' : 'Your data assistant · QE'}</small></div>
        {msgs.length > 0 && <button className="zc-icon" onClick={() => { stop.current?.abort(); setMsgs([]); }} title="New chat" aria-label="Start a new chat"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg></button>}
        <button className="zc-icon" onClick={() => setOpen(false)} aria-label="Close chat"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
      </header>
      <div className="zc-list" ref={list} aria-live="polite">
        {msgs.length === 0 && <div className="zc-hello"><Bot mood="idle" size={78} /><h3>Hi, I’m Zoe</h3><p>Ask me about visitors, funnels, experiments, revenue or a single user’s journey. I read the live QE numbers behind this dashboard, and I can answer general questions too.</p>
          <div className="zc-sugg">{SUGGEST.map((s, i) => <button key={s} style={{ animationDelay: `${0.12 + i * 0.07}s` }} onClick={() => ask(s)}>{s}</button>)}</div></div>}
        {msgs.map((m, i) => <div key={i} className={`zc-msg ${m.role}`}>
          {m.role === 'assistant' && <Bot mood={i === msgs.length - 1 ? mood : 'idle'} size={28} />}
          <div className="zc-bub">
            {m.tools?.length > 0 && <div className="zc-tools">{m.tools.map((t, k) => <span key={k}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M4 12.5 9.5 18 20 6.5" /></svg>{t}</span>)}</div>}
            {m.role === 'user' ? <p>{m.text}</p> : <div className="zc-md" dangerouslySetInnerHTML={{ __html: md(m.text) + (busy && i === msgs.length - 1 && !status && m.text ? '<span class="zc-caret"></span>' : '') }} />}
            {busy && i === msgs.length - 1 && status && <div className={`zc-status ${status.kind}`}><span className="zc-dots"><i /><i /><i /></span>{status.label}</div>}
            {m.error && <div className="zc-err">{m.error}</div>}
          </div>
        </div>)}
      </div>
      <form className="zc-input" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
        <textarea ref={box} rows={1} value={input} placeholder="Ask about your data…" aria-label="Message Zoe" onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input); } }} />
        {busy ? <button type="button" className="zc-send stop" onClick={() => stop.current?.abort()} aria-label="Stop"><svg width="16" height="16" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" /></svg></button>
          : <button className="zc-send" disabled={!input.trim()} aria-label="Send"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 6l6 6-6 6" /></svg></button>}
      </form>
    </section>
  </>;
}
