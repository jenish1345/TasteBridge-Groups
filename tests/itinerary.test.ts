import { describe, expect, it } from 'vitest';
import { runGroupAgent } from '../src/agent/agent.js';
import { baselinePlan } from '../src/agent/baseline.js';
import { comparePlans } from '../src/agent/compare.js';
import { rebalance } from '../src/core/plan.js';
import { parseRequest, UserError } from '../src/core/request.js';
import { SLOT_ORDER, slotsOf } from '../src/core/slots.js';
import { DEMO_REQUEST } from '../src/demo.js';
import { SAMPLE_CITIES, SAMPLE_PLACES } from '../src/qloo/fixtures.js';
import { SampleQlooProvider } from '../src/qloo/sample.js';

const qloo = () => new SampleQlooProvider();
const run = (req = DEMO_REQUEST) => runGroupAgent(parseRequest(req), { qloo: qloo(), llm: null });

describe('itinerary generation (agent end-to-end, sample data)', () => {
  it('builds a 4-stop multi-stop plan with all four explanation fields', async () => {
    const r = await run();
    expect(r.dataMode).toBe('sample');
    expect(r.banner).toMatch(/SAMPLE DATA/);
    expect(r.itinerary.map((s) => s.slot)).toEqual(expect.arrayContaining(['activity', 'food', 'drink', 'winddown']));
    for (const s of r.itinerary) {
      expect(s.why.length).toBeGreaterThan(20); // 1. why it fits
      expect(s.serves.length).toBeGreaterThan(0); // 2. who it serves
      expect(Array.isArray(s.conflicts)).toBe(true); // 3. conflicts + resolution
      expect(s.evidence.qlooEntityIds[0]).toBeTruthy(); // 4. Qloo ids / tags / affinities
      expect(s.evidence.candidateTags.length).toBeGreaterThan(0);
      expect(s.evidence.affinitySignals).toHaveLength(DEMO_REQUEST.people.length);
    }
  });

  it('gives every person at least one personal win', async () => {
    const r = await run();
    expect(r.metrics.peopleWithoutWin).toEqual([]); // nobody is left with neither a win nor a closest fit
    for (const [id, wins] of Object.entries(r.metrics.winsByPerson)) expect(wins.length + r.metrics.closeByPerson[id].length).toBeGreaterThan(0);
  });

  it('never uses the same venue twice and respects budget + hard no\'s', async () => {
    const r = await run();
    const ids = r.itinerary.map((s) => s.place.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of r.itinerary) {
      expect(s.place.priceLevel ?? 1).toBeLessThanOrEqual(3);
      const blob = `${s.place.name} ${s.evidence.candidateTags.map((t) => t.name).join(' ')}`.toLowerCase();
      expect(blob).not.toContain('karaoke'); // Maya's hard no
      expect(blob).not.toContain('dive bar'); // Tom's hard no
    }
  });

  it('never picks something the key guest strongly dislikes when an alternative exists', async () => {
    const r = await run(); // Dan (key, quiet) — no stop should be strongly loud for him
    for (const s of r.itinerary) {
      expect(s.warnings.filter((w) => w.startsWith('Relaxed'))).toEqual([]);
      expect(s.affinities.dan).toBeGreaterThan(0.4);
    }
  });

  it('verifies dietary needs from tags where possible and flags what it cannot', async () => {
    const r = await run({ ...DEMO_REQUEST, constraints: { ...DEMO_REQUEST.constraints, dietary: ['vegan'] } });
    const food = r.itinerary.find((s) => s.slot === 'food')!;
    expect(food.evidence.candidateTags.map((t) => t.name.toLowerCase()).join()).toContain('vegan');
  });

  it('honors group vibe constraints ("no loud venues")', async () => {
    const r = await run({ ...DEMO_REQUEST, constraints: { ...DEMO_REQUEST.constraints, vibes: ['no loud venues'] } });
    for (const s of r.itinerary) expect(s.evidence.candidateTags.map((t) => t.name.toLowerCase())).not.toContain('loud');
  });

  it('records a reflective agent trace (plan, act, observe, reflect, synthesize)', async () => {
    const r = await run();
    const phases = new Set(r.trace.map((t) => t.phase));
    for (const p of ['plan', 'act', 'observe', 'reflect', 'synthesize']) expect(phases.has(p as any)).toBe(true);
  });

  it('broadens the query when a neighborhood has too few venues (reflection + retry)', async () => {
    const req = { ...DEMO_REQUEST, constraints: { ...DEMO_REQUEST.constraints, neighborhood: 'Harlem' } };
    const r = await run(req);
    expect(r.trace.some((t) => t.phase === 'retry' || /broaden/i.test(t.message))).toBe(true);
    expect(r.itinerary.length).toBeGreaterThanOrEqual(3);
  });

  it('degrades gracefully for a city the sample fixtures do not cover', async () => {
    const r = await run({ ...DEMO_REQUEST, constraints: { ...DEMO_REQUEST.constraints, city: 'Reykjavik' } });
    expect(r.itinerary.length).toBeGreaterThan(0);
    expect(r.trace.some((t) => /fixtures only cover/i.test(t.message))).toBe(true);
  });

  it('copes with unresolvable anchors and surfaces them', async () => {
    const req = structuredClone(DEMO_REQUEST);
    req.people[0].anchors.push({ text: 'qzxv unknownband', kind: 'artist' });
    const r = await run(req);
    expect(r.unresolved.map((u) => u.anchor)).toContain('qzxv unknownband');
    expect(r.warnings.join(' ')).toMatch(/Could not resolve/);
  });

  it('supports 3..8 people and the 2-person case', async () => {
    const three = { ...DEMO_REQUEST, people: DEMO_REQUEST.people.slice(0, 3) };
    expect((await run(three)).metrics.peopleWithoutWin).toEqual([]);
    const two = { ...DEMO_REQUEST, people: DEMO_REQUEST.people.slice(0, 2) };
    expect((await run(two)).itinerary.length).toBeGreaterThan(0);
    const eight = { ...DEMO_REQUEST, people: [...DEMO_REQUEST.people, ...DEMO_REQUEST.people.slice(0, 3).map((p, i) => ({ ...p, id: `x${i}`, name: `${p.name}2` }))] };
    expect((await run(eight)).profile.people).toHaveLength(8);
  });

  it('validates requests', () => {
    expect(() => parseRequest({ people: [{ name: 'solo', anchors: ['x'] }], constraints: { city: 'x' } })).toThrow(UserError);
    expect(() => parseRequest({ people: Array.from({ length: 9 }, (_, i) => ({ name: `p${i}`, anchors: ['x'] })), constraints: { city: 'x' } })).toThrow(/At most 8/);
  });
});

