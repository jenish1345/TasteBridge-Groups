// Original TasteBridge flow: find common ground between exactly two people, across cultural domains.
// Implemented on the same engine as group planning (profiles → Qloo insights → fairness score).

import { loadConfig } from '../config.js';
import { QlooAuthError } from '../qloo/live.js';
import { getProvider } from '../qloo/provider.js';
import { resolveAnchor } from '../qloo/resolve.js';
import { SampleQlooProvider } from '../qloo/sample.js';
import type { Anchor, GroupProfile, PersonProfile, ProviderStats, QlooEntity, QlooProvider, ResolvedAnchor, TraceEvent } from '../types.js';
import { buildGroupProfile, buildPersonProfile } from './profile.js';
import { UserError } from './request.js';
import { buildCandidates, scoreSlot } from './scoring.js';

export interface PairInput {
  a: { name: string; anchors: (string | Anchor)[] };
  b: { name: string; anchors: (string | Anchor)[] };
  city?: string;
  domains?: string[];
}

export interface PairPick {
  id: string;
  name: string;
  score: number;
  affinity: Record<string, number>;
  tags: string[];
  why: string;
  source: QlooEntity['source'];
}

export interface PairResult {
  ok: true;
  dataMode: 'live' | 'sample';
  banner?: string;
  people: { id: string; name: string }[];
  profile: GroupProfile;
  domains: { domain: string; label: string; picks: PairPick[] }[];
  unresolved: { personId: string; anchor: string }[];
  trace: TraceEvent[];
  stats: ProviderStats;
}

const DOMAINS: Record<string, { type: string; label: string }> = {
  movie: { type: 'urn:entity:movie', label: 'Films to watch together' },
  tv_show: { type: 'urn:entity:tv_show', label: 'Shows to binge' },
  artist: { type: 'urn:entity:artist', label: 'Music you can both play' },
  book: { type: 'urn:entity:book', label: 'Books' },
  videogame: { type: 'urn:entity:videogame', label: 'Games' },
  brand: { type: 'urn:entity:brand', label: 'Brands you both like' },
  place: { type: 'urn:entity:place', label: 'Places to go' },
};

export async function findCommonGround(input: PairInput, opts: { qloo?: QlooProvider } = {}): Promise<PairResult> {
  const cfg = loadConfig();
  let qloo = opts.qloo ?? getProvider(cfg);
  try {
    return await runPair(input, qloo);
  } catch (e) {
    if (e instanceof QlooAuthError) {
      qloo = new SampleQlooProvider();
      const r = await runPair(input, qloo);
      return { ...r, banner: `Qloo rejected the API key. Showing SAMPLE DATA instead.` };
    }
    throw e;
  }
}

async function runPair(input: PairInput, qloo: QlooProvider): Promise<PairResult> {
  const t0 = Date.now();
  const trace: TraceEvent[] = [];
  const log = (phase: TraceEvent['phase'], message: string) => trace.push({ t: Date.now() - t0, phase, message });
  const before = qloo.stats();
  const toAnchors = (xs: (string | Anchor)[]): Anchor[] => xs.map((x) => (typeof x === 'string' ? { text: x, kind: 'auto' as const } : x));
  const people = [
    { id: 'a', name: input.a.name || 'Person A', anchors: toAnchors(input.a.anchors) },
    { id: 'b', name: input.b.name || 'Person B', anchors: toAnchors(input.b.anchors) },
  ];
  if (people.some((p) => !p.anchors.length)) throw new UserError('Each person needs at least one taste anchor.');

  log('plan', `Resolve ${people[0].anchors.length + people[1].anchors.length} anchors, then ask Qloo for what ${people[0].name} and ${people[1].name} would both like in ${Object.keys(DOMAINS).length} domains.`);
  const resolved: Record<string, ResolvedAnchor[]> = {};
  await Promise.all(
    people.map(async (p) => {
      resolved[p.id] = await Promise.all(p.anchors.map((a) => resolveAnchor(a, { qloo, trace: (ph, m) => log(ph, `${p.name}: ${m}`) })));
    }),
  );
  const profiles: PersonProfile[] = people.map((p) => buildPersonProfile({ id: p.id, name: p.name, anchors: p.anchors }, resolved[p.id]));
  const group = buildGroupProfile(profiles);
  const unresolved = people.flatMap((p) => resolved[p.id].filter((r) => r.status === 'unresolved').map((r) => ({ personId: p.id, anchor: r.anchor.text })));

  const wanted = (input.domains?.length ? input.domains : Object.keys(DOMAINS)).filter((d) => d in DOMAINS && (d !== 'place' || input.city));
  const anchorIds = new Set(profiles.flatMap((p) => [...p.signalEntityIds]));
  const domains = await Promise.all(
    wanted.map(async (d) => {
      const { type, label } = DOMAINS[d];
      const common = { type, take: 25, locationQuery: d === 'place' ? input.city : undefined };
      const both = await qloo.insights({ ...common, signalEntities: profiles.flatMap((p) => p.signalEntityIds).slice(0, 20), signalTags: profiles.flatMap((p) => p.signalTagIds).slice(0, 6) });
      const lists: Record<string, QlooEntity[]> = {};
      await Promise.all(
        profiles.map(async (p) => {
          lists[p.person.id] = p.signalEntityIds.length || p.signalTagIds.length ? (await qloo.insights({ ...common, signalEntities: p.signalEntityIds, signalTags: p.signalTagIds })).entities : [];
        }),
      );
      const merged = new Map<string, QlooEntity>();
      [...both.entities, ...Object.values(lists).flat()].forEach((e) => !anchorIds.has(e.id) && !merged.has(e.id) && merged.set(e.id, e));
      const cands = buildCandidates('activity', [...merged.values()], lists, profiles);
      const scored = scoreSlot(cands, { profiles, constraints: { city: input.city ?? '' }, conflicts: group.conflicts });
      const picks: PairPick[] = scored.slice(0, 5).map((s) => {
        const [x, y] = profiles;
        const why = `${x.person.name} ${pct(s.a[x.person.id])} / ${y.person.name} ${pct(s.a[y.person.id])} — fairness ${pct(s.breakdown.score)}` + (s.entity.tags.length ? `; tags: ${s.entity.tags.slice(0, 3).map((t) => t.name).join(', ')}` : '');
        return { id: s.entity.id, name: s.entity.name, score: s.breakdown.score, affinity: s.a, tags: s.entity.tags.slice(0, 6).map((t) => t.name), why, source: s.entity.source };
      });
      log('observe', `${label}: ${picks.map((p) => p.name).join(', ') || 'no results'}`);
      return { domain: d, label, picks };
    }),
  );

  const stats = qloo.stats();
  return {
    ok: true,
    dataMode: qloo.mode,
    banner: qloo.mode === 'sample' ? 'SAMPLE DATA mode — QLOO_API_KEY is not set. Results are illustrative fixtures.' : undefined,
    people: people.map((p) => ({ id: p.id, name: p.name })),
    profile: group,
    domains,
    unresolved,
    trace,
    stats: { ...stats, calls: stats.calls - before.calls, cacheHits: stats.cacheHits - before.cacheHits, retries: stats.retries - before.retries, rateLimited: stats.rateLimited - before.rateLimited, failures: stats.failures - before.failures, staleServed: stats.staleServed - before.staleServed, fallbacks: stats.fallbacks - before.fallbacks },
  };
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
