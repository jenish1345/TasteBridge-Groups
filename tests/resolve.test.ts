import { describe, expect, it } from 'vitest';
import { deterministicRewrites, resolveAnchor } from '../src/qloo/resolve.js';
import { SampleQlooProvider } from '../src/qloo/sample.js';
import { nameSimilarity } from '../src/qloo/similarity.js';
import type { QlooEntity, QlooProvider } from '../src/types.js';

const sample = new SampleQlooProvider();

describe('entity resolution', () => {
  it('resolves an exact artist to its Qloo entity with id and tags', async () => {
    const r = await resolveAnchor({ text: 'Radiohead', kind: 'artist' }, { qloo: sample });
    expect(r.status).toBe('resolved');
    expect(r.entity?.id).toBe('SAMPLE-RADIOHEAD');
    expect(r.entity?.type).toBe('urn:entity:artist');
    expect(r.entity?.tags.length).toBeGreaterThan(0);
  });

  it('tolerates typos and partial titles', async () => {
    expect((await resolveAnchor({ text: 'radiohed', kind: 'auto' }, { qloo: sample })).entity?.name).toBe('Radiohead');
    expect((await resolveAnchor({ text: 'Mad Max', kind: 'movie' }, { qloo: sample })).entity?.name).toBe('Mad Max: Fury Road');
    expect((await resolveAnchor({ text: 'Harry Potter and the Chamber of Secrets', kind: 'book' }, { qloo: sample })).entity?.name).toBe('Harry Potter');
  });

  it('resolves foods and vibes through the tag endpoint', async () => {
    const food = await resolveAnchor({ text: 'Korean BBQ', kind: 'food' }, { qloo: sample });
    expect(food.status).toBe('resolved');
    expect(food.method).toBe('tag');
    expect(food.tag?.id).toContain('korean_bbq');
  });

  it('falls back to local vibe interpretation when no tag exists', async () => {
    const r = await resolveAnchor({ text: 'loud live shows', kind: 'vibe' }, { qloo: sample });
    expect(r.status).toBe('resolved');
    expect(r.method).toBe('vibe-keyword');
  });

  it('reports missing entities as unresolved instead of guessing', async () => {
    const r = await resolveAnchor({ text: 'zzzxqv qwerty', kind: 'artist' }, { qloo: sample });
    expect(r.status).toBe('unresolved');
    expect(r.entity).toBeUndefined();
  });

  it('retries without the type filter when a typed search finds nothing (reflection)', async () => {
    const calls: { types?: string[] }[] = [];
    const ent: QlooEntity = { id: 'X1', name: 'Parasite', type: 'urn:entity:movie', tags: [], source: 'sample' };
    const fake: QlooProvider = {
      mode: 'sample',
      searchEntity: async (_q, o) => { calls.push({ types: o?.types }); return o?.types ? [] : [ent]; },
      searchTags: async () => [],
      insights: async () => ({ entities: [], warnings: [] }),
      stats: () => ({ mode: 'sample', calls: 0, cacheHits: 0, retries: 0, rateLimited: 0, failures: 0, staleServed: 0, fallbacks: 0 }),
    };
    const events: string[] = [];
    const r = await resolveAnchor({ text: 'Parasite', kind: 'artist' }, { qloo: fake, trace: (p) => events.push(p) });
    expect(r.status).toBe('resolved');
    expect(r.method).toBe('search-broadened');
    expect(calls[0].types).toBeDefined();
    expect(calls[1].types).toBeUndefined();
    expect(events).toContain('reflect');
  });

  it('rewrites noisy input deterministically', () => {
    expect(deterministicRewrites('Parasite (2019 film)')).toContain('Parasite');
    expect(deterministicRewrites('Blinding Lights by The Weeknd')).toContain('The Weeknd');
    expect(deterministicRewrites('Amélie')).toContain('Amelie');
  });

  it('name similarity is sane', () => {
    expect(nameSimilarity('the beatles', 'Beatles')).toBe(1);
    expect(nameSimilarity('Dune', 'Barbie')).toBeLessThan(0.3);
  });
});
