import { describe, expect, it } from 'vitest';
import { detectConflicts } from '../src/core/conflicts.js';
import { buildGroupProfile, buildPersonProfile } from '../src/core/profile.js';
import { axisSignal, matchesAvoid, vibeToAxisNudge } from '../src/core/taxonomy.js';
import { resolveAnchor } from '../src/qloo/resolve.js';
import { SampleQlooProvider } from '../src/qloo/sample.js';
import type { Anchor, PersonProfile } from '../src/types.js';

const qloo = new SampleQlooProvider();
async function profile(id: string, name: string, anchors: Anchor[]): Promise<PersonProfile> {
  return buildPersonProfile({ id, name, anchors }, await Promise.all(anchors.map((a) => resolveAnchor(a, { qloo }))));
}
const A = (text: string, kind: Anchor['kind'] = 'auto'): Anchor => ({ text, kind });

describe('conflict detection', () => {
  it('detects loud vs quiet from real Qloo-style tags', async () => {
    const metal = await profile('m', 'Maya', [A('Metallica', 'artist'), A('Mad Max: Fury Road', 'movie')]);
    const quiet = await profile('d', 'Dan', [A('Bon Iver', 'artist'), A('Stardew Valley', 'videogame')]);
    const c = detectConflicts([metal, quiet]).find((x) => x.axis === 'volume')!;
    expect(c).toBeDefined();
    expect(c.sideA).toEqual(['m']);
    expect(c.sideB).toEqual(['d']);
    expect(['medium', 'high']).toContain(c.level);
    expect(c.explanation).toMatch(/Maya leans loud; Dan leans quiet/);
  });

  it('detects nightlife vs family-friendly and expensive vs budget', async () => {
    const night = await profile('n', 'Nia', [A('nightlife', 'vibe'), A('Dua Lipa', 'artist')]);
    const kids = await profile('k', 'Kai', [A('Bluey', 'tv_show'), A('LEGO', 'brand')]);
    const lux = await profile('l', 'Lux', [A('Gucci', 'brand'), A('Aesop', 'brand')]);
    const cheap = await profile('c', 'Cheap', [A('Goodwill', 'brand'), A('budget', 'vibe')]);
    const axes = detectConflicts([night, kids, lux, cheap]).map((x) => x.axis);
    expect(axes).toContain('scene');
    expect(axes).toContain('price');
  });

  it('reports no conflicts for an aligned group', async () => {
    const a = await profile('a', 'A', [A('Bon Iver', 'artist')]);
    const b = await profile('b', 'B', [A('Nick Drake', 'artist')]);
    expect(detectConflicts([a, b]).filter((c) => c.axis === 'volume')).toHaveLength(0);
  });

  it('computes overlap, shared and unique tags for the group profile', async () => {
    const a = await profile('a', 'A', [A('Bon Iver', 'artist'), A('Stardew Valley', 'videogame')]);
    const b = await profile('b', 'B', [A('Nick Drake', 'artist'), A('Animal Crossing', 'videogame')]);
    const c = await profile('c', 'C', [A('Metallica', 'artist')]);
    const g = buildGroupProfile([a, b, c]);
    expect(g.uniqueTags.find((u) => u.personId === 'c')!.tags.map((t) => t.name)).toContain('Heavy Metal');
    expect(g.sharedTags.some((t) => t.people.length === 2)).toBe(true);
  });

  it('taxonomy basics', () => {
    expect(axisSignal('volume', 'Heavy Metal')).toBeGreaterThan(0.5);
    expect(axisSignal('volume', 'Ambient')).toBeLessThan(-0.5);
    expect(axisSignal('spice', 'Szechuan hot pot')).toBeGreaterThan(0.5);
    expect(vibeToAxisNudge('no loud venues').volume).toBeLessThan(0);
    expect(matchesAvoid('dive bar', 'Free waterfront park')).toBe(false); // literal avoids don't alias to "cheap"
    expect(matchesAvoid('dive bar', 'Midnight Dive Bar')).toBe(true);
  });
});
