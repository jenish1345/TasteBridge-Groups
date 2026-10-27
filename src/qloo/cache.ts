// Server-side response cache: in-memory TTL map + optional disk persistence + stale-if-error.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface Entry<V> {
  value: V;
  expires: number; // fresh until
  stale: number; // usable-on-error until
}

export interface CacheOptions {
  ttlMs: number;
  staleMs?: number;
  maxEntries?: number;
  dir?: string;
}

export class TtlCache<V> {
  private map = new Map<string, Entry<V>>();
  constructor(private opts: CacheOptions) {
    if (opts.dir) {
      try {
        mkdirSync(opts.dir, { recursive: true });
      } catch {
        this.opts = { ...opts, dir: undefined };
      }
    }
  }

  private file(key: string): string | undefined {
    if (!this.opts.dir) return undefined;
    return join(this.opts.dir, createHash('sha1').update(key).digest('hex') + '.json');
  }

  private load(key: string): Entry<V> | undefined {
    const f = this.file(key);
    if (!f) return undefined;
    try {
      return JSON.parse(readFileSync(f, 'utf8')) as Entry<V>;
    } catch {
      return undefined;
    }
  }

  /** Returns a fresh hit, or a stale hit flagged as such. */
  get(key: string, now = Date.now()): { value: V; stale: boolean } | undefined {
    let e = this.map.get(key) ?? this.load(key);
    if (!e) return undefined;
    if (!this.map.has(key)) this.map.set(key, e);
    if (now <= e.expires) return { value: e.value, stale: false };
    if (now <= e.stale) return { value: e.value, stale: true };
    this.map.delete(key);
    return undefined;
  }

  set(key: string, value: V, ttlMs = this.opts.ttlMs, now = Date.now()): void {
    const e: Entry<V> = { value, expires: now + ttlMs, stale: now + ttlMs + (this.opts.staleMs ?? 7 * 864e5) };
    this.map.set(key, e);
    const max = this.opts.maxEntries ?? 2000;
    if (this.map.size > max) {
      const first = this.map.keys().next().value;
      if (first !== undefined) this.map.delete(first);
    }
    const f = this.file(key);
    if (f) {
      try {
        writeFileSync(f, JSON.stringify(e));
      } catch {
        /* disk cache is best-effort */
      }
    }
  }

  get size(): number {
    return this.map.size;
  }
}
