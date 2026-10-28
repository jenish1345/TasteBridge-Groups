// Itinerary assembly: per-slot feasibility, selection, personal-win guarantee, diplomacy, explanations.

import type {
  Axis,
  Candidate,
  Conflict,
  ItineraryStop,
  PersonProfile,
  PlanAudit,
  PlanMetrics,
  ScoredCandidate,
  SlotId,
} from '../types.js';
import { isOpenAt } from './hours.js';
import { SLOT_META, SLOT_ORDER } from './slots.js';
import { isViable, scoreSlot, type ScoringContext, WIN_MIN } from './scoring.js';
import { AXIS_META, tagText, positionFromTexts } from './taxonomy.js';

export const SWAP_TOLERANCE = 0.12; // a win-swap may cost at most this much fairness score
export const SWAP_MIN_AFFINITY = 0.3; // ...and may not push anyone below this
export const TIE_EPS = 0.02;

export type StopKey = SlotId | 'encore';

export interface Pick {
  key: StopKey;
  c: ScoredCandidate;
}

export interface PlanBuild {
  scored: Record<string, ScoredCandidate[]>;
  feasible: Record<string, ScoredCandidate[]>;
  picks: Pick[];
  warnings: string[];
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

const TAG_FAMILIES = ['genre', 'category', 'cuisine', 'ambience', 'setting', 'activity_type', 'good_for', 'offerings', 'amenity', 'dining'];
/** The tags worth showing a human: meaningful families first, junk (numbers, generic nouns) dropped. */
export function displayTags(tags: { id: string; name: string }[], n = 10) {
  const fam = (id: string) => {
    const m = /^urn:tag:([a-z_]+)/.exec(id);
    const i = m ? TAG_FAMILIES.findIndex((f) => m[1].startsWith(f)) : -1;
    return i < 0 ? TAG_FAMILIES.length : i;
  };
  return tags
    .filter((t) => !/^\d/.test(t.name) && !/^(place|food|takeout|hotel culture|foodies)$/i.test(t.name.trim()))
    .map((t, i) => ({ t, i, f: fam(t.id) }))
    .sort((a, b) => a.f - b.f || a.i - b.i)
    .slice(0, n)
    .map((x) => x.t);
}

/** Bridge-ness on the high-conflict axes: 1 = perfectly neutral. Used only to break near-ties. */
export function bridge(c: ScoredCandidate, conflicts: Conflict[]): number {
  const hot = conflicts.filter((x) => x.level !== 'low');
  if (!hot.length) return 0;
  return hot.reduce((s, x) => s + (1 - Math.abs(c.pos[x.axis])), 0) / hot.length;
}

export function bestOf(list: ScoredCandidate[], conflicts: Conflict[]): ScoredCandidate | undefined {
  if (!list.length) return undefined;
  const top = Math.max(...list.map((c) => c.breakdown.score));
  const near = list.filter((c) => top - c.breakdown.score <= TIE_EPS);
  return near.sort((x, y) => bridge(y, conflicts) - bridge(x, conflicts) || y.breakdown.score - x.breakdown.score)[0];
}

/** Viable-alternative logic: strict → drop unverifiable needs → relax key-person axis vetoes → anything. */
export function feasibleFor(scored: ScoredCandidate[]): { list: ScoredCandidate[]; note?: string } {
  const viable = scored.filter(isViable);
  if (viable.length) {
    const verified = viable.filter((c) => c.unverified.length === 0);
    return verified.length ? { list: verified } : { list: viable, note: 'could not verify every dietary/accessibility need from Qloo tags' };
  }
  const axisOnly = scored.filter((c) => !c.hardRejected && c.vetoes.every((v) => v.kind === 'axis'));
  if (axisOnly.length) return { list: axisOnly, note: 'every option conflicts with a key guest’s strong preference — relaxed it to the least-bad choice' };
  const noAvoid = scored.filter((c) => c.vetoes.every((v) => v.kind === 'axis'));
  if (noAvoid.length) return { list: noAvoid, note: 'every option broke a group vibe/budget limit — relaxed it to the least-bad choice' };
  return { list: scored, note: 'no option satisfied the hard constraints — showing the least-bad choice' };
}

export function winsOf(picks: Pick[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const p of picks) for (const id of p.c.winFor) m.set(id, [...(m.get(id) ?? []), p.c.entity.name]);
  return m;
}

export function buildPlan(
  pools: Partial<Record<SlotId, Candidate[]>>,
  ctx: ScoringContext,
  opts: { slots?: SlotId[]; exclude?: Partial<Record<StopKey, string[]>> } = {},
): PlanBuild {
  const warnings: string[] = [];
  const slots = (opts.slots ?? SLOT_ORDER).filter((s) => (pools[s]?.length ?? 0) > 0);
  const conflicts = ctxConflicts(ctx);
  const scored: Record<string, ScoredCandidate[]> = {};
  const feasible: Record<string, ScoredCandidate[]> = {};

  for (const s of SLOT_ORDER) {
    if (!pools[s]) continue;
    const ex = new Set(opts.exclude?.[s] ?? []);
    const all = scoreSlot(pools[s]!.filter((c) => !ex.has(c.entity.id)), ctx);
    scored[s] = all;
    const f = feasibleFor(all);
    feasible[s] = f.list;
    if (f.note && slots.includes(s)) warnings.push(`${SLOT_META[s].label}: ${f.note}.`);
  }

  // 1) initial picks, no place used twice
  const used = new Set<string>();
  const picks: Pick[] = [];
  for (const s of slots) {
    const c = bestOf(feasible[s].filter((x) => !used.has(x.entity.id)), conflicts);
    if (c) {
      picks.push({ key: s, c });
      used.add(c.entity.id);
    } else {
      warnings.push(`${SLOT_META[s].label}: no candidates were returned for this stop.`);
    }
  }

  // 2) personal-win guarantee via bounded swaps. The guest of honor counts triple: if one person can't have a win, it isn't them.
  const personIds = ctx.profiles.map((p) => p.person.id);
  const weight = (id: string) => (ctx.profiles.find((p) => p.person.id === id)?.person.isKey ? 3 : 1);
  const improveWins = () => {
    for (let iter = 0; iter < 8; iter++) {
      const wins = winsOf(picks);
      const missing = personIds.filter((id) => !wins.has(id));
      if (!missing.length) break;
      let best: { idx: number; c: ScoredCandidate; gain: number } | undefined;
      picks.forEach((pk, idx) => {
        if (pk.key === 'encore') return;
        for (const c of feasible[pk.key] ?? []) {
          if (c.entity.id === pk.c.entity.id || used.has(c.entity.id)) continue;
          const gainedIds = c.winFor.filter((id) => missing.includes(id));
          if (!gainedIds.length) continue;
          const loss = pk.c.breakdown.score - c.breakdown.score;
          if (loss > SWAP_TOLERANCE || c.breakdown.minAffinity < SWAP_MIN_AFFINITY) continue;
          const lostIds = pk.c.winFor.filter((id) => !c.winFor.includes(id) && picks.every((o, j) => j === idx || !o.c.winFor.includes(id)));
          const net = gainedIds.reduce((a, id) => a + weight(id), 0) - lostIds.reduce((a, id) => a + weight(id), 0);
          const gain = net - Math.max(0, loss) * 2;
          if (net > 0 && (!best || gain > best.gain)) best = { idx, c, gain };
        }
      });
      if (!best) break;
      used.delete(picks[best.idx].c.entity.id);
      used.add(best.c.entity.id);
      picks[best.idx] = { key: picks[best.idx].key, c: best.c };
    }
  };
  improveWins();

  // 3) still missing people → one "Encore" stop that wins for as many of them as possible
  {
    const wins = winsOf(picks);
    const missing = personIds.filter((id) => !wins.has(id));
    if (missing.length && !picks.some((p) => p.key === 'encore')) {
      const pool: ScoredCandidate[] = (['drink', 'winddown', 'activity'] as SlotId[])
        .flatMap((s) => feasible[s] ?? [])
        .filter((c) => !used.has(c.entity.id) && c.breakdown.minAffinity >= SWAP_MIN_AFFINITY);
      let best: { c: ScoredCandidate; n: number } | undefined;
      for (const c of pool) {
        const n = c.winFor.filter((id) => missing.includes(id)).reduce((a, id) => a + weight(id), 0);
        if (n && (!best || n > best.n || (n === best.n && c.breakdown.score > best.c.breakdown.score))) best = { c, n };
      }
      if (best) {
        picks.push({ key: 'encore', c: best.c });
        used.add(best.c.entity.id);
      }
    }
    // the Encore can make an earlier stop's win redundant, which frees that stop to be swapped for someone else's win
    improveWins();
    const after = winsOf(picks);
    // only warn when someone has neither an exclusive win nor a closest fit; a closest fit is shown, not apologised for
    const still = ctx.profiles.filter((p) => !after.has(p.person.id) && !picks.some((pk) => pk.c.closeFor.includes(p.person.id)));
    if (still.length) warnings.push(`No stop fits ${still.map((p) => p.person.name).join(', ')} well yet. Adding a few more taste anchors for them would help.`);
  }

  return { scored, feasible, picks, warnings };
}

function ctxConflicts(ctx: ScoringContext): Conflict[] {
  // light recompute so itinerary does not need the GroupProfile object
  return ctx.conflicts ?? [];
}

// ----------------------------------------------------------------- metrics

export function planMetrics(picks: Pick[], profiles: PersonProfile[]): PlanMetrics {
  const n = picks.length || 1;
  const meanScore = picks.reduce((s, p) => s + p.c.breakdown.score, 0) / n;
  const avgs = profiles.map((p) => ({ id: p.person.id, v: picks.reduce((s, pk) => s + (pk.c.a[p.person.id] ?? 0), 0) / n }));
  const min = avgs.reduce((m, x) => (x.v < m.v ? x : m), avgs[0] ?? { id: '', v: 0 });
  const winsMap = winsOf(picks);
  const winsByPerson: Record<string, string[]> = {};
  const closeByPerson: Record<string, string[]> = {};
  for (const p of profiles) {
    const id = p.person.id;
    winsByPerson[id] = winsMap.get(id) ?? [];
    closeByPerson[id] = winsByPerson[id].length ? [] : picks.filter((pk) => pk.c.closeFor.includes(id)).map((pk) => pk.c.entity.name);
  }
  return {
    meanScore: r3(meanScore),
    minPersonAvg: r3(min.v),
    minPersonId: min.id,
    equity: r3(1 - gini(avgs.map((a) => a.v))),
    winsByPerson,
    closeByPerson,
    peopleWithoutExclusive: profiles.filter((p) => !winsMap.has(p.person.id)).map((p) => p.person.id),
    peopleWithoutWin: profiles.filter((p) => !winsMap.has(p.person.id) && !closeByPerson[p.person.id].length).map((p) => p.person.id),
  };
}

function gini(xs: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  if (!mean) return 0;
  let s = 0;
  for (const a of xs) for (const b of xs) s += Math.abs(a - b);
  return s / (2 * n * n * mean);
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

// ----------------------------------------------------------------- synthesis (templated, evidence-bound)

function clock(datetime: string | undefined, offsetMin: number): string | undefined {
  const m = datetime && /(\d{1,2}):(\d{2})/.exec(datetime);
  if (!m) return undefined;
  const total = (Number(m[1]) * 60 + Number(m[2]) + offsetMin) % (24 * 60);
  const h = Math.floor(total / 60);
  const mm = String(total % 60).padStart(2, '0');
  return `${((h + 11) % 12) + 1}:${mm} ${h >= 12 ? 'PM' : 'AM'}`;
}

function driverAnchors(profile: PersonProfile, c: ScoredCandidate): { names: string[]; tags: string[] } {
  const cTags = new Set(c.entity.tags.map((t) => t.name.toLowerCase()));
  const qlooDrivers = c.explain?.[profile.person.id] ?? [];
  const scored = profile.anchors
    .filter((a) => a.status === 'resolved')
    .map((a) => {
      const texts = a.entity ? [a.entity.name, ...a.entity.tags.map(tagText)] : a.tag ? [tagText(a.tag)] : [a.anchor.text];
      const pos = positionFromTexts(texts, a.entity?.priceLevel).pos;
      let d = 0;
      for (const k of Object.keys(pos) as Axis[]) d += Math.abs(pos[k] - c.pos[k]);
      const shared = (a.entity?.tags ?? (a.tag ? [a.tag] : [])).filter((t) => cTags.has(t.name.toLowerCase())).map((t) => t.name);
      // Qloo's own explainability (which signal entities drove this match) outranks our axis heuristic
      const ex = a.entity ? qlooDrivers.indexOf(a.entity.id) : -1;
      return { name: a.entity?.name ?? a.tag?.name ?? a.anchor.text, sim: 1 - d / 10 + shared.length * 0.15 + (ex >= 0 ? 2 - ex * 0.1 : 0), shared };
    })
    .sort((x, y) => y.sim - x.sim);
  return { names: scored.slice(0, 2).map((x) => x.name), tags: [...new Set(scored.flatMap((x) => x.shared))].slice(0, 3) };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const meanA = (c: ScoredCandidate) => mean(Object.values(c.a));
const minA = (c: ScoredCandidate) => Math.min(...Object.values(c.a));

/** What an "average affinity" ranker would pick: highest mean individual affinity, ignoring vetoes and conflicts. */
export function naivePick(list: ScoredCandidate[]): ScoredCandidate | undefined {
  return [...list].sort((x, y) => meanA(y) - meanA(x) || (y.entity.popularity ?? 0) - (x.entity.popularity ?? 0))[0];
}

const brokeRule = (c: ScoredCandidate): string | undefined => c.vetoes[0]?.reason ?? c.hardRejected;

export function planAudit(build: PlanBuild, picks: Pick[], profiles: PersonProfile[]): PlanAudit {
  let changed = 0, violations = 0, comparable = 0, minO = 0, minN = 0, poorO = 0, poorN = 0;
  for (const pk of picks) {
    const nv = naivePick(build.scored[pk.c.slot] ?? []) ?? pk.c;
    if (nv.entity.id !== pk.c.entity.id) changed++;
    if (brokeRule(nv)) violations++;
    else { comparable++; minO += minA(pk.c); minN += minA(nv); } // compare fit only where the naive pick was itself legal
    for (const p of profiles) {
      if ((pk.c.a[p.person.id] ?? 1) < 0.4) poorO++;
      if ((nv.a[p.person.id] ?? 1) < 0.4) poorN++;
    }
  }
  const n = comparable || 1;
  return { stops: picks.length, stopsChanged: changed, naiveViolations: violations, comparableStops: comparable, avgMinAffinityOurs: r3(minO / n), avgMinAffinityNaive: r3(minN / n), poorFitsOurs: poorO, poorFitsNaive: poorN };
}

function openNote(e: { hours?: Record<string, [number, number][]> }, datetime: string | undefined, key: StopKey): string | undefined {
  const o = isOpenAt(e.hours, datetime, key === 'encore' ? 360 : SLOT_META[key].startOffsetMin);
  if (o.open === undefined) return undefined;
  return o.open ? `Open at ${o.at}, until ${o.closesAt}` : `Closed at ${o.at}`;
}

export function synthesizeStop(
  pick: Pick,
  all: Pick[],
  build: PlanBuild,
  ctx: ScoringContext,
  slotLabelTime?: string,
): ItineraryStop {
  const { c } = pick;
  const e = c.entity;
  const byId = new Map(ctx.profiles.map((p) => [p.person.id, p]));
  const nm = (id: string) => byId.get(id)?.person.name ?? id;
  const b = c.breakdown;

  // who this serves
  const ranked = ctx.profiles
    .map((p) => ({ p, a: c.a[p.person.id] }))
    .sort((x, y) => y.a - x.a);
  const servers = ranked.filter((r) => c.winFor.includes(r.p.person.id) || c.closeFor.includes(r.p.person.id) || r.a >= WIN_MIN + 0.05).slice(0, 4);
  const serves = servers.map(({ p, a }) => {
    const d = driverAnchors(p, c);
    const q = c.qloo[p.person.id];
    const link = d.names.length ? `echoes ${d.names.join(' & ')}` : 'fits their overall taste profile';
    const via = d.tags.length ? ` (shared signals: ${d.tags.join(', ')})` : '';
    const win = c.winFor.includes(p.person.id) ? 'Personal win. ' : c.closeFor.includes(p.person.id) ? 'Closest to theirs. ' : '';
    return {
      personId: p.person.id,
      name: p.person.name,
      reason: `${win}${link}${via}; ${q !== undefined ? `Qloo affinity ${pct(q)}, ` : ''}individual fit ${pct(a)}.`,
    };
  });

  // conflicts this stop touches and how the plan resolves them
  const conflicts: ItineraryStop['conflicts'] = [];
  for (const cf of ctx.conflicts ?? []) {
    const pos = c.pos[cf.axis];
    const m = AXIS_META[cf.axis];
    const aNames = cf.sideA.map(nm).join(' & ');
    const bNames = cf.sideB.map(nm).join(' & ');
    if (Math.abs(pos) < 0.3) {
      if (cf.level === 'high') conflicts.push({ axis: cf.axis, text: `${m.label}: ${cf.explanation}`, resolution: `This stop sits in the middle of the ${m.pos}/${m.neg} spectrum, so ${aNames} and ${bNames} can both enjoy it.` });
      continue;
    }
    const favorsA = pos > 0;
    const loserSide = favorsA ? cf.sideB : cf.sideA;
    const loserNames = favorsA ? bNames : aNames;
    const winnerNames = favorsA ? aNames : bNames;
    // find a different stop that leans the other way where a "loser" person has a win
    const comp = all.find(
      (o) => o.c !== c && Math.abs(o.c.pos[cf.axis]) >= 0.3 && Math.sign(o.c.pos[cf.axis]) === -Math.sign(pos) && loserSide.some((id) => o.c.winFor.includes(id)),
    );
    const side = favorsA ? m.pos : m.neg;
    const verb = loserSide.length > 1 ? 'are' : 'is';
    conflicts.push({
      axis: cf.axis,
      text: `${m.label}: ${cf.explanation}`,
      resolution: comp
        ? `Leans ${side} for ${winnerNames}; ${loserNames} ${verb} balanced by ${comp.c.entity.name} (${favorsA ? m.neg : m.pos}-leaning).`
        : `Leans ${side} for ${winnerNames}; kept within ${loserNames}'s tolerance (mean conflict load ${pct(1 - b.conflictPenalty)}).`,
    });
  }
  const weak = ranked[ranked.length - 1];
  if (weak && weak.a < 0.45) {
    const win = all.find((o) => o.c.winFor.includes(weak.p.person.id));
    conflicts.push({
      axis: 'novelty',
      text: `${weak.p.person.name} is the weakest fit here (${pct(weak.a)}).`,
      resolution: win ? `Their personal win is ${win.c.entity.name}.` : 'See warnings — more anchors would help.',
    });
  }

  const top = ranked[0];
  const topD = top ? driverAnchors(top.p, c) : { names: [], tags: [] };
  const why =
    `Fairness score ${pct(b.score)} — ${pct(b.coverage)} group coverage, lowest individual fit ${pct(b.minAffinity)} (${nm(b.weakestPersonId)}), ` +
    `${pct(b.conflictPenalty)} conflict-free. ` +
    (top ? `Qloo links it to ${top.p.person.name}'s taste${topD.names.length ? ` (${topD.names.join(', ')})` : ''}` : '') +
    `${serves.length > 1 ? ` and ${serves.length - 1} other${serves.length > 2 ? 's' : ''}` : ''}.`;

  const warnings: string[] = [];
  if (c.unverified.length) warnings.push(`Unverified: confirm ${c.unverified.join(', ')} with the venue (not confirmed by Qloo tags).`);
  if (c.vetoes.length) warnings.push(`Relaxed: ${c.vetoes.map((v) => v.reason).join('; ')}.`);
  if (c.hardRejected) warnings.push(`Relaxed: ${c.hardRejected}.`);
  if (e.source === 'sample-fallback') warnings.push('This stop used SAMPLE fallback data because Qloo was unavailable.');

  const signals = ctx.profiles.flatMap((p) => {
    const d = driverAnchors(p, c).names;
    return p.anchors
      .filter((a) => a.status === 'resolved' && (a.entity || a.tag) && d.includes(a.entity?.name ?? a.tag?.name ?? ''))
      .map((a) => ({ personId: p.person.id, anchor: a.entity?.name ?? a.tag?.name ?? a.anchor.text, entityId: a.entity?.id, tagId: a.tag?.id }));
  });

  const slotKey = pick.key;
  const slotMeta = slotKey === 'encore' ? undefined : SLOT_META[slotKey];
  return {
    slot: slotKey,
    title: slotKey === 'encore' ? `Encore: ${e.name}` : `${slotMeta!.label}: ${e.name}`,
    place: {
      id: e.id,
      name: e.name,
      type: e.type,
      address: e.address,
      neighborhood: e.neighborhood,
      priceLevel: e.priceLevel,
      rating: e.rating,
      image: e.image,
      description: e.description,
      website: e.website,
      phone: e.phone,
      openNote: openNote(e, ctx.constraints.datetime, slotKey),
    },
    time: slotLabelTime,
    score: b,
    affinities: c.a,
    why,
    serves,
    conflicts,
    evidence: {
      source: e.source,
      qlooEntityIds: [e.id, ...signals.map((s) => s.entityId).filter((x): x is string => !!x)],
      candidateTags: displayTags(e.tags),
      signals,
      affinitySignals: ctx.profiles.map((p) => ({ personId: p.person.id, qlooAffinity: c.qloo[p.person.id], individual: c.a[p.person.id] })),
      explain: e.explain,
    },
    warnings,
    ruledOut: (build.scored[c.slot] ?? [])
      .filter((x) => x.entity.id !== e.id && !isViable(x) && x.breakdown.score >= b.score - 0.1)
      .slice(0, 3)
      .map((x) => ({ name: x.entity.name, score: x.breakdown.score, reason: brokeRule(x) ?? 'ruled out' })),
    vsNaive: (() => {
      const nv = naivePick(build.scored[c.slot] ?? []);
      if (!nv || nv.entity.id === e.id) return undefined;
      return { name: nv.entity.name, meanAffinity: r3(meanA(nv)), minAffinity: r3(minA(nv)), weakest: nm(nv.breakdown.weakestPersonId), ourMean: r3(meanA(c)), ourMin: r3(minA(c)), vetoed: brokeRule(nv) };
    })(),
    alternatives: (build.feasible[slotKey === 'encore' ? 'drink' : slotKey] ?? [])
      .filter((x) => x.entity.id !== e.id && !all.some((o) => o.c.entity.id === x.entity.id))
      .slice(0, 3)
      .map((x) => ({ id: x.entity.id, name: x.entity.name, score: x.breakdown.score })),
  };
}

export function synthesize(build: PlanBuild, ctx: ScoringContext, datetime?: string): ItineraryStop[] {
  const ordered = [...build.picks].sort((a, b) => order(a.key) - order(b.key));
  return ordered.map((p) => {
    const off = p.key === 'encore' ? 360 : SLOT_META[p.key].startOffsetMin;
    return synthesizeStop(p, ordered, build, ctx, clock(datetime, off));
  });
}

const order = (k: StopKey) => (k === 'encore' ? 99 : SLOT_ORDER.indexOf(k));
