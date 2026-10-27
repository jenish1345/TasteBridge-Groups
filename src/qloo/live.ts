// Live Qloo Taste AI client: /search, /v2/tags, /v2/insights.
// Server-side only. Handles caching, rate limits (429), transient failures and missing entities.

import type { Config } from '../config.js';
import type { InsightsParams, InsightsResult, ProviderStats, QlooEntity, QlooProvider, QlooTag } from '../types.js';
import { parseHours } from '../core/hours.js';
import { TtlCache } from './cache.js';
import { Limiter, sleep } from './limiter.js';

export class QlooAuthError extends Error {}
export class QlooUnavailableError extends Error {}

type Json = Record<string, any>;

// ----------------------------------------------------------------- normalisation (exported for tests)

export function normalizeTag(raw: any): QlooTag | undefined {
  if (!raw) return undefined;
  if (typeof raw === 'string') return { id: raw, name: raw.split(':').pop()!.replace(/_/g, ' ') };
  const id = raw.id ?? raw.tag_id ?? raw.tag;
  if (!id) return undefined;
  return { id: String(id), name: String(raw.name ?? String(id).split(':').pop()!.replace(/_/g, ' ')), type: raw.type };
}

// Tag families that add payload but no taste signal (proximity lists, visit planning...)
const JUNK_TAG = /^urn:tag:(nearby_attraction|neighborhood_characteristics?|visit_intent)/;

export function normalizeEntity(raw: any, source: QlooEntity['source'] = 'qloo-live', typeHint?: string): QlooEntity | undefined {
  if (!raw) return undefined;
  const id = raw.entity_id ?? raw.id;
  if (!id || !raw.name) return undefined;
  const props: Json = raw.properties ?? {};
  const tagsRaw: any[] = Array.isArray(raw.tags) ? raw.tags : [];
  const geocode: Json = props.geocode ?? {};
  // Qloo exposes the entity type under different fields across endpoints; the request's filter.type is authoritative.
  const typeCandidates: string[] = [raw.subtype, raw.type, ...(Array.isArray(raw.types) ? raw.types : [])].filter((t) => typeof t === 'string' && t.startsWith('urn:entity:'));
  const type: string =
    typeHint && (typeCandidates.includes(typeHint) || !typeCandidates.length)
      ? typeHint
      : (typeCandidates.find((t) => t !== 'urn:entity:locality') ?? typeHint ?? typeCandidates[0] ?? 'urn:entity:unknown');
  const img = props.image ?? props.images?.[0];
  const affinityRaw = raw.query?.affinity ?? raw.affinity;
  const affinity = typeof affinityRaw === 'number' ? Math.min(1, Math.max(0, affinityRaw)) : undefined;
  // Qloo explainability: [{entity_id, score}] of the signal entities that drove this match
  const ex = raw.query?.explainability?.['signal.interests.entities'] ?? raw.explainability;
  const hood = typeof props.neighborhood === 'string' ? props.neighborhood : (props.neighborhood?.name ?? geocode.neighborhood ?? geocode.name);
  const desc: string | undefined = props.description ?? props.short_description ?? raw.description;
  return {
    id: String(id),
    name: String(raw.name),
    type,
    // entities can carry ~60 tags; keep a bounded set (the session blob is sent back and forth with the browser)
    tags: tagsRaw
      .map(normalizeTag)
      .filter((t): t is QlooTag => !!t && !JUNK_TAG.test(t.id))
      .slice(0, 40)
      .map(({ id, name }) => ({ id, name })),
    popularity: typeof raw.popularity === 'number' ? raw.popularity : undefined,
    description: desc ? desc.slice(0, 300) : undefined,
    priceLevel: typeof props.price_level === 'number' ? props.price_level : undefined,
    address: props.address ?? geocode.formatted_address,
    neighborhood: typeof hood === 'string' ? hood : undefined,
    city: typeof geocode.city === 'string' ? geocode.city : undefined,
    metro: typeof geocode.metro === 'string' ? geocode.metro : undefined,
    country: typeof geocode.country === 'string' ? geocode.country : undefined,
    rating: typeof props.business_rating === 'number' ? Math.round(props.business_rating * 10) / 10 : undefined,
    image: typeof img === 'string' ? img : img?.url,
    website: typeof props.website === 'string' ? props.website : undefined,
    phone: typeof props.phone === 'string' ? props.phone : undefined,
    hours: parseHours(props.hours),
    permanentlyClosed: props.is_closed === true ? true : undefined,
    affinity,
    explain: Array.isArray(ex) ? ex.slice(0, 8) : undefined,
    source,
  };
}

