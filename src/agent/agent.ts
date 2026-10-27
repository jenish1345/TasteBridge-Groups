// The TasteBridge group agent: plan → resolve → retrieve → reflect/retry → score → synthesize.
// Every decision is recorded in a trace the UI renders, so the workflow is visible, not magic.

import { assemble } from '../core/plan.js';
import { buildGroupProfile, buildPersonProfile } from '../core/profile.js';
import { buildCandidates } from '../core/scoring.js';
import { feasibleFor } from '../core/itinerary.js';
import { scoreSlot } from '../core/scoring.js';
import { contextOf, selectionOf } from '../core/plan.js';
import { inCity, pickPlaceTag, placeMismatch, SLOT_META, SLOT_ORDER, slotsOf } from '../core/slots.js';
import { QlooAuthError } from '../qloo/live.js';
import { KNOWN_PLACE_TAGS } from '../qloo/known-tags.js';
import { getProvider } from '../qloo/provider.js';
import { SampleQlooProvider } from '../qloo/sample.js';
import { SAMPLE_CITIES } from '../qloo/fixtures.js';
import { resolveAnchor } from '../qloo/resolve.js';
import { nameSimilarity } from '../qloo/similarity.js';
import { loadConfig } from '../config.js';
import type {
  Candidate,
  DataMode,
  GroupRequest,
  PersonProfile,
  PlanResult,
  ProviderStats,
  QlooEntity,
  QlooProvider,
  ResolvedAnchor,
  SessionState,
  SlotId,
  TraceEvent,
} from '../types.js';
import { extractJson, getLlm, type Llm } from './llm.js';
import { narrate } from './narrate.js';

const MIN_POOL = 6;
const POOL_TAKE = 50;
const MAX_CANDIDATES = 25;
const FAVORITES_TAKE = 30;
const SCORE_BATCH = 50;

export interface AgentOptions {
  qloo?: QlooProvider;
  llm?: Llm | null;
  /** Called for every trace event as it happens (used by the streaming endpoint). */
  onEvent?: (e: TraceEvent) => void;
}

interface Params {
  loc: string;
  tags: boolean;
  price: boolean;
  label: string;
}

export async function runGroupAgent(req: GroupRequest, opts: AgentOptions = {}): Promise<PlanResult> {
  const cfg = loadConfig();
  const llm = opts.llm === null ? undefined : (opts.llm ?? getLlm(cfg));
  const qloo = opts.qloo ?? getProvider(cfg);
  try {
    return await run(req, qloo, llm, undefined, opts.onEvent);
  } catch (err) {
    if (err instanceof QlooAuthError) {
      const r = await run(req, new SampleQlooProvider(), llm, `Qloo rejected the API key (${err.message}). Showing SAMPLE DATA instead — fix QLOO_API_KEY to go live.`, opts.onEvent);
      return r;
    }
    throw err;
  }
}

