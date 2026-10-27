// Framework-agnostic HTTP handlers shared by Vercel functions (api/*.ts) and the local/Render server.

import { runGroupAgent } from '../agent/agent.js';
import { comparePlans } from '../agent/compare.js';
import { getLlm } from '../agent/llm.js';
import { loadConfig } from '../config.js';
import { rebalance } from '../core/plan.js';
import { findCommonGround } from '../core/pair.js';
import { parseRequest, UserError } from '../core/request.js';
import { DEMO_REQUEST } from '../demo.js';
import { getProvider } from '../qloo/provider.js';
import type { SessionState } from '../types.js';

export interface ApiRequest {
  method: string;
  body?: unknown;
  query?: Record<string, string | undefined>;
}
export interface ApiResponse {
  status: number;
  body: unknown;
}
export type Handler = (req: ApiRequest) => Promise<ApiResponse>;

const ok = (body: unknown): ApiResponse => ({ status: 200, body });

function wrap(method: 'GET' | 'POST', fn: (req: ApiRequest) => Promise<unknown>): Handler {
  return async (req) => {
    if (req.method !== method) return { status: 405, body: { ok: false, error: `Use ${method}` } };
    try {
      return ok(await fn(req));
    } catch (e) {
      if (e instanceof UserError) return { status: 400, body: { ok: false, error: e.message } };
      // Never leak internals (or keys) to the client.
      console.error('[api] error:', e);
      return { status: 500, body: { ok: false, error: 'Something went wrong while planning. Please try again.' } };
    }
  };
}

export const health: Handler = wrap('GET', async () => {
  const cfg = loadConfig();
  const qloo = getProvider(cfg);
  return {
    ok: true,
    app: 'TasteBridge Groups',
    qloo: qloo.mode === 'live' ? 'live' : 'sample',
    llm: getLlm(cfg)?.name ?? null,
    note: qloo.mode === 'sample' ? 'QLOO_API_KEY not set — SAMPLE DATA mode' : 'Qloo live',
  };
});

export const demo: Handler = wrap('GET', async () => ({ ok: true, request: DEMO_REQUEST }));

export const plan: Handler = wrap('POST', async (req) => runGroupAgent(parseRequest(req.body)));

export const compare: Handler = wrap('POST', async (req) => comparePlans(parseRequest(req.body)));

export const pair: Handler = wrap('POST', async (req) => {
  const b = (req.body ?? {}) as any;
  const mk = (x: any, fallback: string) => ({
    name: String(x?.name ?? fallback).slice(0, 40),
    anchors: (Array.isArray(x?.anchors) ? x.anchors : []).slice(0, 10).map((a: any) => (typeof a === 'string' ? a.slice(0, 120) : { text: String(a?.text ?? '').slice(0, 120), kind: a?.kind ?? 'auto' })),
  });
  return findCommonGround({ a: mk(b.a, 'Person A'), b: mk(b.b, 'Person B'), city: typeof b.city === 'string' ? b.city.slice(0, 80) : undefined });
});

export const rebalanceHandler: Handler = wrap('POST', async (req) => {
  const b = (req.body ?? {}) as { session?: SessionState; slot?: string };
  const s = b.session;
  if (!s || typeof s !== 'object' || !s.request || !Array.isArray(s.profiles) || !s.pools) throw new UserError('Missing session — run a plan first.');
  const request = parseRequest(s.request); // re-validate; never trust the client blob
  const session: SessionState = { ...s, request, rejected: s.rejected ?? {}, selection: s.selection ?? {} };
  const slot = typeof b.slot === 'string' ? (b.slot as any) : undefined;
  const r = rebalance(session, slot);
  return { ok: true, itinerary: r.assembled.itinerary, metrics: r.assembled.metrics, audit: r.assembled.audit, warnings: r.assembled.warnings, session: r.session, rebalance: r.diff };
});

/**
 * Streaming variant of /api/plan: newline-delimited JSON. Each line is
 *   {"type":"trace","event":{t,phase,message}}  — as the agent works
 *   {"type":"result","result":<PlanResult>}      — once, at the end
 *   {"type":"error","error":"..."}               — on failure
 */
export async function streamPlan(body: unknown, emit: (line: unknown) => void): Promise<void> {
  try {
    const req = parseRequest(body);
    const result = await runGroupAgent(req, { onEvent: (event) => emit({ type: 'trace', event }) });
    emit({ type: 'result', result });
  } catch (e) {
    if (!(e instanceof UserError)) console.error('[api] stream error:', e);
    emit({ type: 'error', error: e instanceof UserError ? e.message : 'Something went wrong while planning. Please try again.' });
  }
}
