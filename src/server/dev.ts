// Plain Node server: serves public/ and /api/*. Used for local dev, Render, Railway, Docker.
import { createServer, type IncomingMessage } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.js';
import { getProvider } from '../qloo/provider.js';
import * as h from './handlers.js';
import { allow } from './ratelimit.js';

const root = resolve(fileURLToPath(new URL('../../public', import.meta.url)));
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.txt': 'text/plain',
};

const routes: Record<string, { handler: h.Handler; limit?: boolean }> = {
  '/api/plan': { handler: h.plan, limit: true },
  '/api/compare': { handler: h.compare, limit: true },
  '/api/pair': { handler: h.pair, limit: true },
  '/api/rebalance': { handler: h.rebalanceHandler, limit: true },
  '/api/health': { handler: h.health },
  '/api/demo': { handler: h.demo },
};

function readBody(req: IncomingMessage, max = 4_000_000): Promise<unknown> {
  return new Promise((res, rej) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > max) { rej(new Error('Body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const s = Buffer.concat(chunks).toString('utf8');
      if (!s) return res(undefined);
      try { res(JSON.parse(s)); } catch { rej(new Error('Invalid JSON')); }
    });
    req.on('error', rej);
  });
}

export function createApp() {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
      if (url.pathname === '/api/plan-stream' && req.method === 'POST') {
        const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? 'unknown').split(',')[0].trim();
        if (!allow(ip, 60)) { res.writeHead(429, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, error: 'Too many requests — please wait a minute.' })); return; }
        let body: unknown;
        try { body = await readBody(req); } catch (e) { res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, error: (e as Error).message })); return; }
        res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store, no-transform', 'x-accel-buffering': 'no' });
        await h.streamPlan(body, (line) => res.write(JSON.stringify(line) + '\n'));
        res.end();
        return;
      }
      const route = routes[url.pathname];
      if (route) {
        const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? 'unknown').split(',')[0].trim();
        if (route.limit && req.method === 'POST' && !allow(ip, 60)) {
          res.writeHead(429, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, error: 'Too many requests — please wait a minute.' }));
          return;
        }
        let body: unknown;
        if (req.method === 'POST') {
          try { body = await readBody(req); } catch (e) {
            res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, error: (e as Error).message }));
            return;
          }
        }
        const r = await route.handler({ method: req.method ?? 'GET', body, query: Object.fromEntries(url.searchParams) });
        res.writeHead(r.status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(r.body));
        return;
      }
      // static
      let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
      if (p === '/' || p === '\\') p = '/index.html';
      const file = join(root, p);
      if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
        return;
      }
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }).end(await readFile(file));
    } catch (e) {
      console.error('[server] error', e);
      res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, error: 'Internal error' }));
    }
  });
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const cfg = loadConfig();
  const port = Number(process.env.PORT ?? cfg.port);
  createApp().listen(port, '0.0.0.0', () => {
    const mode = getProvider(cfg).mode;
    console.log(`TasteBridge Groups on http://localhost:${port}  [Qloo: ${mode === 'live' ? 'LIVE' : 'SAMPLE DATA (set QLOO_API_KEY)'}]`);
  });
}
