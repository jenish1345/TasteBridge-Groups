// Evaluation harness: generates seeded random groups, plans each one, and measures whether the product's guarantees
// actually hold — and how the fairness-aware planner compares to a naive "highest average affinity" ranker.
//   npm run eval            (SAMPLE DATA, fully offline, deterministic)
//   npm run eval -- --live  (real Qloo; slower, uses your quota)

import { runGroupAgent } from './agent/agent.js';
import { parseRequest } from './core/request.js';
import { AXES, axisSignal, positionFromTexts, tagText } from './core/taxonomy.js';
import { SAMPLE_CITIES, SAMPLE_ENTITIES } from './qloo/fixtures.js';
import { SampleQlooProvider } from './qloo/sample.js';
import type { AnchorKind, GroupRequest, PlanResult, QlooEntity } from './types.js';

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KIND: Record<string, AnchorKind> = { 'urn:entity:artist': 'artist', 'urn:entity:movie': 'movie', 'urn:entity:tv_show': 'tv_show', 'urn:entity:book': 'book', 'urn:entity:videogame': 'videogame', 'urn:entity:brand': 'brand' };
const FOODS = ['Korean BBQ', 'Hot Pot', 'Pizza', 'Tacos', 'Ramen', 'Sushi', 'Dessert', 'Thai'];
const VIBES = ['quiet', 'loud live shows', 'nightlife', 'budget', 'cozy', 'family friendly', 'experimental'];
const AVOIDS = ['karaoke', 'dive bar', 'spicy', 'loud'];
const NAMES = ['Ana', 'Ben', 'Cy', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal'];

export function randomGroup(seed: number, size?: number): GroupRequest {
  const r = rng(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const n = size ?? 2 + Math.floor(r() * 7);
  const keyIdx = r() < 0.5 ? Math.floor(r() * n) : -1;
  const people = Array.from({ length: n }, (_, i) => {
    const anchors = Array.from({ length: 3 + Math.floor(r() * 4) }, () => {
      const x = r();
      if (x < 0.7) { const e = pick(SAMPLE_ENTITIES); return { text: e.name, kind: KIND[e.type] ?? ('auto' as AnchorKind) }; }
      if (x < 0.85) return { text: pick(FOODS), kind: 'food' as AnchorKind };
      return { text: pick(VIBES), kind: 'vibe' as AnchorKind };
    });
    return { id: `p${i}`, name: NAMES[i], anchors, isKey: i === keyIdx, avoid: r() < 0.25 ? [pick(AVOIDS)] : undefined };
  });
  return { people, constraints: { city: pick(SAMPLE_CITIES), budget: 2 + Math.floor(r() * 3), datetime: '2026-11-14T19:00' }, includeWindDown: true };
}

/**
 * Independent rule check: deliberately NOT built on the planner's evaluate()/matchesAvoid(). It re-derives each rule
 * from raw data with its own simpler logic, so a bug in the planner's veto code can't hide itself.
 * Returns a description of every rule this venue breaks for this group (empty = clean).
 */
export function independentBreaches(e: QlooEntity, req: GroupRequest, prefs: Record<string, Record<string, number>>): string[] {
  const out: string[] = [];
  // same evidence the planner sees (name, tags, description), but separate checking logic
  const blob = [e.name, ...e.tags.map((t) => t.name), e.description ?? ''].join(' ').toLowerCase();
  if (req.constraints.budget && e.priceLevel && e.priceLevel > req.constraints.budget) out.push(`over budget (${e.priceLevel} > ${req.constraints.budget})`);
  const pos = positionFromTexts([e.name, ...e.tags.map(tagText)], e.priceLevel).pos;
  for (const p of req.people) {
    for (const av of p.avoid ?? []) {
      const a = av.toLowerCase().trim();
      if (blob.includes(a)) out.push(`${p.name}: literal hard no "${a}"`);
      else if (a === 'loud' && axisSignal('volume', blob) >= 0.5) out.push(`${p.name}: hard no "loud"`);
      else if (a === 'spicy' && axisSignal('spice', blob) >= 0.5) out.push(`${p.name}: hard no "spicy"`);
    }
    if (p.isKey) for (const ax of AXES) if ((prefs[p.id]?.[ax] ?? 0) * pos[ax] <= -0.36) out.push(`${p.name} (key guest) strongly dislikes ${ax}`);
  }
  return out;
}

export interface GroupReport {
  seed: number;
  size: number;
  stops: number;
  allWins: boolean;
  /** everyone has at least a closest-fit stop (the guarantee) */
  allCovered: boolean;
  unrelaxedViolations: number;
  relaxedStops: number;
  audit: PlanResult['audit'];
  meanScore: number;
  minPersonAvg: number;
  conflictsHigh: number;
  /** average number of people who share each stop's "personal win" (1 = exclusive, 5 = everyone) */
  winnersPerStop: number;
}

export async function evalGroup(seed: number, live = false): Promise<GroupReport> {
  const req = parseRequest(randomGroup(seed));
  const r = await runGroupAgent(req, live ? { llm: null } : { qloo: new SampleQlooProvider(), llm: null });
  // re-check every chosen venue against the hard rules with the independent checker above
  const all = Object.values(r.session.pools).flat();
  const prefs = Object.fromEntries(r.profile.people.map((p) => [p.person.id, p.pref as unknown as Record<string, number>]));
  let violations = 0, relaxed = 0;
  for (const s of r.itinerary) {
    const cand = all.find((c) => c.entity.id === s.place.id);
    if (s.warnings.some((w) => w.startsWith('Relaxed'))) { relaxed++; continue; }
    if (cand && independentBreaches(cand.entity, req, prefs).length) violations++;
  }
  return {
    seed, size: req.people.length, stops: r.itinerary.length, allWins: r.metrics.peopleWithoutExclusive.length === 0, allCovered: r.metrics.peopleWithoutWin.length === 0,
    unrelaxedViolations: violations, relaxedStops: relaxed, audit: r.audit, meanScore: r.metrics.meanScore,
    winnersPerStop: r.itinerary.reduce((a, st) => a + st.serves.filter((x) => x.reason.startsWith('Personal win')).length, 0) / Math.max(1, r.itinerary.length),
    minPersonAvg: r.metrics.minPersonAvg, conflictsHigh: r.profile.conflicts.filter((c) => c.level === 'high').length,
  };
}

export function summarize(rs: GroupReport[]) {
  const sum = (f: (x: GroupReport) => number) => rs.reduce((a, x) => a + f(x), 0);
  const stops = sum((x) => x.stops);
  return {
    groups: rs.length,
    stops,
    everyoneGotAWin: sum((x) => +x.allWins) / rs.length,
    everyoneCovered: sum((x) => +x.allCovered) / rs.length,
    hardRuleViolations: sum((x) => x.unrelaxedViolations),
    stopsWithRelaxedRules: sum((x) => x.relaxedStops),
    stopsWhereFairnessChangedThePick: sum((x) => x.audit.stopsChanged) / stops,
    naiveRankerBrokeAHardRule: sum((x) => x.audit.naiveViolations),
    naiveRankerStopsBrokenPct: sum((x) => x.audit.naiveViolations) / stops,
    avgLowestPersonFitOurs: sum((x) => x.audit.avgMinAffinityOurs * x.audit.comparableStops) / sum((x) => x.audit.comparableStops),
    avgLowestPersonFitNaive: sum((x) => x.audit.avgMinAffinityNaive * x.audit.comparableStops) / sum((x) => x.audit.comparableStops),
    poorFitsOurs: sum((x) => x.audit.poorFitsOurs),
    poorFitsNaive: sum((x) => x.audit.poorFitsNaive),
    avgFairnessScore: sum((x) => x.meanScore) / rs.length,
    winnersPerStop: sum((x) => x.winnersPerStop) / rs.length,
    groupsWithHighConflict: sum((x) => +(x.conflictsHigh > 0)) / rs.length,
  };
}

async function main() {
  const live = process.argv.includes('--live');
  const n = Number(process.argv.find((a) => /^--n=/.test(a))?.slice(4)) || (live ? 4 : 60);
  const reports: GroupReport[] = [];
  for (let i = 1; i <= n; i++) {
    reports.push(await evalGroup(i, live));
    if (live) console.error(`group ${i}/${n} done`);
  }
  const s = summarize(reports);
  const p = (x: number) => `${(x * 100).toFixed(1)}%`;
  console.log(`\nTasteBridge evaluation — ${live ? 'LIVE Qloo' : 'SAMPLE DATA'} · ${s.groups} random groups (2–8 people) · ${s.stops} stops\n`);
  console.log(`Everyone has an exclusive personal win ...... ${p(s.everyoneGotAWin)} of groups`);
  console.log(`Everyone has a win or a closest fit ......... ${p(s.everyoneCovered)} of groups`);
  console.log(`Hard-rule violations in the plan ............ ${s.hardRuleViolations}   (${s.stopsWithRelaxedRules} stops had every option blocked and were visibly relaxed)`);
  console.log(`Fairness changed the pick vs naive ranker ... ${p(s.stopsWhereFairnessChangedThePick)} of stops`);
  console.log(`Naive ranker broke a hard rule .............. ${s.naiveRankerBrokeAHardRule} stops (${p(s.naiveRankerStopsBrokenPct)})`);
  console.log(`Lowest person's fit (stops where naive was legal)  ${p(s.avgLowestPersonFitOurs)} (naive: ${p(s.avgLowestPersonFitNaive)})`);
  console.log(`(person, stop) pairs below 40% fit .......... ${s.poorFitsOurs} (naive: ${s.poorFitsNaive})`);
  console.log(`People sharing each "personal win" ..... ${s.winnersPerStop.toFixed(2)} per stop (1 = exclusive)`);
  console.log(`Mean fairness score ......................... ${p(s.avgFairnessScore)}`);
  console.log(`Groups with a HIGH taste conflict ........... ${p(s.groupsWithHighConflict)}`);
  if (process.argv.includes('--json')) console.log(JSON.stringify(s, null, 2));
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exitCode = 1; });
