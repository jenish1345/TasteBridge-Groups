// Small shared helpers. All user-provided text goes through esc() before it touches innerHTML.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const pct = (n) => `${Math.round((n ?? 0) * 100)}%`;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One ink per person. Each also gets its own hatch angle so colour is never the only signal.
export const COLORS = ['#ff8fa3', '#6fe0b4', '#ffb347', '#e9a6ff', '#c8f060', '#7fd8ff', '#ffd1a1', '#b6b9ff'];
export const HATCH = [45, 135, 0, 90, 30, 150, 60, 120];

export const AXIS = {
  volume: { label: 'Loud vs quiet', pos: 'loud', neg: 'quiet', short: 'loud / quiet' },
  spice: { label: 'Spicy vs mild', pos: 'spicy', neg: 'mild', short: 'spicy / mild' },
  scene: { label: 'Nightlife vs family-friendly', pos: 'nightlife', neg: 'family-friendly', short: 'nightlife / family' },
  novelty: { label: 'Experimental vs mainstream', pos: 'experimental', neg: 'mainstream', short: 'experimental / mainstream' },
  price: { label: 'Expensive vs budget', pos: 'upscale', neg: 'budget', short: 'expensive / budget' },
};
export const KINDS = [['auto', 'Any'], ['artist', 'Artist'], ['movie', 'Film'], ['tv_show', 'Show'], ['book', 'Book'], ['videogame', 'Game'], ['brand', 'Brand'], ['food', 'Food'], ['place', 'Place'], ['vibe', 'Vibe']];
export const KIND_LABEL = Object.fromEntries(KINDS);
export const SLOT_LABEL = { activity: 'Activity', food: 'Dinner', drink: 'Drinks and dessert', winddown: 'Wind-down', encore: 'Encore' };
export const SUGGEST = ['Radiohead', 'Parasite', 'hot pot', 'quiet', 'Stardew Valley', 'Taylor Swift', 'tacos', 'nightlife', 'Bluey', 'Metallica', 'Mitski', 'budget'];

export const initial = (name) => (String(name || '?').trim().charAt(0) || '?').toUpperCase();
