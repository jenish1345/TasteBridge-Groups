import { describe, expect, it } from 'vitest';
import { evalGroup, randomGroup, summarize } from '../src/eval.js';

describe('property checks over random groups (sample data)', () => {
  it('holds the product guarantees across 25 random groups of 2–8 people', async () => {
    const reports = [];
    for (let seed = 1; seed <= 25; seed++) reports.push(await evalGroup(seed));
    const s = summarize(reports);
    expect(s.hardRuleViolations).toBe(0); // never a hard no / key-guest veto / over budget when an alternative existed
    expect(s.everyoneGotAWin).toBeGreaterThanOrEqual(0.95); // personal-win guarantee
    expect(s.poorFitsOurs).toBeLessThanOrEqual(s.poorFitsNaive); // fewer people left badly served than a naive ranker
    expect(s.naiveRankerBrokeAHardRule).toBeGreaterThan(0); // and the naive ranker really does break rules, so the check is meaningful
  });

  it('random groups are deterministic per seed and respect size bounds', () => {
    expect(JSON.stringify(randomGroup(7))).toBe(JSON.stringify(randomGroup(7)));
    for (let s = 1; s < 40; s++) { const n = randomGroup(s).people.length; expect(n).toBeGreaterThanOrEqual(2); expect(n).toBeLessThanOrEqual(8); }
  });
});
