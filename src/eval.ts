// Evaluation harness: generates seeded random groups, plans each one, and measures whether the product's guarantees
// actually hold — and how the fairness-aware planner compares to a naive "highest average affinity" ranker.
//   npm run eval            (SAMPLE DATA, fully offline, deterministic)
//   npm run eval -- --live  (real Qloo; slower, uses your quota)

import { runGroupAgent } from './agent/agent.js';
import { contextOf, assemble } from './core/plan.js';
import { parseRequest } from './core/request.js';
import { evaluate } from './core/scoring.js';
import { SAMPLE_CITIES, SAMPLE_ENTITIES } from './qloo/fixtures.js';
import { SampleQlooProvider } from './qloo/sample.js';
import type { AnchorKind, GroupRequest, PlanResult } from './types.js';

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

export interface GroupReport {
  seed: number;
  size: number;
  stops: number;
  allWins: boolean;
  unrelaxedViolations: number;
  relaxedStops: number;
  audit: PlanResult['audit'];
  meanScore: number;
  minPersonAvg: number;
  conflictsHigh: number;
}

export async function evalGroup(seed: number, live = false): Promise<GroupReport> {
  const req = parseRequest(randomGroup(seed));
  const r = await runGroupAgent(req, live ? { llm: null } : { qloo: new SampleQlooProvider(), llm: null });
  // re-check every chosen venue against the hard rules, independently of the selection code
  const ctx = contextOf(r.session);
  const all = Object.values(r.session.pools).flat();
  let violations = 0, relaxed = 0;
  for (const s of r.itinerary) {
    const cand = all.find((c) => c.entity.id === s.place.id);
    const ev = cand && evaluate(cand, ctx);
    const wasRelaxed = s.warnings.some((w) => w.startsWith('Relaxed'));
    if (wasRelaxed) relaxed++;
    else if (ev && (ev.vetoes.length || ev.hardRejected)) violations++;
  }
  return {
    seed, size: req.people.length, stops: r.itinerary.length, allWins: r.metrics.peopleWithoutWin.length === 0,
    unrelaxedViolations: violations, relaxedStops: relaxed, audit: r.audit, meanScore: r.metrics.meanScore,
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
  console.log(`Everyone got a personal win ................. ${p(s.everyoneGotAWin)} of groups`);
  console.log(`Hard-rule violations in the plan ............ ${s.hardRuleViolations}   (${s.stopsWithRelaxedRules} stops had every option blocked and were visibly relaxed)`);
  console.log(`Fairness changed the pick vs naive ranker ... ${p(s.stopsWhereFairnessChangedThePick)} of stops`);
  console.log(`Naive ranker broke a hard rule .............. ${s.naiveRankerBrokeAHardRule} stops (${p(s.naiveRankerStopsBrokenPct)})`);
  console.log(`Lowest person's fit (stops where naive was legal)  ${p(s.avgLowestPersonFitOurs)} (naive: ${p(s.avgLowestPersonFitNaive)})`);
  console.log(`(person, stop) pairs below 40% fit .......... ${s.poorFitsOurs} (naive: ${s.poorFitsNaive})`);
  console.log(`Mean fairness score ......................... ${p(s.avgFairnessScore)}`);
  console.log(`Groups with a HIGH taste conflict ........... ${p(s.groupsWithHighConflict)}`);
  if (process.argv.includes('--json')) console.log(JSON.stringify(s, null, 2));
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exitCode = 1; });
void assemble;
