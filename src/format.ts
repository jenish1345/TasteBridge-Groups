// Plain-text / markdown rendering of plan results for the CLI and the MCP server.

import type { PairResult } from './core/pair.js';
import type { PlanResult } from './types.js';

const pct = (n: number) => `${Math.round(n * 100)}%`;
const SLOT: Record<string, string> = { activity: 'Activity', food: 'Food', drink: 'Drink / dessert', winddown: 'Wind-down', encore: 'Encore' };

export function formatPlan(r: PlanResult, opts: { evidence?: boolean; trace?: boolean } = {}): string {
  const who = Object.fromEntries(r.profile.people.map((p) => [p.person.id, p.person.name]));
  const out: string[] = [];
  if (r.banner) out.push(`!! ${r.banner}`, '');
  out.push(
    `Fairness ${pct(r.metrics.meanScore)} · lowest person avg ${pct(r.metrics.minPersonAvg)} (${who[r.metrics.minPersonId] ?? '?'}) · equity ${pct(r.metrics.equity)} · ${r.stats.calls} Qloo calls (${r.stats.cacheHits} cached)`,
    '',
  );
  if (r.profile.conflicts.length) {
    out.push('Taste conflicts:');
    for (const c of r.profile.conflicts) out.push(`  - [${c.level.toUpperCase()}] ${c.label}: ${c.explanation}`);
    out.push('');
  }
  out.push('Itinerary:');
  for (const s of r.itinerary) {
    out.push(`  ${s.time ?? '  —  '}  ${SLOT[s.slot] ?? s.slot}: ${s.place.name}${s.place.neighborhood ? ` (${s.place.neighborhood})` : ''}  [${pct(s.score.score)}]`);
    out.push(`      Why: ${s.why}`);
    for (const x of s.serves) out.push(`      Serves ${x.name}: ${x.reason}`);
    for (const c of s.conflicts) out.push(`      Conflict: ${c.text}\n        → ${c.resolution}`);
    for (const w of s.warnings) out.push(`      ⚠ ${w}`);
    if (s.place.openNote) out.push(`      Hours: ${s.place.openNote}`);
    for (const x of s.ruledOut) out.push(`      Ruled out: ${x.name} (${pct(x.score)}) — ${x.reason}`);
    if (s.vsNaive) out.push(`      Naive pick would be ${s.vsNaive.name} (lowest fit ${pct(s.vsNaive.minAffinity)} for ${s.vsNaive.weakest}${s.vsNaive.vetoed ? `; ${s.vsNaive.vetoed}` : ''}) vs ${pct(s.vsNaive.ourMin)} here.`);
    if (opts.evidence !== false) {
      out.push(`      Evidence: ${s.evidence.source} · venue ${s.evidence.qlooEntityIds[0]} · tags: ${s.evidence.candidateTags.map((t) => t.name).join(', ')}`);
      if (s.evidence.signals.length) out.push(`        signals: ${s.evidence.signals.map((x) => `${who[x.personId]}→${x.anchor}`).join('; ')}`);
    }
  }
  const a = r.audit;
  if (a) out.push('', `Fairness audit vs a naive "highest average affinity" ranker: it would have chosen differently at ${a.stopsChanged}/${a.stops} stops, broken a hard rule at ${a.naiveViolations}, and left people below 40% fit ${a.poorFitsNaive}× (this plan: ${a.poorFitsOurs}×); on the ${a.comparableStops} stops where its pick was legal, lowest-person fit is ${pct(a.avgMinAffinityNaive)} (naive) vs ${pct(a.avgMinAffinityOurs)} (this plan).`);
  out.push('', 'Personal wins:');
  for (const [id, stops] of Object.entries(r.metrics.winsByPerson)) out.push(`  - ${who[id]}: ${stops.length ? stops.join(', ') : '(none yet)'}`);
  if (r.warnings.length) out.push('', 'Warnings:', ...r.warnings.map((w) => `  - ${w}`));
  if (opts.trace) out.push('', 'Agent trace:', ...r.trace.map((t) => `  ${String(t.t).padStart(5)}ms ${t.phase.padEnd(10)} ${t.message}`));
  return out.join('\n');
}

export function formatPair(r: PairResult): string {
  const out: string[] = [];
  if (r.banner) out.push(`!! ${r.banner}`, '');
  out.push(`${r.people[0].name} × ${r.people[1].name}`);
  if (r.profile.overlapTags.length) out.push(`Shared tags: ${r.profile.overlapTags.map((t) => t.name).join(', ')}`);
  for (const c of r.profile.conflicts) out.push(`  - [${c.level.toUpperCase()}] ${c.label}: ${c.explanation}`);
  for (const d of r.domains) {
    out.push('', `${d.label}:`);
    for (const p of d.picks) out.push(`  - ${p.name} [${pct(p.score)}] ${p.why}`);
  }
  if (r.unresolved.length) out.push('', `Could not resolve: ${r.unresolved.map((u) => u.anchor).join(', ')}`);
  return out.join('\n');
}
