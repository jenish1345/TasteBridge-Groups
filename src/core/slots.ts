// Itinerary slots and local classification of Qloo place entities into slots.

import type { QlooEntity, QlooTag, SlotId } from '../types.js';
import { nameSimilarity, normName } from '../qloo/similarity.js';
import { tagText } from './taxonomy.js';

export const SLOT_ORDER: SlotId[] = ['activity', 'food', 'drink', 'winddown'];

export const SLOT_META: Record<SlotId, { label: string; blurb: string; terms: string[]; startOffsetMin: number }> = {
  activity: {
    label: 'Activity',
    blurb: 'The main thing you do together',
    terms: ['live music', 'museum', 'art gallery', 'arcade', 'park', 'cinema', 'movie theater', 'comedy club'],
    startOffsetMin: 0,
  },
  food: { label: 'Food', blurb: 'Where you eat', terms: ['restaurant'], startOffsetMin: 120 },
  drink: {
    label: 'Drink / dessert',
    blurb: 'Something to sip or share',
    terms: ['cocktail bar', 'craft beer', 'dessert', 'tea house', 'coffee'],
    startOffsetMin: 210,
  },
  winddown: {
    label: 'Wind-down',
    blurb: 'An easy way to end the night',
    terms: ['rooftop', 'jazz', 'waterfront', 'garden', 'bookstore'],
    startOffsetMin: 300,
  },
};

const FOOD = /restaurant|ramen|sushi|pizz|taco|\bbbq\b|barbecue|grill|bistro|noodle|dim sum|hot pot|steakhouse|trattoria|diner|eatery|korean|thai|indian|italian|japanese|mexican|chinese|vietnamese|ethiopian|mediterranean|burger|seafood|vegan|food truck|kitchen|omakase|fine dining|brunch/;
// "Strong" drink identity. A plain "bar" tag is too weak on its own: live restaurants routinely carry one.
const DRINK_STRONG = /cocktail|brewery|taproom|craft beer|wine bar|\bpub\b|dessert|ice cream|gelato|bakery|\bcafe\b|coffee|boba|speakeasy|tea house|distillery|\bbar$|night ?club|lounge|doughnut|donut/;
const DRINK_WEAK = /\bbar\b/;
const ACTIVITY = /museum|gallery|arcade|bowling|cinema|movie theat|theat|comedy|live music|music venue|music hall|concert|escape room|karaoke|climbing|\bpark\b|aquarium|\bzoo\b|science|mini golf|attraction|performing arts/;
const WIND = /tea house|garden|\bpark\b|rooftop|lounge|jazz|stargaz|waterfront|bookstore|book store|\bspa\b|promenade|\bpier\b|skyline views/;
const NON_FOOD_IDENTITY = /museum|gallery|book ?store|\bpark\b|garden|theat|music venue|comedy|arcade|bowling|cinema/;
const NOT_A_VENUE = /grocery|supermarket|pharmacy|convenience store|department store|hardware|gas station|health food store|\bfood store/;

/**
 * Descriptive text we classify from. Live entities carry ~40 tags, most of them descriptive ("event venue", "garden
 * seating", "lounge bar") — reading all of them makes every restaurant look like every kind of stop. So we read only the
 * category-type families plus the name, and the `setting` family (rooftop/waterfront) for the wind-down check.
 */
function classifyText(e: QlooEntity): { core: string; setting: string } {
  const core = [e.name, ...e.tags.filter((t) => /^urn:tag:(genre|category|cuisine|dining|offerings|specialty_dish)/.test(t.id)).map((t) => t.name)].join(' ').toLowerCase();
  const setting = e.tags.filter((t) => /^urn:tag:setting/.test(t.id)).map((t) => t.name).join(' ').toLowerCase();
  return { core, setting };
}

