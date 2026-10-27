import { describe, expect, it } from 'vitest';
import { buildPersonProfile } from '../src/core/profile.js';
import { computeBreakdown, conflictLoad, evaluate, markWins, scoreSlot, softCover, WEIGHTS, axisFit } from '../src/core/scoring.js';
import { emptyVector } from '../src/core/taxonomy.js';
import type { AxisVector, Candidate, Person, PersonProfile, QlooEntity } from '../src/types.js';

const vec = (o: Partial<AxisVector>): AxisVector => ({ ...emptyVector(), ...o });
const person = (id: string, o: Partial<Person> = {}, pref: Partial<AxisVector> = {}): PersonProfile => ({ ...buildPersonProfile({ id, name: id, anchors: [], ...o }, []), pref: vec(pref) });
const place = (id: string, tags: string[], priceLevel = 2): QlooEntity => ({ id, name: id, type: 'urn:entity:place', tags: tags.map((t) => ({ id: `urn:tag:${t}`, name: t })), priceLevel, source: 'sample' });
const cand = (e: QlooEntity, a: Record<string, number>, pos: Partial<AxisVector> = {}): Candidate => ({ entity: e, slot: 'food', a, qloo: {}, pos: vec(pos) });

describe('group scoring', () => {
  it('uses the documented weights: 0.5 coverage + 0.3 min affinity + 0.2 conflict-free', () => {
    expect(WEIGHTS).toEqual({ coverage: 0.5, minAffinity: 0.3, conflict: 0.2 });
    // a = 0.8, 0.5, 0.65 ; no conflict
    const b = computeBreakdown({ x: 0.8, y: 0.5, z: 0.65 }, { x: 0, y: 0, z: 0 });
    const cov = (1 + 0.5 + 1) / 3; // softCover(.8)=1, softCover(.5)=.5, softCover(.65)=1
    expect(b.coverage).toBeCloseTo(cov, 3);
    expect(b.minAffinity).toBe(0.5);
    expect(b.conflictPenalty).toBe(1);
    expect(b.score).toBeCloseTo(0.5 * cov + 0.3 * 0.5 + 0.2 * 1, 3);
    expect(b.weakestPersonId).toBe('y');
  });

  it('soft coverage ramps from 0.35 to 0.65', () => {
    expect(softCover(0.2)).toBe(0);
    expect(softCover(0.5)).toBeCloseTo(0.5);
    expect(softCover(0.9)).toBe(1);
  });

  it('penalises conflict and rewards the fairer candidate over a high-average one', () => {
    // A: one person is left out entirely.  B: everyone is fine.
    const A = computeBreakdown({ p: 0.95, q: 0.95, r: 0.2 }, { p: 0, q: 0, r: 0.6 });
    const B = computeBreakdown({ p: 0.7, q: 0.7, r: 0.7 }, { p: 0, q: 0, r: 0 });
    expect(B.score).toBeGreaterThan(A.score);
    expect(A.weakestPersonId).toBe('r');
  });

  it('conflict load is the strongest opposition on any axis', () => {
    expect(conflictLoad(vec({ volume: -0.8 }), vec({ volume: 0.9 })).load).toBeCloseTo(0.72);
    expect(conflictLoad(vec({ volume: 0.8 }), vec({ volume: 0.9 })).load).toBe(0);
    expect(axisFit(vec({}), vec({ volume: 1 }))).toBe(0.5); // no opinion => neutral
  });

  it('vetoes a venue that matches an explicit hard no', () => {
    const p = person('a', { avoid: ['karaoke'] });
    const r = evaluate(cand(place('Bar', ['Karaoke', 'Bar']), { a: 0.9 }), { profiles: [p], constraints: { city: 'x' } });
    expect(r.vetoes[0]).toMatchObject({ kind: 'avoid', personId: 'a' });
  });

  it('only vetoes on strong axis dislikes for KEY people', () => {
    const loud = cand(place('Club', ['nightclub']), { a: 0.5 }, { volume: 0.8 });
    const key = person('a', { isKey: true }, { volume: -0.7 });
    const non = person('a', { isKey: false }, { volume: -0.7 });
    expect(evaluate(loud, { profiles: [key], constraints: { city: 'x' } }).vetoes.map((v) => v.kind)).toContain('axis');
    expect(evaluate(loud, { profiles: [non], constraints: { city: 'x' } }).vetoes).toHaveLength(0);
  });

  it('hard-rejects over-budget venues and flags unverified dietary needs', () => {
    const p = person('a');
    const pricey = evaluate(cand(place('Fancy', ['french'], 4), { a: 0.9 }), { profiles: [p], constraints: { city: 'x', budget: 2 } });
    expect(pricey.hardRejected).toMatch(/over budget/);
    const veg = evaluate(cand(place('Diner', ['diner']), { a: 0.9 }), { profiles: [p], constraints: { city: 'x', dietary: ['vegan'] } });
    expect(veg.unverified).toEqual(['vegan']);
    const ok = evaluate(cand(place('Green', ['Vegan Options']), { a: 0.9 }), { profiles: [p], constraints: { city: 'x', dietary: ['vegan'] } });
    expect(ok.verified).toEqual(['vegan']);
  });

  it('marks personal wins only among viable candidates and only above 0.65', () => {
    const profiles = [person('a'), person('b')];
    const cs = scoreSlot(
      [cand(place('P1', ['x']), { a: 0.9, b: 0.4 }), cand(place('P2', ['y']), { a: 0.5, b: 0.8 }), cand(place('P3', ['z']), { a: 0.6, b: 0.6 })],
      { profiles, constraints: { city: 'x' } },
    );
    const wins = Object.fromEntries(cs.map((c) => [c.entity.id, c.winFor]));
    expect(wins.P1).toContain('a');
    expect(wins.P2).toContain('b');
    expect(wins.P3).toEqual([]);
    markWins(cs);
  });
});
