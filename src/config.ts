// Environment configuration. All secrets stay server-side.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Minimal .env loader for local dev (never overrides real environment variables; no-op if the file is absent). */
function loadDotEnv(file = resolve(process.cwd(), '.env')): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    const v = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined && v !== '') process.env[m[1]] = v;
  }
}
if (!process.env.VITEST) loadDotEnv();

export interface Config {
  qlooKey: string | undefined;
  qlooBaseUrl: string;
  qlooRps: number;
  qlooConcurrency: number;
  cacheTtlSec: number;
  cacheDir: string | undefined;
  anthropicKey: string | undefined;
  openaiKey: string | undefined;
  llmModel: string | undefined;
  openaiBaseUrl: string;
  openaiModel: string;
  port: number;
}

function num(v: string | undefined, d: number): number {
  const n = v === undefined || v === '' ? NaN : Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const blank = (s: string | undefined) => (s && s.trim() ? s.trim() : undefined);
  return {
    qlooKey: blank(env.QLOO_API_KEY),
    qlooBaseUrl: (blank(env.QLOO_BASE_URL) ?? 'https://hackathon.api.qloo.com').replace(/\/+$/, ''),
    qlooRps: num(env.QLOO_RPS, 8),
    qlooConcurrency: num(env.QLOO_CONCURRENCY, 6),
    cacheTtlSec: num(env.QLOO_CACHE_TTL, 6 * 3600),
    cacheDir: blank(env.QLOO_CACHE_DIR),
    anthropicKey: blank(env.ANTHROPIC_API_KEY),
    openaiKey: blank(env.OPENAI_API_KEY),
    llmModel: blank(env.LLM_MODEL),
    openaiBaseUrl: (blank(env.OPENAI_BASE_URL) ?? 'https://api.openai.com/v1').replace(/\/+$/, ''),
    openaiModel: blank(env.OPENAI_MODEL) ?? 'gpt-4o-mini',
    port: num(env.PORT, 3000),
  };
}
