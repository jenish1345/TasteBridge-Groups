// Adapter: framework-agnostic handler -> Vercel serverless function.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Handler } from './handlers.js';
import { allow } from './ratelimit.js';

export function toVercel(handler: Handler, opts: { limit?: boolean } = {}) {
  return async function (req: VercelRequest, res: VercelResponse) {
    const ip = String(req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? 'unknown').split(',')[0].trim();
    if (opts.limit && req.method === 'POST' && !allow(ip)) {
      res.status(429).json({ ok: false, error: 'Too many requests — please wait a minute.' });
      return;
    }
    const r = await handler({ method: req.method ?? 'GET', body: req.body, query: req.query as Record<string, string> });
    res.status(r.status).json(r.body);
  };
}
