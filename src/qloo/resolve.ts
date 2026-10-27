// Entity resolution: free-text taste anchor -> real Qloo entity (or tag), with reflection-driven retries.

import { axisSignal, AXES } from '../core/taxonomy.js';
import type { Anchor, AnchorKind, QlooEntity, QlooProvider, QlooTag, ResolvedAnchor } from '../types.js';
import { nameSimilarity } from './similarity.js';

export const KIND_TO_URN: Partial<Record<AnchorKind, string>> = {
  artist: 'urn:entity:artist',
  movie: 'urn:entity:movie',
  tv_show: 'urn:entity:tv_show',
  book: 'urn:entity:book',
  videogame: 'urn:entity:videogame',
  brand: 'urn:entity:brand',
  place: 'urn:entity:place',
};

export const ACCEPT_THRESHOLD = 0.72;

export type TraceFn = (phase: 'act' | 'observe' | 'reflect' | 'retry', message: string, data?: unknown) => void;

export interface ResolveDeps {
  qloo: QlooProvider;
  trace?: TraceFn;
  /** Optional LLM that proposes alternative spellings / the likely entity name. */
  rewrite?: (text: string, kind: AnchorKind) => Promise<string[]>;
}

/** Deterministic query rewrites used when the first lookup finds nothing. */
export function deterministicRewrites(text: string): string[] {
  const out = new Set<string>();
  const t = text.trim();
  const noParen = t.replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (noParen && noParen !== t) out.add(noParen);
  const noNoise = noParen.replace(/\b(the\s+)?(movie|film|album|band|song|series|tv show|show|game|video game|restaurant|brand|novel|book)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  if (noNoise && noNoise !== t) out.add(noNoise);
  const by = /^(.*)\s+by\s+(.*)$/i.exec(noParen);
  if (by) {
    out.add(by[2].trim());
    out.add(by[1].trim());
  }
  const dash = /^(.*?)\s+[-–—:]\s+(.*)$/.exec(noParen);
  if (dash) out.add(dash[1].trim());
  const ascii = noParen.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  if (ascii !== noParen) out.add(ascii);
  const noYear = noParen.replace(/\b(19|20)\d{2}\b/g, '').replace(/\s+/g, ' ').trim();
  if (noYear && noYear !== noParen) out.add(noYear);
  out.delete(t);
  return [...out].filter(Boolean);
}

function pickBest(text: string, ents: QlooEntity[]): { e: QlooEntity; sim: number } | undefined {
  let best: { e: QlooEntity; sim: number; v: number } | undefined;
  for (const e of ents) {
    const sim = nameSimilarity(text, e.name);
    const v = sim * 0.85 + (e.popularity ?? 0.3) * 0.15;
    if (!best || v > best.v) best = { e, sim, v };
  }
  return best && { e: best.e, sim: best.sim };
}

function pickBestTag(text: string, tags: QlooTag[]): { t: QlooTag; sim: number } | undefined {
  let best: { t: QlooTag; sim: number } | undefined;
  for (const t of tags) {
    const sim = nameSimilarity(text, t.name);
    if (!best || sim > best.sim) best = { t, sim };
  }
  return best;
}

/** Is this anchor best resolved against the tag endpoint (foods, vibes) rather than entities? */
function tagFirst(kind: AnchorKind): boolean {
  return kind === 'food' || kind === 'vibe';
}

export async function resolveAnchor(anchor: Anchor, deps: ResolveDeps): Promise<ResolvedAnchor> {
  const { qloo, trace } = deps;
  const text = anchor.text.trim();
  const kind = anchor.kind;
  const types = KIND_TO_URN[kind] ? [KIND_TO_URN[kind]!] : undefined;

  const tryEntity = async (q: string, withTypes: boolean): Promise<{ e: QlooEntity; sim: number } | undefined> => {
    const ents = await qloo.searchEntity(q, { types: withTypes ? types : undefined, take: 6 });
    return pickBest(q, ents);
  };
  const tryTag = async (q: string): Promise<{ t: QlooTag; sim: number } | undefined> => {
    const tags = await qloo.searchTags(q, { take: 5 });
    return pickBestTag(q, tags);
  };

  // 1) first-choice lookup
  if (tagFirst(kind)) {
    const hit = await tryTag(text);
    if (hit && hit.sim >= 0.6) {
      trace?.('observe', `"${text}" → Qloo tag ${hit.t.name}`, { tagId: hit.t.id });
      return { anchor, status: 'resolved', tag: hit.t, method: 'tag', confidence: hit.sim };
    }
  } else {
    const hit = await tryEntity(text, true);
    if (hit && hit.sim >= ACCEPT_THRESHOLD) {
      trace?.('observe', `"${text}" → ${hit.e.name} (${hit.e.type.replace('urn:entity:', '')})`, { entityId: hit.e.id, sim: round(hit.sim) });
      return { anchor, status: 'resolved', entity: hit.e, method: 'search', confidence: hit.sim };
    }
  }

  // 2) reflect: broaden — drop type filter, then rewrites, then tag fallback, then LLM
  trace?.('reflect', `"${text}" not confidently resolved — broadening the lookup`);

  if (!tagFirst(kind) && types) {
    const hit = await tryEntity(text, false);
    if (hit && hit.sim >= ACCEPT_THRESHOLD) {
      trace?.('retry', `"${text}" → ${hit.e.name} after dropping the type filter`, { entityId: hit.e.id });
      return { anchor, status: 'resolved', entity: hit.e, method: 'search-broadened', confidence: hit.sim * 0.95, note: 'type filter dropped' };
    }
  }

  const rewrites = deterministicRewrites(text);
  for (const rw of rewrites) {
    if (tagFirst(kind)) {
      const hit = await tryTag(rw);
      if (hit && hit.sim >= 0.7) {
        trace?.('retry', `"${text}" → tag ${hit.t.name} via rewrite "${rw}"`);
        return { anchor, status: 'resolved', tag: hit.t, method: 'search-rewritten', confidence: hit.sim * 0.9, note: `rewrote to "${rw}"` };
      }
    } else {
      const hit = await tryEntity(rw, false);
      if (hit && hit.sim >= ACCEPT_THRESHOLD) {
        trace?.('retry', `"${text}" → ${hit.e.name} via rewrite "${rw}"`, { entityId: hit.e.id });
        return { anchor, status: 'resolved', entity: hit.e, method: 'search-rewritten', confidence: hit.sim * 0.9, note: `rewrote to "${rw}"` };
      }
    }
  }

  if (deps.rewrite) {
    try {
      const alts = (await deps.rewrite(text, kind)).slice(0, 3);
      for (const alt of alts) {
        const hit = tagFirst(kind) ? undefined : await tryEntity(alt, false);
        if (hit && hit.sim >= ACCEPT_THRESHOLD) {
          trace?.('retry', `"${text}" → ${hit.e.name} via LLM rewrite "${alt}"`);
          return { anchor, status: 'resolved', entity: hit.e, method: 'search-rewritten', confidence: hit.sim * 0.85, note: `LLM rewrote to "${alt}"` };
        }
      }
    } catch {
      /* LLM is optional */
    }
  }

  // auto / unknown kinds may be foods or vibes: try the tag endpoint
  if (!tagFirst(kind)) {
    const hit = await tryTag(text);
    if (hit && hit.sim >= 0.75) {
      trace?.('retry', `"${text}" → Qloo tag ${hit.t.name}`);
      return { anchor, status: 'resolved', tag: hit.t, method: 'tag', confidence: hit.sim * 0.9, note: 'resolved as a tag, not an entity' };
    }
  }

  // last resort for vibes/foods: local keyword interpretation (usable for conflict axes, no Qloo id)
  if (AXES.some((a) => axisSignal(a, text) !== 0)) {
    trace?.('retry', `"${text}" has no Qloo match — interpreting locally as a vibe keyword`);
    return { anchor, status: 'resolved', method: 'vibe-keyword', confidence: 0.5, note: 'Interpreted locally (no Qloo entity/tag)' };
  }

  trace?.('observe', `"${text}" could not be resolved to a Qloo entity`);
  return { anchor, status: 'unresolved', confidence: 0, note: 'No matching Qloo entity or tag found' };
}

const round = (n: number) => Math.round(n * 100) / 100;
