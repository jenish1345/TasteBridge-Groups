// SAMPLE DATA provider: deterministic stand-in for Qloo when QLOO_API_KEY is absent.
// It mimics the live provider's contract (search, tags, insights with affinity) over fixtures.

import { AXES, clamp, positionFromTexts, tagText } from '../core/taxonomy.js';
import type { InsightsParams, InsightsResult, ProviderStats, QlooEntity, QlooProvider, QlooTag } from '../types.js';
import { SAMPLE_ALIASES, SAMPLE_CITIES, SAMPLE_ENTITIES, SAMPLE_PLACES, SAMPLE_TAGS } from './fixtures.js';
import { nameSimilarity, normName } from './similarity.js';

function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export class SampleQlooProvider implements QlooProvider {
  readonly mode = 'sample' as const;
  private s: ProviderStats = { mode: 'sample', calls: 0, cacheHits: 0, retries: 0, rateLimited: 0, failures: 0, staleServed: 0, fallbacks: 0 };

  stats(): ProviderStats {
    return { ...this.s };
  }

  private byId(id: string): QlooEntity | undefined {
    return SAMPLE_ENTITIES.find((e) => e.id === id) ?? SAMPLE_PLACES.find((e) => e.id === id);
  }

  async searchEntity(query: string, opts: { types?: string[]; take?: number } = {}): Promise<QlooEntity[]> {
    this.s.calls++;
    const pool: QlooEntity[] = [...SAMPLE_ENTITIES, ...(!opts.types || opts.types.includes('urn:entity:place') ? SAMPLE_PLACES : [])];
    const scored = pool
      .filter((e) => !opts.types?.length || opts.types.includes(e.type))
      .map((e) => {
        const names = [e.name, ...(SAMPLE_ALIASES[e.id] ?? [])];
        const sim = Math.max(...names.map((n) => nameSimilarity(query, n)));
        return { e, sim };
      })
      .filter((x) => x.sim >= 0.62)
      .sort((a, b) => b.sim - a.sim || (b.e.popularity ?? 0) - (a.e.popularity ?? 0));
    return scored.slice(0, opts.take ?? 5).map(({ e }) => ({ ...e }));
  }

  async searchTags(query: string, opts: { take?: number } = {}): Promise<QlooTag[]> {
    this.s.calls++;
    return SAMPLE_TAGS.map((t) => ({ t, sim: nameSimilarity(query, t.name) }))
      .filter((x) => x.sim >= 0.6)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, opts.take ?? 5)
      .map((x) => x.t);
  }

  async insights(params: InsightsParams): Promise<InsightsResult> {
    this.s.calls++;
    const warnings: string[] = [];
    let pool: QlooEntity[];
    if (params.type === 'urn:entity:place') {
      pool = SAMPLE_PLACES;
      if (params.locationQuery) {
        const parts = params.locationQuery.split(',').map((p) => p.trim()).filter(Boolean);
        const cityPart = parts.length > 1 ? parts[parts.length - 1] : parts[0];
        const city = SAMPLE_CITIES.find((c) => nameSimilarity(cityPart, c) >= 0.8 || normName(cityPart).includes(normName(c)));
        let filtered = pool as (QlooEntity & { city: string })[];
        if (city) {
          filtered = filtered.filter((p) => (p as any).city === city);
          if (parts.length > 1) {
            const hood = filtered.filter((p) => nameSimilarity(parts[0], p.neighborhood ?? '') >= 0.8);
            filtered = hood;
          }
        } else {
          const hoodHit = filtered.filter((p) => nameSimilarity(parts[0], p.neighborhood ?? '') >= 0.8);
          filtered = hoodHit;
        }
        pool = filtered;
        if (!pool.length) warnings.push(`Qloo said: no localities match "${params.locationQuery}" (sample fixtures cover: ${SAMPLE_CITIES.join(', ')})`);
      }
    } else {
      pool = SAMPLE_ENTITIES.filter((e) => e.type === params.type);
    }

    if (params.resultEntities?.length) {
      const want = new Set(params.resultEntities);
      pool = [...SAMPLE_PLACES, ...SAMPLE_ENTITIES].filter((p) => want.has(p.id) && p.type === params.type);
    }
    if (params.priceMax) pool = pool.filter((p) => !p.priceLevel || p.priceLevel <= params.priceMax!);
    if (params.priceMin) pool = pool.filter((p) => !p.priceLevel || p.priceLevel >= params.priceMin!);
    if (params.filterTags?.length) {
      const want = new Set(params.filterTags);
      pool = pool.filter((p) => p.tags.some((t) => want.has(t.id)));
    }
    if (params.excludeTags?.length) {
      const ban = new Set(params.excludeTags);
      pool = pool.filter((p) => !p.tags.some((t) => ban.has(t.id)));
    }

    const sigEntities = (params.signalEntities ?? []).map((id) => this.byId(id)).filter((e): e is QlooEntity => !!e);
    const sigTags = (params.signalTags ?? []).map((id) => SAMPLE_TAGS.find((t) => t.id === id)).filter((t): t is QlooTag => !!t);
    const exclude = new Set(sigEntities.map((e) => e.id));
    pool = pool.filter((p) => !exclude.has(p.id));

    const hasSignal = sigEntities.length + sigTags.length > 0;
    let out: QlooEntity[];
    if (!hasSignal) {
      out = [...pool].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0)).map((p) => ({ ...p }));
    } else {
      const sig = signalVector(sigEntities, sigTags);
      out = pool
        .map((p) => {
          const { affinity, shared } = affinityOf(sig, p);
          return {
            ...p,
            affinity,
            explain: {
              sample: true,
              matchedSignals: sigEntities.slice(0, 4).map((e) => e.name),
              sharedTags: shared,
            },
          };
        })
        .sort((a, b) => b.affinity! - a.affinity!);
    }
    return { entities: out.slice(0, Math.min(50, params.take ?? 20)), warnings };
  }
}

