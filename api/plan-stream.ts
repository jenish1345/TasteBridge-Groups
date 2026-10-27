import type { VercelRequest, VercelResponse } from '@vercel/node';
import { streamPlan } from '../src/server/handlers.js';
import { allow } from '../src/server/ratelimit.js';

// Newline-delimited JSON stream of the agent's trace followed by the final result (see handlers.streamPlan).
export default async function (req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return void res.status(405).json({ ok: false, error: 'Use POST' });
  const ip = String(req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? 'unknown').split(',')[0].trim();
  if (!allow(ip)) return void res.status(429).json({ ok: false, error: 'Too many requests — please wait a minute.' });
  res.setHeader('content-type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('cache-control', 'no-store, no-transform');
  res.setHeader('x-accel-buffering', 'no');
  await streamPlan(req.body, (line) => res.write(JSON.stringify(line) + '\n'));
  res.end();
}
