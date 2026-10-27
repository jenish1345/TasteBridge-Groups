import { describe, expect, it } from 'vitest';
import { evalGroup, independentBreaches, randomGroup, summarize } from '../src/eval.js';

describe('property checks over random groups (sample data)', () => {
  it('holds the product guarantees across 25 random groups of 2–8 people', async () => {
    const reports = [];
    for (let seed = 1; seed <= 25; seed++) reports.push(await evalGroup(seed));
    const s = summarize(reports);
    expect(s.hardRuleViolations).toBe(0); // never a hard no / key-guest veto / over budget when an alternative existed
    expect(s.everyoneCovered).toBeGreaterThanOrEqual(0.95); // nobody left with neither a win nor a closest fit
    expect(s.poorFitsOurs).toBeLessThanOrEqual(s.poorFitsNaive); // fewer people left badly served than a naive ranker
    expect(s.naiveRankerBrokeAHardRule).toBeGreaterThan(0); // and the naive ranker really does break rules, so the check is meaningful
  });

  it('random groups are deterministic per seed and respect size bounds', () => {
    expect(JSON.stringify(randomGroup(7))).toBe(JSON.stringify(randomGroup(7)));
    for (let s = 1; s < 40; s++) { const n = randomGroup(s).people.length; expect(n).toBeGreaterThanOrEqual(2); expect(n).toBeLessThanOrEqual(8); }
  });
});

describe('the independent rule checker actually catches breaches', () => {
  const venue = (tags: string[], priceLevel = 2) => ({ id: 'v', name: 'Test Venue', type: 'urn:entity:place', priceLevel, tags: tags.map((t) => ({ id: `urn:tag:genre:place:${t.toLowerCase()}`, name: t })), source: 'sample' as const });
  const req = (over: object = {}) => ({ people: [{ id: 'a', name: 'Ana', anchors: [], avoid: ['karaoke'], isKey: false, ...over }], constraints: { city: 'x', budget: 2 } }) as any;
  it('flags a hard no, a budget breach and a key-guest veto, and passes a clean venue', () => {
    expect(independentBreaches(venue(['Karaoke', 'Bar']), req(), {}).join()).toMatch(/hard no/);
    expect(independentBreaches(venue(['Cafe'], 4), req(), {}).join()).toMatch(/over budget/);
    expect(independentBreaches(venue(['Nightclub', 'Loud']), req({ isKey: true }), { a: { volume: -0.8 } }).join()).toMatch(/key guest/);
    expect(independentBreaches(venue(['Cafe', 'Quiet']), req(), {})).toEqual([]);
  });
});
