// A ready-made group that exercises every conflict axis. Used by the UI "Load demo group", CLI --demo and tests.

import type { GroupRequest } from './types.js';

export const DEMO_REQUEST: GroupRequest = {
  people: [
    {
      id: 'maya',
      name: 'Maya',
      anchors: [
        { text: 'Metallica', kind: 'artist' },
        { text: 'Mad Max: Fury Road', kind: 'movie' },
        { text: 'Elden Ring', kind: 'videogame' },
        { text: 'Korean BBQ', kind: 'food' },
        { text: 'nightlife', kind: 'vibe' },
        { text: 'loud live shows', kind: 'vibe' },
      ],
      avoid: ['karaoke'],
    },
    {
      id: 'dan',
      name: 'Dan',
      anchors: [
        { text: 'Bon Iver', kind: 'artist' },
        { text: 'Lost in Translation', kind: 'movie' },
        { text: 'Stardew Valley', kind: 'videogame' },
        { text: 'Aesop', kind: 'brand' },
        { text: 'quiet', kind: 'vibe' },
      ],
      isKey: true, // guest of honor
    },
    {
      id: 'priya',
      name: 'Priya',
      anchors: [
        { text: 'Parasite', kind: 'movie' },
        { text: 'Mitski', kind: 'artist' },
        { text: 'Hot Pot', kind: 'food' },
        { text: 'Radiohead', kind: 'artist' },
        { text: 'Everything Everywhere All at Once', kind: 'movie' },
      ],
    },
    {
      id: 'tom',
      name: 'Tom',
      anchors: [
        { text: 'Bluey', kind: 'tv_show' },
        { text: 'LEGO', kind: 'brand' },
        { text: 'Animal Crossing', kind: 'videogame' },
        { text: 'Pizza', kind: 'food' },
        { text: 'Toy Story', kind: 'movie' },
      ],
      avoid: ['dive bar'],
    },
    {
      id: 'sam',
      name: 'Sam',
      anchors: [
        { text: 'Goodwill', kind: 'brand' },
        { text: 'Disco Elysium', kind: 'videogame' },
        { text: 'Tacos', kind: 'food' },
        { text: 'Run the Jewels', kind: 'artist' },
        { text: 'budget', kind: 'vibe' },
      ],
    },
  ],
  constraints: {
    city: 'New York',
    datetime: '2026-11-14T18:00',
    budget: 3,
    dietary: ['vegetarian'],
    accessibility: [],
    vibes: [],
  },
  includeWindDown: true,
};
