import Anthropic from '@anthropic-ai/sdk';
import { LABELS, TOOLS, runTool, validate } from '../../lib/chat-tools.js';

export const config = { api: { responseLimit: false } };

const MODEL = 'claude-opus-5-5';
const MAX_TURNS = 10; // model calls per question (each tool round is one)

// Frozen, so it stays a cache hit across questions. Per-request context goes in the user turn.
const SYSTEM = `You are Zoe, the assistant inside Zolvit's QE attribution dashboard (Zolvit was formerly Vakilsearch). People ask you about marketing attribution, landing pages, onboarding funnels, A/B experiments, users' journeys and revenue, and sometimes general questions.

How to answer:
- For anything about the dashboard's numbers, call query_panel first and answer from what it returns. Never invent or estimate a figure; if the data cannot answer, say what is missing.
- Use the page and date range the person is looking at (given with each question) unless they ask for something else. State the date range you used.
- Lead with the answer in one or two sentences, then the supporting numbers. Use short bullet lists or a small markdown table when comparing; no long preambles.
- Money is in Indian rupees (₹, use Indian digit grouping like ₹1,23,456). Times are Asia/Kolkata.
- For general questions (definitions, how a metric works, marketing or analytics advice, anything else) answer directly and concisely.

What the data means:
- This is QE (test) data only, read-only. A person is a GA client id; browsers merge only when they share exactly one account UUID.
- Default model "visit": each landing visit is an attempt, and each lead, checkout and payment belongs to the visit that produced it. "first" credits the first touch ever, "last" the last non-direct touch before the first payment.
- Stages: landing → onboarding start → progress → complete → checkout → paid. Revenue counts gateway "success" payments only, one per payment request.
- Conversion = paying people ÷ people who landed. Experiment conversion = people who paid after being assigned ÷ people assigned; the first recorded variant wins.
- Unattributed payment: a successful payment that could not be tied to a tracked person.`;

const send = (res, obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

const toMessages = (history, ctx) => {
  const turns = history.filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.trim()).slice(-20)
    .map((m) => ({ role: m.role, content: m.text.slice(0, 8000) }));
  while (turns.length && turns[0].role !== 'user') turns.shift();
  const last = turns[turns.length - 1];
  if (!last || last.role !== 'user') return null;
  const today = new Date(Date.now() + 330 * 60e3).toISOString().slice(0, 10);
  last.content = [{ type: 'text', text: `[Dashboard context — today ${today} IST; ${JSON.stringify(ctx).slice(0, 1500)}]` }, { type: 'text', text: last.content }];
  return turns;
};

export default async function chat(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'ANTHROPIC_API_KEY is not set on the server' });
  const messages = toMessages(Array.isArray(req.body?.messages) ? req.body.messages : [], req.body?.context || {});
  if (!messages) return res.status(400).json({ error: 'Send at least one user message' });

  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  const abort = new AbortController();
  res.on('close', () => abort.abort());

  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the server env
  let retries = 0;
  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const stream = client.beta.messages.stream({
        model: MODEL, max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', // a policy decline is retried on a fallback model
        output_config: { effort: 'medium' }, cache_control: { type: 'ephemeral' },
        system: SYSTEM, tools: TOOLS, messages,
      }, { signal: abort.signal });

      for await (const ev of stream) {
        if (ev.type === 'content_block_start' && ev.content_block.type === 'thinking') send(res, { type: 'thinking' });
        else if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') send(res, { type: 'text', text: ev.delta.text });
      }
      let msg;
      try { msg = await stream.finalMessage(); retries = 0; } catch (err) {
        if (err instanceof Anthropic.APIError || abort.signal.aborted || retries++ >= 2) throw err;
        turn -= 1; continue; // unparseable tool input or a dropped connection: re-issue the same turn
      }

      if (msg.stop_reason === 'refusal') { send(res, { type: 'text', text: "\n\nI can't help with that one." }); break; }
      if (msg.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: msg.content }); continue; }
      const calls = msg.content.filter((b) => b.type === 'tool_use');
      if (!calls.length) break;
      if (msg.stop_reason === 'max_tokens') throw new Error('The answer ran too long. Try a narrower question.');

      messages.push({ role: 'assistant', content: msg.content });
      const results = await Promise.all(calls.map(async (c) => {
        const v = validate(c.input);
        if (v.error) return { type: 'tool_result', tool_use_id: c.id, is_error: true, content: v.error };
        send(res, { type: 'tool', label: LABELS[v.endpoint], endpoint: v.endpoint });
        try {
          const r = await runTool(v);
          return { type: 'tool_result', tool_use_id: c.id, is_error: r.isError, content: r.text };
        } catch (e) {
          console.error('[chat tool]', v.endpoint, e.message);
          return { type: 'tool_result', tool_use_id: c.id, is_error: true, content: 'QE data source did not answer' };
        }
      }));
      messages.push({ role: 'user', content: results });
      send(res, { type: 'step' });
      if (turn === MAX_TURNS - 1) send(res, { type: 'text', text: '\n\nI stopped after several lookups. Ask a narrower question for a full answer.' });
    }
    send(res, { type: 'done' });
  } catch (err) {
    if (!abort.signal.aborted) {
      console.error('[chat]', err?.status || '', err?.name, err?.message);
      const message = err instanceof Anthropic.AuthenticationError ? 'The Claude API key was rejected.'
        : err instanceof Anthropic.RateLimitError ? 'Too many requests right now. Try again in a minute.'
          : err instanceof Anthropic.APIError ? 'The assistant is unavailable right now.' : err?.message || 'Something went wrong.';
      send(res, { type: 'error', message });
    }
  }
  return res.end();
}
