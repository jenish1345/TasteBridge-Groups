// Fairness-aware group scoring.
//
//   score = group_coverage * 0.5 + minimum_individual_affinity * 0.3 + conflict_penalty * 0.2
//
// where conflict_penalty is the *conflict-free* component (1 = nobody is pushed against a strong preference).
// See README "Scoring algorithm" for the full derivation.

import type {
  Axis,
  AxisVector,
  Candidate,
  Conflict,
  Constraints,
  PersonProfile,
  QlooEntity,
  ScoreBreakdown,
  ScoredCandidate,
  SlotId,
  Veto,
} from '../types.js';
import { isOpenAt } from './hours.js';
import { SLOT_META } from './slots.js';
import { AXES, AXIS_META, clamp, matchesAvoid, positionFromTexts, tagText, vibeToAxisNudge } from './taxonomy.js';

export const WEIGHTS = { coverage: 0.5, minAffinity: 0.3, conflict: 0.2 } as const;
export const COVER_LO = 0.35;
export const COVER_HI = 0.65;
export const ABSENT_Q = 0.2;
export const WIN_MIN = 0.65;
export const WIN_TOP = 2;
/** pref * pos at or below this for a key person is a strong dislike (e.g. -0.6 * 0.6) */
export const VETO_PRODUCT = -0.36;

export const softCover = (a: number): number => clamp((a - COVER_LO) / (COVER_HI - COVER_LO), 0, 1);

/** How close a candidate is to a person's lean, weighting the axes they care about. 0.5 = no opinion. */
export function axisFit(pref: AxisVector, pos: AxisVector): number {
  let num = 0;
  let den = 0;
  for (const a of AXES) {
    const w = Math.abs(pref[a]);
    num += w * Math.abs(pref[a] - pos[a]);
    den += w * 2;
  }
  return den ? 1 - num / den : 0.5;
}

/** Largest opposition between a person's lean and the candidate on any axis. */
export function conflictLoad(pref: AxisVector, pos: AxisVector): { load: number; axis?: Axis } {
  let load = 0;
  let axis: Axis | undefined;
  for (const a of AXES) {
    const opp = Math.max(0, -pref[a] * pos[a]);
    if (opp > load) {
      load = opp;
      axis = a;
    }
  }
  return { load, axis };
}

export function individualAffinity(qNorm: number | undefined, fit: number): number {
  return qNorm === undefined ? 0.1 + 0.8 * fit : 0.75 * qNorm + 0.25 * fit;
}

