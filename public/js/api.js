// API client. The plan endpoint streams newline-delimited JSON so the UI can show the agent working live.
export async function getJSON(path) {
  const res = await fetch(path);
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.ok === false) throw new Error(j.error || `Request failed (${res.status})`);
  return j;
}

export async function postJSON(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.ok === false) throw new Error(j.error || `Request failed (${res.status})`);
  return j;
}

/** Streams /api/plan-stream. Calls onTrace for each trace event; resolves with the final result. */
export async function streamPlan(body, onTrace) {
  let res;
  try {
    res = await fetch('/api/plan-stream', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    return postJSON('/api/plan', body);
  }
  const type = res.headers.get('content-type') || '';
  if (!res.ok || !type.includes('ndjson') || !res.body) {
    if (res.status === 404 || res.status === 405) return postJSON('/api/plan', body); // host without streaming
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `Request failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let result;
  const handle = (line) => {
    if (!line.trim()) return;
    const m = JSON.parse(line);
    if (m.type === 'trace') onTrace?.(m.event);
    else if (m.type === 'result') result = m.result;
    else if (m.type === 'error') throw new Error(m.error);
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); handle(line); }
  }
  if (buf.trim()) handle(buf);
  if (!result) throw new Error('The plan stream ended before a result arrived.');
  return result;
}

/** Releases queued events at a readable pace (bursty server events would otherwise flash by). */
export class Pacer {
  constructor(fn) { this.fn = fn; this.q = []; this.timer = null; this.waiters = []; }
  push(ev) { this.q.push(ev); if (!this.timer) this.#next(); }
  #next() {
    const ev = this.q.shift();
    if (!ev) { this.timer = null; this.waiters.splice(0).forEach((w) => w()); return; }
    try { this.fn(ev); } catch (e) { console.error(e); }
    const n = this.q.length;
    this.timer = setTimeout(() => this.#next(), n > 40 ? 28 : n > 15 ? 55 : 105);
  }
  drain() { return this.q.length || this.timer ? new Promise((r) => this.waiters.push(r)) : Promise.resolve(); }
}