describe('rebalance', () => {
  it('swaps exactly one stop, keeps every personal win and stays within the fairness tolerance', async () => {
    const r = await run();
    const before = r.itinerary.map((s) => s.place.id);
    const rb = rebalance(r.session);
    const after = rb.assembled.itinerary.map((s) => s.place.id);
    expect(after.filter((id, i) => id !== before[i])).toHaveLength(1);
    expect(rb.assembled.metrics.peopleWithoutWin).toEqual([]);
    // within tolerance, unless the diff explicitly says no closer option existed
    if (!/dips slightly/.test(rb.diff.note)) expect(rb.diff.after.meanScore).toBeGreaterThanOrEqual(rb.diff.before.meanScore - 0.031);
  });

  it('cycles to a different alternative on repeated rebalances of the same stop', async () => {
    const r = await run();
    const a = rebalance(r.session, 'food');
    const b = rebalance(a.session, 'food');
    const names = [r, a.assembled, b.assembled].map((x) => ('itinerary' in x ? x.itinerary : []).find((s) => s.slot === 'food')!.place.id);
    expect(new Set(names).size).toBe(3);
  });
});

describe('fixtures + comparison', () => {
  it('every sample city can fill every slot', () => {
    for (const city of SAMPLE_CITIES) {
      for (const slot of SLOT_ORDER) {
        expect(SAMPLE_PLACES.filter((p) => (p as any).city === city && slotsOf(p).includes(slot)).length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('baseline is clearly labelled and carries no Qloo evidence; scorecard favours Qloo', async () => {
    const req = parseRequest(DEMO_REQUEST);
    const base = await baselinePlan(req, undefined);
    expect(base.source).toBe('template');
    expect(base.label).toMatch(/no Qloo/);
    const c = await comparePlans(req, { qloo: qloo(), llm: null });
    const grounded = c.scorecard.find((s) => /Venues/.test(s.label))!;
    expect(grounded.withoutQloo.startsWith('0/')).toBe(true);
    expect(c.scorecard.filter((s) => s.winner === 'qloo').length).toBeGreaterThanOrEqual(4);
  });
});

describe('location guard (live responses)', () => {
  it('keeps every NYC borough but rejects suburbs even when their metro says New York City', async () => {
    const { inCity } = await import('../src/core/slots.js');
    const mk = (city: string, metro: string | undefined, address: string) => ({ id: 'x', name: 'x', type: 'urn:entity:place', tags: [], city, metro, address, source: 'qloo-live' as const });
    expect(inCity(mk('New York', 'New York City', '1 Bedford Ave Brooklyn, NY'), 'New York')).toBe(true);
    expect(inCity(mk('Tarrytown', 'New York City', '13 Main St Tarrytown, NY 10591'), 'New York')).toBe(false);
    expect(inCity(mk('Hempstead', 'New York City', 'Charles Lindbergh Blvd Hempstead, NY'), 'New York')).toBe(false);
    expect(inCity(mk('Inner London - West', '', '1 Sky Garden Walk London'), 'London')).toBe(true);
    expect(inCity(mk('Austin', '', '1 Congress Ave Austin, TX'), 'Austin, TX')).toBe(true);
  });
});

describe('slot classification on live-shaped entities', () => {
  const t = (id: string, name: string) => ({ id, name });
  const e = (name: string, tags: { id: string; name: string }[]) => ({ id: name, name, type: 'urn:entity:place', tags, source: 'qloo-live' as const });
  const noise = [t('urn:tag:amenity:qloo:event_venue', 'Event venue'), t('urn:tag:setting:qloo:garden', 'Garden'), t('urn:tag:ambience:qloo:lounge', 'Lounge bar')];

  it('a restaurant with descriptive bar/lounge/garden tags stays a food stop only', () => {
    const r = e('La Condesa', [t('urn:tag:genre:place:restaurant:mexican', 'Mexican restaurant'), t('urn:tag:amenity:qloo:full_bar', 'Full bar'), ...noise]);
    expect(slotsOf(r)).toEqual(['food']);
  });
  it('real venues still classify: music venue → activity, cocktail bar → drink, book store → wind-down', () => {
    expect(slotsOf(e('Emo’s', [t('urn:tag:genre:place:live_music_venue', 'Live music venue')]))).toContain('activity');
    expect(slotsOf(e('Velvet', [t('urn:tag:genre:place:cocktail_bar', 'Cocktail bar')]))).toContain('drink');
    expect(slotsOf(e('Strand', [t('urn:tag:genre:place:book_store', 'Book store')]))).toContain('winddown');
  });
  it('drops non-venues such as grocery stores', () => {
    expect(slotsOf(e('Whole Foods Market', [t('urn:tag:genre:place:health_food_store', 'Health food store'), t('urn:tag:genre:place:grocery', 'Grocery store')]))).toEqual([]);
  });
});

describe('classification regressions from live data', () => {
  const t = (id: string, name: string) => ({ id, name });
  const e = (name: string, tags: { id: string; name: string }[]) => ({ id: name, name, type: 'urn:entity:place', tags, source: 'qloo-live' as const });
  it('a Korean BBQ restaurant with cocktail/liquor offerings is a restaurant, not a drinks stop', () => {
    const r = e('Jongro BBQ', [t('urn:tag:genre:place:restaurant:korean', 'Korean restaurant'), t('urn:tag:offerings:place:cocktails', 'Cocktails'), t('urn:tag:offerings:place:hard_liquor', 'Hard liquor'), t('urn:tag:amenity:qloo:alcohol', 'Alcohol')]);
    expect(slotsOf(r)).toEqual(['food']);
  });
  it('a dinner-theater restaurant is not an activity', () => {
    const r = e('Joanne Trattoria', [t('urn:tag:genre:place:restaurant:italian', 'Italian restaurant'), t('urn:tag:category:place:dinner_theater', 'Dinner theater')]);
    expect(slotsOf(r)).toEqual(['food']);
  });
  it('a restaurant that is genuinely also a cocktail bar can still be a drinks stop', () => {
    const r = e('Midnight Cowboy', [t('urn:tag:genre:place:restaurant', 'Restaurant'), t('urn:tag:category:place:cocktail_bar', 'Cocktail bar')]);
    expect(slotsOf(r)).toEqual(expect.arrayContaining(['food', 'drink']));
  });
});

describe('personal wins are exclusive', () => {
  it('nobody "wins" a stop everyone likes equally', async () => {
    const { markWins } = await import('../src/core/scoring.js');
    const mk = (a: Record<string, number>) => ({ entity: { id: 'x', name: 'x', type: 'urn:entity:place', tags: [], source: 'sample' as const }, slot: 'food' as const, a, qloo: {}, pos: { volume: 0, spice: 0, scene: 0, novelty: 0, price: 0 }, breakdown: {} as any, vetoes: [], verified: [], unverified: [], winFor: [] as string[], closeFor: [] as string[] });
    const everyoneLikesIt = mk({ a: 0.8, b: 0.8, c: 0.8 });
    markWins([everyoneLikesIt]);
    expect(everyoneLikesIt.winFor).toEqual([]); // not exclusive...
    expect(everyoneLikesIt.closeFor.sort()).toEqual(['a', 'b', 'c']); // ...but it is everyone's closest fit
    const aLovesIt = mk({ a: 0.9, b: 0.6, c: 0.6 });
    markWins([aLovesIt]);
    expect(aLovesIt.winFor).toEqual(['a']);
  });
});