export function computeBreakdown(
  a: Record<string, number>,
  loads: Record<string, number>,
  weights: Record<string, number> = {},
): ScoreBreakdown {
  const ids = Object.keys(a);
  const w = (id: string) => weights[id] ?? 1;
  const wsum = ids.reduce((s, id) => s + w(id), 0) || 1;
  const coverage = ids.reduce((s, id) => s + w(id) * softCover(a[id]), 0) / wsum;
  let minAffinity = 1;
  let weakestPersonId = ids[0] ?? '';
  for (const id of ids) {
    if (a[id] < minAffinity) {
      minAffinity = a[id];
      weakestPersonId = id;
    }
  }
  const meanLoad = ids.reduce((s, id) => s + (loads[id] ?? 0), 0) / (ids.length || 1);
  const conflictPenalty = 1 - clamp(meanLoad, 0, 1);
  const score = WEIGHTS.coverage * coverage + WEIGHTS.minAffinity * minAffinity + WEIGHTS.conflict * conflictPenalty;
  return {
    coverage: r3(coverage),
    minAffinity: r3(minAffinity),
    conflictPenalty: r3(conflictPenalty),
    score: r3(score),
    weakestPersonId,
  };
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

// ----------------------------------------------------------------- candidates

/** Normalise one person's Qloo result list: 0.5*raw affinity + 0.5*rank percentile. */
export function normalizeList(list: QlooEntity[]): Map<string, { raw?: number; norm: number }> {
  const out = new Map<string, { raw?: number; norm: number }>();
  const n = list.length;
  list.forEach((e, i) => {
    const pct = n <= 1 ? 1 : (n - 1 - i) / (n - 1);
    out.set(e.id, { raw: e.affinity, norm: e.affinity === undefined ? pct : 0.5 * e.affinity + 0.5 * pct });
  });
  return out;
}

export function entityBlob(e: QlooEntity): string {
  return `${e.name} ${e.tags.map((t) => t.name).join(' ')} ${e.description ?? ''}`;
}

export function entityPosition(e: QlooEntity): AxisVector {
  return positionFromTexts([e.name, ...e.tags.map(tagText)], e.priceLevel).pos;
}

/**
 * Build candidates for one slot from the merged pool and each person's Qloo result list.
 * `lists[personId]` is the Qloo insights result for that person's signals (ordered by affinity).
 */
export function buildCandidates(
  slot: SlotId,
  pool: QlooEntity[],
  lists: Record<string, QlooEntity[]>,
  profiles: PersonProfile[],
): Candidate[] {
  const norms: Record<string, Map<string, { raw?: number; norm: number }>> = {};
  for (const p of profiles) norms[p.person.id] = normalizeList(lists[p.person.id] ?? []);

  return pool.map((entity) => {
    const pos = entityPosition(entity);
    const a: Record<string, number> = {};
    const qloo: Record<string, number | undefined> = {};
    const explain: Record<string, string[]> = {};
    for (const p of profiles) {
      const mine = lists[p.person.id]?.find((e) => e.id === entity.id);
      if (Array.isArray(mine?.explain)) {
        const ids = (mine!.explain as { entity_id?: string; score?: number }[]).filter((x) => x?.entity_id && (x.score ?? 0) > 0).sort((x, y) => (y.score ?? 0) - (x.score ?? 0)).map((x) => x.entity_id!);
        if (ids.length) explain[p.person.id] = ids;
      }
      const hasSignal = p.signalEntityIds.length + p.signalTagIds.length > 0 && (lists[p.person.id]?.length ?? 0) > 0;
      const fit = axisFit(p.pref, pos);
      const hit = norms[p.person.id].get(entity.id);
      qloo[p.person.id] = hit?.raw;
      if (!hasSignal) a[p.person.id] = individualAffinity(undefined, fit);
      else a[p.person.id] = r3(individualAffinity(hit ? hit.norm : ABSENT_Q, fit));
    }
    return { entity, slot, a, qloo, pos, ...(Object.keys(explain).length ? { explain } : {}) };
  });
}

// ----------------------------------------------------------------- constraints, vetoes

const DIETARY: [RegExp, RegExp][] = [
  [/vegan/, /vegan/],
  [/vegetarian|veggie/, /vegetarian|vegan/],
  [/halal/, /halal/],
  [/gluten|celiac|coeliac/, /gluten/],
  [/kosher/, /kosher/],
];
const ACCESS: [RegExp, RegExp][] = [[/wheelchair|step.?free|mobility|accessible|accessib/, /wheelchair|accessible|step.?free/]];

function verify(needs: string[] | undefined, table: [RegExp, RegExp][], blob: string): { ok: string[]; unknown: string[] } {
  const ok: string[] = [];
  const unknown: string[] = [];
  for (const need of needs ?? []) {
    const n = need.toLowerCase();
    const row = table.find(([k]) => k.test(n));
    if (row && row[1].test(blob.toLowerCase())) ok.push(need);
    else unknown.push(need);
  }
  return { ok, unknown };
}

export interface ScoringContext {
  profiles: PersonProfile[];
  constraints: Constraints;
  /** Group conflicts (from detectConflicts) – used for diplomacy tie-breaks and explanations */
  conflicts?: Conflict[];
  /** Relax key-person axis vetoes (used when a slot has no viable alternative). */
  relaxAxisVetoes?: boolean;
}

export function evaluate(c: Candidate, ctx: ScoringContext): Pick<ScoredCandidate, 'vetoes' | 'hardRejected' | 'verified' | 'unverified'> {
  const blob = entityBlob(c.entity);
  const vetoes: Veto[] = [];
  for (const p of ctx.profiles) {
    for (const av of p.person.avoid ?? []) {
      if (matchesAvoid(av, blob)) vetoes.push({ personId: p.person.id, kind: 'avoid', reason: `${p.person.name} said "${av}" is a hard no` });
    }
    if (p.person.isKey && !ctx.relaxAxisVetoes) {
      for (const a of AXES) {
        if (p.pref[a] * c.pos[a] <= VETO_PRODUCT) {
          const side = c.pos[a] > 0 ? AXIS_META[a].pos : AXIS_META[a].neg;
          vetoes.push({ personId: p.person.id, kind: 'axis', reason: `${p.person.name} (key guest) strongly dislikes ${side} (${AXIS_META[a].label})` });
        }
      }
    }
  }

  let hardRejected: string | undefined;
  const budget = ctx.constraints.budget;
  if (budget && c.entity.priceLevel && c.entity.priceLevel > budget) hardRejected = `over budget (${'$'.repeat(c.entity.priceLevel)} > ${'$'.repeat(budget)})`;
  if (!hardRejected && ctx.constraints.datetime && c.entity.hours) {
    // never send people to a closed door: check the venue's hours at this stop's planned start time
    const o = isOpenAt(c.entity.hours, ctx.constraints.datetime, SLOT_META[c.slot].startOffsetMin);
    if (o.open === false) hardRejected = `closed at ${o.at} per Qloo's listed hours`;
  }
  for (const v of ctx.constraints.vibes ?? []) {
    const nudge = vibeToAxisNudge(v);
    for (const a of AXES) {
      const n = nudge[a];
      if (n !== undefined && n * c.pos[a] <= VETO_PRODUCT) hardRejected ??= `conflicts with group vibe "${v}"`;
    }
  }

  const diet = c.slot === 'food' ? verify(ctx.constraints.dietary, DIETARY, blob) : { ok: [], unknown: [] };
  const acc = verify(ctx.constraints.accessibility, ACCESS, blob);
  return { vetoes, hardRejected, verified: [...diet.ok, ...acc.ok], unverified: [...diet.unknown, ...acc.unknown] };
}

/** Score every candidate in a slot, apply vetoes, and mark personal wins (top-3 + a_i >= 0.6 among viable). */
export function scoreSlot(cands: Candidate[], ctx: ScoringContext): ScoredCandidate[] {
  const loadsFor = (c: Candidate) => Object.fromEntries(ctx.profiles.map((p) => [p.person.id, conflictLoad(p.pref, c.pos).load]));
  const scored: ScoredCandidate[] = cands.map((c) => ({
    ...c,
    ...evaluate(c, ctx),
    breakdown: computeBreakdown(c.a, loadsFor(c)),
    winFor: [],
  }));
  markWins(scored);
  return scored.sort((x, y) => y.breakdown.score - x.breakdown.score);
}

export function isViable(c: ScoredCandidate): boolean {
  return c.vetoes.length === 0 && !c.hardRejected;
}

export function markWins(scored: ScoredCandidate[]): void {
  const viable = scored.filter(isViable);
  const ids = viable[0] ? Object.keys(viable[0].a) : [];
  for (const s of scored) s.winFor = [];
  for (const id of ids) {
    const ranked = [...viable].sort((x, y) => y.a[id] - x.a[id]).slice(0, WIN_TOP);
    for (const c of ranked) if (c.a[id] >= WIN_MIN) c.winFor.push(id);
  }
}