async function run(req: GroupRequest, qloo: QlooProvider, llm: Llm | undefined, forcedBanner?: string, onEvent?: (e: TraceEvent) => void): Promise<PlanResult> {
  const t0 = Date.now();
  const trace: TraceEvent[] = [];
  const log = (phase: TraceEvent['phase'], message: string, data?: unknown) => {
    const ev: TraceEvent = { t: Date.now() - t0, phase, message, data };
    trace.push(ev);
    try { onEvent?.({ ...ev, data: undefined }); } catch { /* a broken stream must not break planning */ }
  };
  const statsBefore = qloo.stats();
  const warnings: string[] = [];
  const c = req.constraints;
  const slots: SlotId[] = (req.slots?.length ? req.slots : SLOT_ORDER).filter((s) => s !== 'winddown' || req.includeWindDown !== false);

  // ------------------------------------------------------------ 1. PLAN
  const anchorCount = req.people.reduce((n, p) => n + p.anchors.length, 0);
  log('plan', `Planning for ${req.people.length} people in ${c.city}${c.neighborhood ? ` / ${c.neighborhood}` : ''}: resolve ${anchorCount} taste anchors → look up venue tags for ${slots.length} stops → query Qloo per person and for the group pool → score fairness → resolve conflicts → build itinerary.`, {
    mode: qloo.mode,
    llm: llm?.name ?? null,
    slots,
  });

  // ------------------------------------------------------------ 2. RESOLVE anchors
  const rewrite = llm
    ? async (text: string, kind: string) => {
        const raw = await llm.complete('You fix misspelled or loosely-worded cultural references.', `The user typed "${text}" (kind: ${kind}). Reply with JSON only: an array of up to 3 canonical entity names it might refer to.`, { maxTokens: 120 });
        const arr = extractJson<string[]>(raw);
        return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
      }
    : undefined;

  const resolvedByPerson: Record<string, ResolvedAnchor[]> = {};
  await Promise.all(
    req.people.map(async (p) => {
      resolvedByPerson[p.id] = await Promise.all(
        p.anchors.map((a) => resolveAnchor(a, { qloo, rewrite, trace: (ph, m, d) => log(ph, `${p.name}: ${m}`, d) })),
      );
    }),
  );
  const unresolved: PlanResult['unresolved'] = [];
  for (const p of req.people) {
    for (const ra of resolvedByPerson[p.id]) if (ra.status === 'unresolved') unresolved.push({ personId: p.id, anchor: ra.anchor.text });
  }
  const profiles: PersonProfile[] = req.people.map((p) => buildPersonProfile(p, resolvedByPerson[p.id]));

  // ------------------------------------------------------------ 3. REFLECT on resolution
  for (const pr of profiles) {
    const n = pr.anchors.filter((a) => a.status === 'resolved').length;
    const hasSignal = pr.signalEntityIds.length + pr.signalTagIds.length > 0;
    if (!hasSignal) {
      log('reflect', `${pr.person.name} has no Qloo-resolvable anchors — their preferences will rely on vibe keywords only (low confidence).`);
      warnings.push(`${pr.person.name}: no anchors resolved to Qloo entities, so Qloo could not personalise for them. Add a few artists, films or foods.`);
    } else if (n < 2) {
      log('reflect', `${pr.person.name} resolved only ${n} anchor — flagged low-confidence.`);
    }
  }
  if (unresolved.length) warnings.push(`Could not resolve: ${unresolved.map((u) => `"${u.anchor}"`).join(', ')}.`);

  // ------------------------------------------------------------ 4. venue-tag lookups per slot
  const slotTags: Record<string, string[]> = {};
  await Promise.all(
    slots.map(async (s) => {
      const ids: string[] = [];
      const hits = await Promise.all(
        SLOT_META[s].terms.map(async (term) => {
          const known = qloo.mode === 'live' ? KNOWN_PLACE_TAGS[term] : undefined;
          if (known) return { id: known, name: term };
          const tags = await qloo.searchTags(term, { take: 6 });
          return pickPlaceTag(term, tags);
        }),
      );
      for (const h of hits) if (h && !ids.includes(h.id)) ids.push(h.id);
      slotTags[s] = ids;
      log('act', `${SLOT_META[s].label}: mapped ${SLOT_META[s].terms.length} venue terms to ${ids.length} Qloo tags${qloo.mode === 'live' ? ' (verified IDs, live lookup for unknowns)' : ''}`, { tagIds: ids });
    }),
  );

  // ------------------------------------------------------------ 5. retrieve per slot with broaden-and-retry
  const groupEntities = roundRobin(profiles.map((p) => p.signalEntityIds), 20);
  const groupTags = roundRobin(profiles.map((p) => p.signalTagIds), 6);

  const locations: string[] = [];
  if (c.neighborhood) locations.push(`${c.neighborhood}, ${c.city}`);
  locations.push(c.city);
  const cityToken = c.city.split(',')[0].trim();
  if (cityToken && cityToken !== c.city) locations.push(cityToken);

  const ladderFor = (): Params[] => {
    const l: Params[] = [];
    l.push({ loc: locations[0], tags: true, price: true, label: c.neighborhood ? 'neighborhood + tags + budget' : 'city + tags + budget' });
    if (c.neighborhood) l.push({ loc: c.city, tags: true, price: true, label: 'dropped the neighborhood (city-wide)' });
    if (cityToken !== c.city) l.push({ loc: cityToken, tags: true, price: true, label: `simplified the city to "${cityToken}"` });
    l.push({ loc: cityToken, tags: false, price: true, label: 'dropped the venue-tag filter (classifying locally)' });
    l.push({ loc: cityToken, tags: false, price: false, label: 'widened the price range' });
    if (qloo.mode === 'sample' && !SAMPLE_CITIES.some((x) => nameSimilarity(cityToken, x) >= 0.8)) {
      l.push({ loc: SAMPLE_CITIES[0], tags: false, price: false, label: `SAMPLE fixtures only cover ${SAMPLE_CITIES.join(', ')} — using ${SAMPLE_CITIES[0]}` });
    }
    return l;
  };

  const queryFor = (slot: SlotId, p: Params, ents: string[], tags: string[], take: number, explain = false) =>
    qloo.insights({
      type: 'urn:entity:place',
      signalEntities: ents,
      signalTags: tags,
      filterTags: p.tags ? slotTags[slot] : undefined,
      locationQuery: p.loc,
      priceMax: p.price ? c.budget : undefined,
      take,
      explain,
    });

  const eligible = (slot: SlotId, es: QlooEntity[]) => es.filter((e) => e.type === 'urn:entity:place' && !e.permanentlyClosed && inCity(e, c.city) && slotsOf(e).includes(slot));
  const offCity = (es: QlooEntity[]) => es.filter((e) => e.type === 'urn:entity:place' && !inCity(e, c.city));

  const usedParams: Record<string, Params> = {};

  const fetchSlotPool = async (slot: SlotId, startAt = 0): Promise<{ params: Params; step: number; pool: QlooEntity[] } | undefined> => {
    const ladder = ladderFor();
    let best: { params: Params; step: number; pool: QlooEntity[] } | undefined;
    for (let i = startAt; i < ladder.length; i++) {
      const p = ladder[i];
      const res = await queryFor(slot, p, groupEntities, groupTags, POOL_TAKE);
      const good = eligible(slot, res.entities);
      const off = offCity(res.entities);
      if (off.length) {
        log('reflect', `${SLOT_META[slot].label}: Qloo matched "${p.loc}" loosely — discarded ${off.length} venue(s) outside ${c.city} (e.g. ${off[0].name}${off[0].city ? `, ${off[0].city}` : ''})`);
        if (!good.length && !warnings.some((w) => w.startsWith('Qloo could not find'))) warnings.push(`Qloo could not find "${c.city}" — check the spelling of the city.`);
      }
      log(i === startAt && startAt === 0 ? 'act' : 'retry', `${SLOT_META[slot].label}: Qloo group query (${p.label}) → ${good.length} eligible venues${res.warnings.length ? ` [${res.warnings[0]}]` : ''}`, { params: p, returned: res.entities.length });
      if (!best || good.length > best.pool.length) best = { params: p, step: i, pool: good };
      if (good.length >= MIN_POOL) break;
      log('reflect', `${SLOT_META[slot].label}: only ${good.length} venues (<${MIN_POOL}) — broadening: next ${ladder[i + 1]?.label ?? 'no further options'}`);
    }
    return best;
  };

  const hasSignal = (pr: PersonProfile) => pr.signalEntityIds.length + pr.signalTagIds.length > 0;
  const slotPool: Record<string, QlooEntity[]> = {};

  const addToPool = (slot: SlotId, es: QlooEntity[]) => {
    const cur = slotPool[slot] ?? (slotPool[slot] = []);
    const seen = new Set(cur.map((e) => e.id));
    for (const e of es) if (!seen.has(e.id)) { cur.push(e); seen.add(e.id); }
  };

  // Phase B (started now, in parallel with Phase A): each person's own favourites — one call each, all stops at once —
  // so minority tastes can surface even when the group-blend query would bury them.
  const ref0 = ladderFor()[0];
  const allSlotTags = [...new Set(slots.flatMap((s) => slotTags[s] ?? []))];
  const favP = Promise.all(
    profiles.filter(hasSignal).map(async (pr) => ({
      pr,
      res: await qloo.insights({
        type: 'urn:entity:place',
        signalEntities: pr.signalEntityIds,
        signalTags: pr.signalTagIds,
        filterTags: allSlotTags.length ? allSlotTags : undefined,
        locationQuery: ref0.loc,
        priceMax: c.budget,
        take: FAVORITES_TAKE,
      }),
    })),
  );
  favP.catch(() => undefined); // surfaced when awaited below

  // Phase A: group pool per slot (with the broaden-and-retry ladder)
  await Promise.all(
    slots.map(async (slot) => {
      const got = await fetchSlotPool(slot);
      if (!got || !got.pool.length) {
        log('observe', `${SLOT_META[slot].label}: no venues found even after broadening`);
        warnings.push(`No venues found for "${SLOT_META[slot].label}" in ${c.city}.`);
        return;
      }
      usedParams[slot] = got.params;
      addToPool(slot, got.pool);
    }),
  );
  const sparseNote = (slot: SlotId) => usedParams[slot] && usedParams[slot].label !== (c.neighborhood ? 'neighborhood + tags + budget' : 'city + tags + budget');
  for (const slot of slots) if (usedParams[slot] && sparseNote(slot)) warnings.push(`${SLOT_META[slot].label}: results were sparse so the search was broadened (${usedParams[slot].label}).`);

  const activeSlots = slots.filter((s) => usedParams[s]);
  for (const { pr, res } of await favP) {
    let added = 0;
    for (const slot of activeSlots) {
      const es = eligible(slot, res.entities);
      added += es.length;
      addToPool(slot, es);
    }
    log('act', `${pr.person.name}: Qloo favourites query → ${added} venue matches across stops`);
  }

  // Phase C: score EVERY pooled venue for EVERY person (filter.results.entities, ≤50 ids per call)
  const pools: Record<string, Candidate[]> = {};
  const scoreAll = async () => {
    for (const slot of activeSlots) {
      slotPool[slot] = (slotPool[slot] ?? [])
        .sort((x, y) => (y.affinity ?? y.popularity ?? 0) - (x.affinity ?? x.popularity ?? 0))
        .slice(0, MAX_CANDIDATES);
    }
    const ids = [...new Set(activeSlots.flatMap((s) => slotPool[s].map((e) => e.id)))];
    const batches: string[][] = [];
    for (let i = 0; i < ids.length; i += SCORE_BATCH) batches.push(ids.slice(i, i + SCORE_BATCH));
    const personAll: Record<string, QlooEntity[]> = {};
    await Promise.all(
      profiles.map(async (pr) => {
        if (!hasSignal(pr)) return void (personAll[pr.person.id] = []);
        const out: QlooEntity[] = [];
        for (const batch of batches) {
          // tag signals make Qloo's scoring call ~15x slower, so use them only for people who have no entity anchors
          const res = await qloo.insights({ type: 'urn:entity:place', signalEntities: pr.signalEntityIds, signalTags: pr.signalEntityIds.length ? undefined : pr.signalTagIds, resultEntities: batch, take: SCORE_BATCH, explain: true });
          out.push(...res.entities);
        }
        personAll[pr.person.id] = out.sort((x, y) => (y.affinity ?? 0) - (x.affinity ?? 0));
      }),
    );
    log('act', `Scored ${ids.length} candidate venues for ${profiles.length} people with Qloo affinity (${batches.length} batch${batches.length === 1 ? '' : 'es'} each)`);
    for (const slot of activeSlots) {
      const inSlot = new Set(slotPool[slot].map((e) => e.id));
      const lists = Object.fromEntries(profiles.map((pr) => [pr.person.id, personAll[pr.person.id].filter((e) => inSlot.has(e.id))]));
      pools[slot] = buildCandidates(slot, slotPool[slot], lists, profiles);
    }
  };
  await scoreAll();

  // ------------------------------------------------------------ 6. conflicts + scoring
  const group = buildGroupProfile(profiles, c.vibes);
  for (const cf of group.conflicts) log('observe', `Conflict (${cf.level}, ${Math.round(cf.severity * 100)}%): ${cf.label} — ${cf.explanation}`, cf);
  if (!group.conflicts.length) log('observe', 'No taste conflicts detected across the group.');
  log('observe', `Group overlap: ${group.overlapTags.map((t) => t.name).join(', ') || 'none shared by everyone'}; ${group.sharedTags.length} partially shared tags.`);

  const baseSession = (): SessionState => ({
    request: req,
    profiles,
    pools,
    selection: {},
    rejected: {},
    dataMode: 'sample',
  });

  // ------------------------------------------------------------ 7. reflect on feasibility, broaden once more if needed
  let session = baseSession();
  let built = assemble(session);
  const ctx = contextOf(session);
  let enlarged = false;
  for (const slot of activeSlots) {
    if (!pools[slot]) continue;
    const f = feasibleFor(scoreSlot(pools[slot], ctx));
    if (f.note) {
      const ladder = ladderFor();
      const cur = ladder.findIndex((x) => x.label === usedParams[slot]?.label);
      if (cur >= 0 && cur < ladder.length - 1) {
        log('reflect', `${SLOT_META[slot].label}: ${f.note}. Retrying with a broader query to find a cleaner option.`);
        const more = await fetchSlotPool(slot, cur + 1);
        if (more && more.pool.length) {
          addToPool(slot, more.pool);
          usedParams[slot] = more.params;
          enlarged = true;
        }
      }
    }
  }
  if (enlarged) await scoreAll();
  session = baseSession();
  built = assemble(session);
  session.selection = selectionOf(built.picks);

  for (const cf of group.conflicts.filter((x) => x.level !== 'low')) {
    log('reflect', `Diplomacy: ${cf.label} is ${cf.level} — preferring bridge venues for shared stops and giving each side a personal win elsewhere.`);
  }
  for (const [pid, stops] of Object.entries(built.metrics.winsByPerson)) {
    const nm = profiles.find((p) => p.person.id === pid)?.person.name;
    log('observe', stops.length ? `${nm}: personal win at ${stops.join(', ')}` : `${nm}: no personal win found`);
  }
  if (built.picks.some((p) => p.key === 'encore')) log('reflect', 'Some people still lacked a personal win — added an Encore stop to cover them.');

  const mismatch = placeMismatch(built.picks.map((p) => p.c.entity), c.city);
  if (mismatch) { warnings.push(mismatch); log('reflect', mismatch); }

  // ------------------------------------------------------------ 8. synthesize
  let itinerary = built.itinerary;
  const nar = await narrate(llm, itinerary);
  if (nar.used) {
    itinerary = nar.stops;
    log('synthesize', `LLM (${llm!.name}) rephrased explanations from the evidence JSON only.`);
  }
  log('synthesize', `Itinerary ready: ${itinerary.map((s) => s.place.name).join(' → ')}`);

  // ------------------------------------------------------------ result
  const statsAfter = qloo.stats();
  const stats = diffStats(statsBefore, statsAfter);
  let dataMode: DataMode = qloo.mode === 'sample' ? 'sample' : stats.fallbacks > 0 ? 'live-degraded' : 'live';
  if (forcedBanner) dataMode = 'sample';
  session.dataMode = dataMode;
  const banner =
    forcedBanner ??
    (dataMode === 'sample'
      ? 'SAMPLE DATA mode — QLOO_API_KEY is not set. Entities, venues and affinities are illustrative fixtures, not live Qloo results.'
      : dataMode === 'live-degraded'
        ? `Live Qloo with ${stats.fallbacks} fallback call(s) to SAMPLE data because Qloo was unavailable or rate limited. Affected evidence is marked.`
        : undefined);
  if (nar.headline) log('info', nar.headline);

  return {
    ok: true,
    dataMode,
    banner,
    profile: group,
    itinerary,
    metrics: built.metrics,
    audit: built.audit,
    warnings: [...warnings, ...built.warnings],
    unresolved,
    trace,
    stats,
    session,
  };
}

function roundRobin(lists: string[][], cap: number): string[] {
  const out: string[] = [];
  for (let i = 0; out.length < cap; i++) {
    let any = false;
    for (const l of lists) {
      if (i < l.length) {
        any = true;
        if (!out.includes(l[i]) && out.length < cap) out.push(l[i]);
      }
    }
    if (!any) break;
  }
  return out;
}

function mergeLists(a: QlooEntity[], b: QlooEntity[]): QlooEntity[] {
  const seen = new Set(a.map((e) => e.id));
  return [...a, ...b.filter((e) => !seen.has(e.id))];
}

function diffStats(a: ProviderStats, b: ProviderStats): ProviderStats {
  return {
    mode: b.mode,
    calls: b.calls - a.calls,
    cacheHits: b.cacheHits - a.cacheHits,
    retries: b.retries - a.retries,
    rateLimited: b.rateLimited - a.rateLimited,
    failures: b.failures - a.failures,
    staleServed: b.staleServed - a.staleServed,
    fallbacks: b.fallbacks - a.fallbacks,
  };
}