function extractEntities(body: Json | undefined): any[] {
  const r = body?.results;
  if (Array.isArray(r)) return r;
  if (Array.isArray(r?.entities)) return r.entities;
  return [];
}

function extractTags(body: Json | undefined): any[] {
  const r = body?.results;
  if (Array.isArray(r)) return r;
  if (Array.isArray(r?.tags)) return r.tags;
  return [];
}

// ----------------------------------------------------------------- client

export interface LiveOptions {
  fetchImpl?: typeof fetch;
  /** base backoff in ms (tests set this to ~1) */
  backoffMs?: number;
  maxAttempts?: number;
}

export class LiveQlooProvider implements QlooProvider {
  readonly mode = 'live' as const;
  private cache: TtlCache<Json>;
  private inflight = new Map<string, Promise<Json>>();
  private limiter: Limiter;
  private s: ProviderStats = { mode: 'live', calls: 0, cacheHits: 0, retries: 0, rateLimited: 0, failures: 0, staleServed: 0, fallbacks: 0 };
  private consecutiveFailures = 0;
  private circuitOpenUntil = 0;
  private fetchImpl: typeof fetch;
  private backoffMs: number;
  private maxAttempts: number;

  constructor(
    private cfg: Config,
    opts: LiveOptions = {},
  ) {
    if (!cfg.qlooKey) throw new QlooAuthError('QLOO_API_KEY is not set');
    this.cache = new TtlCache<Json>({ ttlMs: cfg.cacheTtlSec * 1000, dir: cfg.cacheDir });
    this.limiter = new Limiter(cfg.qlooConcurrency, cfg.qlooRps);
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.backoffMs = opts.backoffMs ?? 600;
    this.maxAttempts = opts.maxAttempts ?? 3;
  }

  stats(): ProviderStats {
    return { ...this.s };
  }

  private cacheKey(path: string, params: URLSearchParams): string {
    const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
    return `${this.cfg.qlooBaseUrl}${path}?${new URLSearchParams(sorted).toString()}`;
  }