/** Which itinerary slots can this place fill? (A place may fit more than one.) */
export function slotsOf(e: QlooEntity): SlotId[] {
  const { core, setting } = classifyText(e);
  if (NOT_A_VENUE.test(core)) return [];
  const restaurantTag = e.tags.some((t) => /^urn:tag:(genre|category):place:restaurant/.test(t.id) || /restaurant/i.test(t.name));
  const food = restaurantTag || FOOD.test(core);
  const strongDrink = DRINK_STRONG.test(core) || e.tags.some((t) => /^urn:tag:(genre|category):place:(bar|cocktail|pub|brewery|night_?club|coffee|cafe|dessert)/.test(t.id));
  const foodPrimary = food && !NON_FOOD_IDENTITY.test(core);
  const out: SlotId[] = [];
  if (food) out.push('food');
  // a restaurant with a bar tag stays a restaurant; only an explicit drink identity (or no food identity) makes it a drink stop
  if (strongDrink || (!food && DRINK_WEAK.test(core))) out.push('drink');
  if (!foodPrimary) {
    if (ACTIVITY.test(core)) out.push('activity');
    if (WIND.test(core) || WIND.test(setting)) out.push('winddown');
  }
  return out;
}

/**
 * Choose the Qloo tag that best represents a venue term. Qloo's tag search mixes media/music genres and unrelated
 * attributes into the results ("arcade" → genre:media:arcade, "park" → genre:media:dark), so we only accept place-relevant
 * tag families, prefer genre/category place tags, and require a decent name match.
 */
export function pickPlaceTag(term: string, tags: QlooTag[]): QlooTag | undefined {
  const bad = /:media:|:music:|streaming_service|:hotel:|nearby_attraction|neighborhood_characteristic|visit_intent|time_of_day/;
  const rank = (t: QlooTag) => (/^urn:tag:genre:place:(?!restaurant:)/.test(t.id) ? 0 : /^urn:tag:category:place/.test(t.id) ? 1 : /^urn:tag:genre:place:restaurant/.test(t.id) ? 2 : 3);
  return tags
    .filter((t) => !bad.test(t.id) && nameSimilarity(term, t.name) >= 0.6)
    .sort((a, b) => rank(a) - rank(b) || nameSimilarity(term, b.name) - nameSimilarity(term, a.name))[0];
}

/**
 * Qloo's locality query is fuzzy: an unknown place can come back as some unrelated town. Reject venues whose own
 * geocode/address clearly isn't in the requested city. Venues with no location info are kept.
 */
export function inCity(e: QlooEntity, city: string): boolean {
  if (e.source !== 'qloo-live') return true; // fixtures are already filtered by the sample provider
  const want = normName(city.split(',')[0]);
  if (!want) return true;
  // Qloo's geocode.city is "New York" for every NYC borough, but "Tarrytown"/"Hempstead" for nearby suburbs whose
  // *metro* is still "New York City" — so trust city (then address/neighborhood), never metro.
  const have = [e.city, e.neighborhood, e.address].filter((x): x is string => !!x).map(normName);
  if (!have.length) return true;
  return have.some((h) => h.includes(want) || (h.length >= 4 && want.includes(h)) || nameSimilarity(want, h) >= 0.8);
}

/** Where did Qloo actually put us? Used to warn when a fuzzy locality match landed somewhere unexpected. */
export function placeMismatch(es: QlooEntity[], city: string): string | undefined {
  const live = es.filter((e) => e.source === 'qloo-live' && e.city);
  if (!live.length) return undefined;
  const want = normName(city.split(',')[0]);
  const count = new Map<string, { n: number; country?: string }>();
  for (const e of live) { const k = e.city!; count.set(k, { n: (count.get(k)?.n ?? 0) + 1, country: e.country }); }
  const [top, info] = [...count.entries()].sort((a, b) => b[1].n - a[1].n)[0];
  const h = normName(top);
  if (h.includes(want) || want.includes(h) || nameSimilarity(want, h) >= 0.8) return undefined;
  return `Qloo placed "${city}" in ${top}${info.country ? `, ${info.country}` : ''} — if that's not what you meant, check the city spelling.`;
}
