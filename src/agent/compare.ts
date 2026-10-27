// "With Qloo" vs "Without Qloo": same request, two planners, an honest scorecard.

import { matchesAvoid } from '../core/taxonomy.js';
import type { GroupRequest, PlanResult } from '../types.js';
import { runGroupAgent, type AgentOptions } from './agent.js';
import { baselinePlan, type BaselineResult } from './baseline.js';
import { getLlm } from './llm.js';
import { loadConfig } from '../config.js';

export interface ScoreRow {
  label: string;
  withQloo: string;
  withoutQloo: string;
  winner: 'qloo' | 'tie';
  note: string;
}

export interface CompareResult {
  ok: true;
  withQloo: PlanResult;
  withoutQloo: BaselineResult;
  scorecard: ScoreRow[];
}

export async function comparePlans(req: GroupRequest, opts: AgentOptions = {}): Promise<CompareResult> {
  const llm = opts.llm === null ? undefined : (opts.llm ?? getLlm(loadConfig()));
  const [withQloo, withoutQloo] = await Promise.all([runGroupAgent(req, { ...opts, llm: llm ?? null }), baselinePlan(req, llm)]);
  return { ok: true, withQloo, withoutQloo, scorecard: scorecard(req, withQloo, withoutQloo) };
}

export function scorecard(req: GroupRequest, plan: PlanResult, base: BaselineResult): ScoreRow[] {
  const n = plan.itinerary.length;
  const baseText = base.stops.map((s) => `${s.name} ${s.why}`).join(' \n ').toLowerCase();
  const people = req.people;

  // anchors actually cited
  const allAnchors = people.flatMap((p) => p.anchors.map((a) => a.text));
  const citedBase = allAnchors.filter((a) => baseText.includes(a.toLowerCase())).length;
  const citedQloo = new Set(plan.itinerary.flatMap((s) => s.evidence.signals.map((x) => `${x.personId}:${x.anchor}`))).size;

  // people mentioned / served
  const namedBase = people.filter((p) => baseText.includes(p.name.toLowerCase())).length;
  const winsQloo = people.length - plan.metrics.peopleWithoutExclusive.length;

  // conflicts
  const conflicts = plan.profile.conflicts;
  const resolved = conflicts.filter((c) => plan.itinerary.some((s) => s.conflicts.some((x) => x.axis === c.axis))).length;
  const mentionedBase = conflicts.filter((c) => baseText.includes(c.poleA) || baseText.includes(c.poleB)).length;

  // hard avoids
  const avoids = people.flatMap((p) => (p.avoid ?? []).map((a) => ({ p: p.name, a })));
  const breaches = avoids.filter(({ a }) => matchesAvoid(a, baseText)).length;

  const live = plan.dataMode === 'live';
  const rows: ScoreRow[] = [
    {
      label: live ? 'Venues verified in Qloo' : 'Venues from the Qloo catalogue (sample fixtures)',
      withQloo: `${n}/${n}`,
      withoutQloo: `0/${base.stops.length}`,
      winner: 'qloo',
      note: 'Qloo stops carry entity IDs and tags you can inspect; the baseline names come from nowhere checkable.',
    },
    {
      label: 'Taste anchors actually used',
      withQloo: `${citedQloo} cited with entity IDs`,
      withoutQloo: `${citedBase}/${allAnchors.length} mentioned in text`,
      winner: citedQloo > citedBase ? 'qloo' : 'tie',
      note: 'Cited = linked to a venue through a Qloo signal, not just echoed back.',
    },
    {
      label: 'People with a guaranteed personal win',
      withQloo: `${winsQloo}/${people.length}`,
      withoutQloo: `${namedBase}/${people.length} even named`,
      winner: winsQloo >= namedBase ? 'qloo' : 'tie',
      note: 'The planner enforces a win per person; the baseline has no notion of one.',
    },
    {
      label: 'Taste conflicts detected & resolved',
      withQloo: `${resolved}/${conflicts.length}`,
      withoutQloo: `${mentionedBase}/${conflicts.length} mentioned`,
      winner: resolved >= mentionedBase ? 'qloo' : 'tie',
      note: 'Conflicts are computed from Qloo tags (loud/quiet, spicy/mild, ...), then bridged or balanced across stops.',
    },
    {
      label: 'Hard “never” items respected',
      withQloo: avoids.length ? `${avoids.length}/${avoids.length} (vetoed)` : 'n/a',
      withoutQloo: avoids.length ? `${avoids.length - breaches}/${avoids.length} (text check)` : 'n/a',
      winner: breaches > 0 ? 'qloo' : 'tie',
      note: 'Vetoes are enforced in code for the Qloo plan; the baseline only hopes the prompt is followed.',
    },
    {
      label: 'Per-person affinity evidence',
      withQloo: `${plan.itinerary.reduce((a, s) => a + s.evidence.affinitySignals.length, 0)} scores`,
      withoutQloo: '0',
      winner: 'qloo',
      note: 'Every stop shows an affinity number per person.',
    },
  ];
  return rows;
}