  /** Core request path: cache → dedupe → limiter → retry/backoff → stale-if-error. */
  private async get(path: string, params: URLSearchParams, ttlMs?: number): Promise<Json> {
    const key = this.cacheKey(path, params);
    const hit = this.cache.get(key);
    if (hit && !hit.stale) {
      this.s.cacheHits++;
      return hit.value;
    }
    const existing = this.inflight.get(key);
    if (existing) return existing;

    const p = (async () => {
      try {
        const body = await this.fetchWithRetry(path, params);
        this.cache.set(key, body, ttlMs);
        this.consecutiveFailures = 0;
        return body;
      } catch (err) {
        if (err instanceof QlooAuthError) throw err;
        this.s.failures++;
        this.consecutiveFailures++;
        if (this.consecutiveFailures >= 6) this.circuitOpenUntil = Date.now() + 20_000;
        if (hit?.stale) {
          this.s.staleServed++;
          return hit.value;
        }
        throw err instanceof QlooUnavailableError ? err : new QlooUnavailableError(String((err as Error)?.message ?? err));
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
    return p;
  }

  private async fetchWithRetry(path: string, params: URLSearchParams): Promise<Json> {
    if (Date.now() < this.circuitOpenUntil) throw new QlooUnavailableError('Qloo circuit breaker open (recent repeated failures)');
    const url = `${this.cfg.qlooBaseUrl}${path}?${params.toString()}`;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        this.s.calls++;
        const t0 = Date.now();
        const dbg = (what: string) => process.env.QLOO_DEBUG && console.error(`[qloo] ${what} attempt ${attempt} ${Date.now() - t0}ms ${path} ${[...params.keys()].filter((k) => k !== 'query').join(',').slice(0, 90)}`);
        const res = await this.limiter.run(() =>
          this.fetchImpl(url, {
            headers: { 'X-Api-Key': this.cfg.qlooKey!, Accept: 'application/json' },
            signal: AbortSignal.timeout(30_000),
          }),
        );
        dbg(`HTTP ${res.status}`);
        if (res.status === 401 || res.status === 403) throw new QlooAuthError(`Qloo rejected the API key (HTTP ${res.status})`);
        if (res.status === 404) return { success: true, results: [] }; // missing entity → empty, not an error
        if (res.status === 400) {
          // e.g. "no localities match" – treat as empty result but keep message for the agent
          const msg = await res.text().catch(() => '');
          return { success: false, results: [], _badRequest: msg.slice(0, 300) };
        }
        if (res.status === 429 || res.status >= 500) {
          if (res.status === 429) {
            this.s.rateLimited++;
            const ra = Number(res.headers.get('retry-after'));
            const wait = Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 10_000) : this.backoffMs * 2 ** attempt;
            this.limiter.penalize(wait);
          }
          throw new Error(`Qloo HTTP ${res.status}`);
        }
        if (!res.ok) throw new Error(`Qloo HTTP ${res.status}`);
        return (await res.json()) as Json;
      } catch (err) {
        if (err instanceof QlooAuthError) throw err;
        if (process.env.QLOO_DEBUG) console.error(`[qloo] ERROR attempt ${attempt} ${path}: ${String((err as Error)?.message ?? err).slice(0, 120)}`);
        lastErr = err;
        if (attempt < this.maxAttempts) {
          this.s.retries++;
          const jitter = Math.random() * this.backoffMs;
          await sleep(this.backoffMs * 2 ** (attempt - 1) + jitter);
        }
      }
    }
    throw new QlooUnavailableError(`Qloo request failed after ${this.maxAttempts} attempts: ${String((lastErr as Error)?.message ?? lastErr)}`);
  }

  // ------------------------------------------------------------- public API

  async searchEntity(query: string, opts: { types?: string[]; take?: number } = {}): Promise<QlooEntity[]> {
    const p = new URLSearchParams({ query, take: String(opts.take ?? 5) });
    if (opts.types?.length) p.set('types', opts.types.join(','));
    const body = await this.get('/search', p, 7 * 24 * 3600 * 1000);
    const hint = opts.types?.length === 1 ? opts.types[0] : undefined;
    return extractEntities(body).map((r) => normalizeEntity(r, 'qloo-live', hint)).filter((e): e is QlooEntity => !!e);
  }

  async searchTags(query: string, opts: { take?: number } = {}): Promise<QlooTag[]> {
    const p = new URLSearchParams({ 'filter.query': query, take: String(opts.take ?? 5), 'feature.typo_tolerance': 'true' });
    const body = await this.get('/v2/tags', p, 30 * 24 * 3600 * 1000);
    return extractTags(body).map(normalizeTag).filter((t): t is QlooTag => !!t);
  }

  async insights(params: InsightsParams): Promise<InsightsResult> {
    const p = new URLSearchParams({ 'filter.type': params.type, take: String(Math.min(50, params.take ?? 20)) });
    if (params.signalEntities?.length) p.set('signal.interests.entities', params.signalEntities.join(','));
    if (params.signalTags?.length) p.set('signal.interests.tags', params.signalTags.join(','));
    if (params.filterTags?.length) p.set('filter.tags', params.filterTags.join(','));
    if (params.resultEntities?.length) p.set('filter.results.entities', params.resultEntities.join(','));
    if (params.excludeTags?.length) p.set('filter.exclude.tags', params.excludeTags.join(','));
    if (params.locationQuery) p.set('filter.location.query', params.locationQuery);
    if (params.priceMin) p.set('filter.price_level.min', String(params.priceMin));
    if (params.priceMax) p.set('filter.price_level.max', String(params.priceMax));
    if (params.explain) p.set('feature.explainability', 'true');
    const body = await this.get('/v2/insights', p);
    const warnings: string[] = [];
    if (body._badRequest) warnings.push(`Qloo said: ${body._badRequest}`);
    return {
      entities: extractEntities(body).map((r) => normalizeEntity(r, 'qloo-live', params.type)).filter((e): e is QlooEntity => !!e),
      warnings,
    };
  }
}