interface SignalVec {
  pos: Record<string, number>;
  tagNames: Set<string>;
  count: number;
}

function signalVector(ents: QlooEntity[], tags: QlooTag[]): SignalVec {
  const sums: Record<string, number> = Object.fromEntries(AXES.map((a) => [a, 0]));
  const tagNames = new Set<string>();
  let n = 0;
  const add = (texts: string[], names: string[], price?: number) => {
    const { pos } = positionFromTexts(texts, price);
    for (const a of AXES) sums[a] += pos[a];
    names.forEach((x) => tagNames.add(x.toLowerCase()));
    n++;
  };
  for (const e of ents) add([e.name, ...e.tags.map(tagText)], e.tags.map((t) => t.name), e.priceLevel);
  for (const t of tags) add([tagText(t)], [t.name]);
  const pos = Object.fromEntries(AXES.map((a) => [a, n ? sums[a] / n : 0]));
  return { pos, tagNames, count: n };
}

function affinityOf(sig: SignalVec, p: QlooEntity): { affinity: number; shared: string[] } {
  const { pos } = positionFromTexts([p.name, ...p.tags.map(tagText)], p.priceLevel);
  let num = 0;
  let den = 0;
  for (const a of AXES) {
    const w = 0.3 + Math.abs(sig.pos[a]);
    num += w * Math.abs(sig.pos[a] - pos[a]);
    den += w * 2;
  }
  const sim = 1 - num / den;
  const shared = p.tags.map((t) => t.name).filter((n) => sig.tagNames.has(n.toLowerCase()));
  const d = Math.min(1, shared.length / 3);
  const noise = (hash01(`${[...sig.tagNames].sort().join('|')}::${p.id}`) - 0.5) * 0.06;
  const affinity = clamp(0.28 + 0.5 * sim + 0.18 * d + 0.04 * (p.popularity ?? 0.5) + noise, 0.05, 0.99);
  return { affinity: Math.round(affinity * 1000) / 1000, shared };
}
