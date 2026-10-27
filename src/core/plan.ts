// Pure plan assembly + rebalance over a SessionState (no network). Used by the agent, the API and tests.

import type { ItineraryStop, PlanAudit, PlanMetrics, RebalanceDiff, ScoredCandidate, SessionState, SlotId } from '../types.js';
import { detectConflicts } from './conflicts.js';
import { buildPlan, planAudit, planMetrics, synthesize, winsOf, type Pick, type PlanBuild, type StopKey } from './itinerary.js';
import type { ScoringContext } from './scoring.js';
import { SLOT_ORDER } from './slots.js';

export function contextOf(s: SessionState): ScoringContext {
  return { profiles: s.profiles, constraints: s.request.constraints, conflicts: detectConflicts(s.profiles) };
}

export interface Assembled {
  build: PlanBuild;
  picks: Pick[];
  itinerary: ItineraryStop[];
  metrics: PlanMetrics;
  audit: PlanAudit;
  warnings: string[];
}

function slotsOfRequest(s: SessionState): SlotId[] {
  const base = s.request.slots?.length ? s.request.slots : SLOT_ORDER;
  return base.filter((x) => x !== 'winddown' || s.request.includeWindDown !== false);
}

export function exclusions(s: SessionState): Partial<Record<StopKey, string[]>> {
  return s.rejected ?? {};
}

/** Assemble from scratch (no stored selection) or honour `session.selection`. */
export function assemble(s: SessionState, useSelection = false): Assembled {
  const ctx = contextOf(s);
  const build = buildPlan(s.pools, ctx, { slots: slotsOfRequest(s), exclude: exclusions(s) });
  let picks = build.picks;
  if (useSelection && Object.keys(s.selection).length) {
    const all = Object.values(build.scored).flat();
    const restored: Pick[] = [];
    for (const [key, id] of Object.entries(s.selection)) {
      const c = all.find((x) => x.entity.id === id);
      if (c) restored.push({ key: key as StopKey, c });
    }
    if (restored.length) picks = restored;
  }
  const itinerary = synthesize({ ...build, picks }, ctx, s.request.constraints.datetime);
  return { build: { ...build, picks }, picks, itinerary, metrics: planMetrics(picks, s.profiles), audit: planAudit({ ...build, picks }, picks, s.profiles), warnings: build.warnings };
}

export function selectionOf(picks: Pick[]): Record<string, string> {
  return Object.fromEntries(picks.map((p) => [p.key, p.c.entity.id]));
}

const objective = (m: PlanMetrics) => m.meanScore + 0.5 * m.minPersonAvg;
const FAIRNESS_TOLERANCE = 0.03;

/**
 * "Rebalance plan": swap ONE stop (the chosen one, or the weakest) while keeping every existing personal win
 * and not letting overall fairness drop by more than FAIRNESS_TOLERANCE.
 */
export function rebalance(s: SessionState, target?: StopKey): { session: SessionState; assembled: Assembled; diff: RebalanceDiff } {
  const current = assemble(s, true);
  const ctx = contextOf(s);
  const before = current.metrics;

  const weakest = [...current.picks].sort((a, b) => a.c.breakdown.score - b.c.breakdown.score)[0];
  const tgt = current.picks.find((p) => p.key === target) ?? weakest;
  const poolKeys: SlotId[] = tgt.key === 'encore' ? ['drink', 'winddown', 'activity'] : [tgt.key];
  const usedIds = new Set(current.picks.map((p) => p.c.entity.id));

  const options: ScoredCandidate[] = poolKeys
    .flatMap((k) => current.build.feasible[k] ?? [])
    .filter((c) => !usedIds.has(c.entity.id) && !(s.rejected?.[tgt.key] ?? []).includes(c.entity.id));

  const oldNoWin = new Set(before.peopleWithoutWin);
  const evaluated = options.map((c) => {
    const picks = current.picks.map((p) => (p === tgt ? { key: p.key, c } : p));
    const m = planMetrics(picks, s.profiles);
    const preserved = m.peopleWithoutWin.every((id) => oldNoWin.has(id));
    return { c, picks, m, preserved, obj: objective(m) };
  });

  const ok = evaluated.filter((x) => x.preserved && x.obj >= objective(before) - FAIRNESS_TOLERANCE).sort((a, b) => b.obj - a.obj);
  const fallback = evaluated.filter((x) => x.preserved).sort((a, b) => b.obj - a.obj);
  const chosen = ok[0] ?? fallback[0];

  if (!chosen) {
    const note = options.length
      ? 'No alternative keeps everyone’s personal win — the plan was left unchanged.'
      : 'No other viable option was returned for this stop — the plan was left unchanged.';
    return {
      session: s,
      assembled: current,
      diff: {
        slot: tgt.key, removed: tgt.c.entity.name, added: tgt.c.entity.name,
        before: { meanScore: before.meanScore, minPersonAvg: before.minPersonAvg },
        after: { meanScore: before.meanScore, minPersonAvg: before.minPersonAvg },
        winsPreserved: true, note,
      },
    };
  }

  const next: SessionState = {
    ...s,
    selection: selectionOf(chosen.picks),
    rejected: { ...(s.rejected ?? {}), [tgt.key]: [...(s.rejected?.[tgt.key] ?? []), tgt.c.entity.id] },
  };
  const assembled = assemble(next, true);
  return {
    session: next,
    assembled,
    diff: {
      slot: tgt.key,
      removed: tgt.c.entity.name,
      added: chosen.c.entity.name,
      before: { meanScore: before.meanScore, minPersonAvg: before.minPersonAvg },
      after: { meanScore: chosen.m.meanScore, minPersonAvg: chosen.m.minPersonAvg },
      winsPreserved: true,
      note: ok[0]
        ? `Swapped ${tgt.c.entity.name} for ${chosen.c.entity.name}; every personal win is preserved and fairness stays within ${Math.round(FAIRNESS_TOLERANCE * 100)} points.`
        : `Swapped ${tgt.c.entity.name} for ${chosen.c.entity.name}; every personal win is preserved, but fairness dips slightly (no closer option existed).`,
    },
  };
}

export { winsOf };
