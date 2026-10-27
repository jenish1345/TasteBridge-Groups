// Cultural taxonomy: maps Qloo tags / names / free text onto five conflict axes.
// Positive pole = first label, negative pole = second label.

import type { Axis, AxisVector, QlooTag } from '../types.js';

export const AXES: Axis[] = ['volume', 'spice', 'scene', 'novelty', 'price'];

export const AXIS_META: Record<Axis, { label: string; pos: string; neg: string }> = {
  volume: { label: 'Loud vs quiet', pos: 'loud', neg: 'quiet' },
  spice: { label: 'Spicy vs mild', pos: 'spicy', neg: 'mild' },
  scene: { label: 'Nightlife vs family-friendly', pos: 'nightlife', neg: 'family-friendly' },
  novelty: { label: 'Experimental vs mainstream', pos: 'experimental', neg: 'mainstream' },
  price: { label: 'Expensive vs budget', pos: 'upscale', neg: 'budget' },
};

type Rule = [RegExp, number];

const RULES: Record<Axis, { pos: Rule[]; neg: Rule[] }> = {
  volume: {
    pos: [
      [/heavy.?metal|\bmetal\b|thrash|hardcore|\bpunk\b|grunge/, 0.9],
      [/\brave\b|techno|\bedm\b|dubstep|drum.?and.?bass|dance.?club|nightclub|\bclub\b/, 0.85],
      [/hip.?hop|\brap\b|trap|\brock\b|mosh|festival|concert|karaoke|\bdj\b|\bloud\b|party|sports.?bar|arcade|high.?energy/, 0.6],
      [/electronic|house.?music|dance|rave/, 0.5],
    ],
    neg: [
      [/ambient|classical|chamber|lo.?fi|\bquiet\b|\bcalm\b|zen|meditat|\bspa\b|library|reading/, 0.9],
      [/acoustic|folk|singer.?songwriter|indie.?folk|cozy|\btea\b|bookstore|gallery|museum|wine.?bar|slow|serene|intimate|garden/, 0.65],
      [/\bjazz\b|lounge|chill|mellow|soft/, 0.4],
    ],
  },
  spice: {
    pos: [
      [/szechuan|sichuan|\bspicy\b|vindaloo|\bhot.?pot\b|\bcurry\b|kimchi|chili|jerk|cajun|nashville.?hot|ethiopian/, 0.9],
      [/thai|indian|korean|mexican|\btaco|szechwan|peruvian|caribbean|jamaican|biryani/, 0.65],
    ],
    neg: [
      [/\bmild\b|bland|comfort.?food|\bdiner\b|bakery|\bpizza\b|pasta|dessert|ice.?cream|pancake|brunch|\btea\b|sandwich|deli|\bcafe\b|waffle/, 0.5],
      [/\bkids?\b|family/, 0.4],
    ],
  },
  scene: {
    pos: [
      [/nightlife|nightclub|\bclub\b|cocktail|speakeasy|late.?night|\bdive\b|\bbar\b|lounge|\brave\b|party|\bdj\b|karaoke|after.?hours|craft.?beer|taproom/, 0.85],
      [/punk|metal|techno|electronic|hip.?hop|\brap\b/, 0.4],
    ],
    neg: [
      [/family|\bkids?\b|child|toy|playground|bluey|pixar|disney|\blego\b|\bzoo\b|aquarium|puppet|animal.?crossing|mario/, 0.9],
      [/daytime|brunch|bakery|\bcafe\b|\bpark\b|picnic|garden|museum|gallery|bookstore|\btea\b|ice.?cream|dessert|library|cozy|craft/, 0.55],
    ],
  },
  novelty: {
    pos: [
      [/experimental|avant.?garde|art.?house|underground|surreal|noise|post.?rock|psychedelic|obscure|cult|\bniche\b/, 0.9],
      [/\bindie\b|fusion|tasting.?menu|pop.?up|immersive|natural.?wine|izakaya|omakase|alternative|art.?film|a24|boutique|vintage|thrift|zine/, 0.6],
    ],
    neg: [
      [/mainstream|blockbuster|top.?40|\bchain\b|franchise|superhero|sports.?bar|steakhouse|\bdiner\b|\bpop\b(?!-?up|ular)|chart|fast.?food|big.?box/, 0.8],
      [/\bclassic\b|family|popular|crowd.?pleaser|reality.?tv|\bpizza\b/, 0.4],
    ],
  },
  price: {
    pos: [
      [/luxury|fine.?dining|michelin|designer|high.?end|upscale|couture|omakase|champagne|premium|tasting.?menu|rooftop|aesop|gucci|prada|louis.?vuitton|rolex|hermes|celine|chanel|apple/, 0.85],
    ],
    neg: [
      [/budget|cheap|thrift|\bdive\b|food.?truck|street.?food|student|\bdiy\b|affordable|free\b|dollar|value|walmart|ikea|taco.?truck|zine/, 0.75],
    ],
  },
};

/** Score a bag of text for a single axis, returning an array of signed hit weights. */
function hits(axis: Axis, text: string): number[] {
  const t = text.toLowerCase();
  const out: number[] = [];
  const r = RULES[axis];
  for (const [re, w] of r.pos) if (re.test(t)) out.push(w);
  for (const [re, w] of r.neg) if (re.test(t)) out.push(-w);
  return out;
}

/** Signed signal for one text snippet on one axis in [-1,1] (strongest hit wins; opposite hits cancel). */
export function axisSignal(axis: Axis, text: string): number {
  const h = hits(axis, text);
  if (!h.length) return 0;
  const pos = Math.max(0, ...h.filter((x) => x > 0));
  const neg = Math.max(0, ...h.filter((x) => x < 0).map((x) => -x));
  return clamp(pos - neg, -1, 1);
}

export function emptyVector(): AxisVector {
  return { volume: 0, spice: 0, scene: 0, novelty: 0, price: 0 };
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function tagText(t: QlooTag): string {
  return `${t.name} ${t.id.replace(/^urn:tag:/, '').replace(/[:_]/g, ' ')}`;
}

/**
 * Position of a thing (anchor entity, place...) on every axis, from its tags and name.
 * `evidence[a]` counts how many snippets produced a non-zero signal.
 */
export function positionFromTexts(
  texts: string[],
  priceLevel?: number,
): { pos: AxisVector; evidence: Record<Axis, number> } {
  const pos = emptyVector();
  const evidence: Record<Axis, number> = { volume: 0, spice: 0, scene: 0, novelty: 0, price: 0 };
  for (const axis of AXES) {
    const sigs = texts.map((t) => axisSignal(axis, t)).filter((s) => s !== 0);
    evidence[axis] = sigs.length;
    if (sigs.length) {
      // strongest-signal average with one half pseudo-observation of shrinkage toward 0
      const sum = sigs.reduce((a, b) => a + b, 0);
      pos[axis] = clamp(sum / (sigs.length + 0.5), -1, 1);
    }
  }
  if (priceLevel && priceLevel >= 1 && priceLevel <= 4) {
    const pl = clamp((priceLevel - 2.5) / 1.5, -1, 1);
    pos.price = clamp(pos.price * 0.4 + pl * 0.8, -1, 1);
    evidence.price += 1;
  }
  return { pos, evidence };
}

/**
 * A person's preference vector: signals from each resolved anchor, aggregated with a
 * one-pseudo-anchor shrinkage so a single metal anchor reads as a lean, three as a conviction.
 */
export function preferenceFromAnchorSignals(
  perAnchor: AxisVector[],
  weights?: number[],
): { pref: AxisVector; evidence: Record<Axis, number> } {
  const pref = emptyVector();
  const evidence: Record<Axis, number> = { volume: 0, spice: 0, scene: 0, novelty: 0, price: 0 };
  for (const axis of AXES) {
    let sum = 0;
    let n = 0;
    perAnchor.forEach((v, i) => {
      const x = v[axis];
      if (x !== 0) {
        const w = weights?.[i] ?? 1;
        sum += x * w;
        n += w;
      }
    });
    evidence[axis] = Math.round(n);
    // half a pseudo-anchor of shrinkage toward "no opinion"
    pref[axis] = n ? clamp(sum / (n + 0.5), -1, 1) : 0;
  }
  return { pref, evidence };
}

/** Unshrunk signal from a person's own words (explicit vibes like "loud live shows"). */
export function directSignal(text: string): AxisVector {
  const v = emptyVector();
  for (const axis of AXES) v[axis] = axisSignal(axis, text);
  return v;
}

/** Does free text (an "avoid" phrase or vibe) match a tag/name blob? Used for hard dislikes. */
export function matchesAvoid(avoid: string, blob: string): boolean {
  const a = avoid.toLowerCase().trim();
  if (!a) return false;
  const b = blob.toLowerCase();
  if (b.includes(a)) return true;
  // axis-flavoured avoids: "loud", "spicy", "nightlife", "expensive" ... only when the WHOLE phrase is such a word
  // (so "dive bar" is a literal avoid, not an alias for "cheap")
  const bare = a.replace(/\b(venues?|places?|spots?|food)\b/g, '').replace(/\s+/g, ' ').trim();
  const axisWord: [RegExp, Axis, 1 | -1][] = [
    [/^(loud|noisy|rowdy)$/, 'volume', 1],
    [/^(quiet|silent)$/, 'volume', -1],
    [/^(spicy|hot)$/, 'spice', 1],
    [/^(mild|bland)$/, 'spice', -1],
    [/^(nightlife|clubs?|bars?)$/, 'scene', 1],
    [/^(kids?|family)$/, 'scene', -1],
    [/^(experimental|avant.?garde|weird)$/, 'novelty', 1],
    [/^(mainstream|touristy|chains?)$/, 'novelty', -1],
    [/^(expensive|pricey|fancy|upscale)$/, 'price', 1],
    [/^(cheap|budget)$/, 'price', -1],
  ];
  for (const [re, axis, sign] of axisWord) {
    if (re.test(bare)) {
      const s = axisSignal(axis, blob);
      if (s * sign >= 0.5) return true;
    }
  }
  return false;
}

/** Parse vibe constraint text into a group-level preference nudge ("no loud venues" -> volume -0.8). */
export function vibeToAxisNudge(vibe: string): Partial<AxisVector> {
  const v = vibe.toLowerCase();
  const out: Partial<AxisVector> = {};
  const neg = /\b(no|not|avoid|without|nothing)\b/.test(v);
  const map: [RegExp, Axis, 1 | -1][] = [
    [/\b(loud|noisy|rowdy|lively|energetic|rave)\b/, 'volume', 1],
    [/\b(quiet|calm|chill|peaceful|low.?key|relaxed|cozy)\b/, 'volume', -1],
    [/\b(spicy|fiery|hot)\b/, 'spice', 1],
    [/\b(mild|bland)\b/, 'spice', -1],
    [/\b(nightlife|late|party|bar|bars|club)\b/, 'scene', 1],
    [/\b(family|kid|kids|daytime|wholesome)\b/, 'scene', -1],
    [/\b(experimental|weird|offbeat|artsy|avant.?garde)\b/, 'novelty', 1],
    [/\b(mainstream|classic|crowd.?pleaser|safe)\b/, 'novelty', -1],
    [/\b(upscale|fancy|splurge|luxury|special occasion)\b/, 'price', 1],
    [/\b(cheap|budget|affordable|frugal)\b/, 'price', -1],
  ];
  for (const [re, axis, sign] of map) {
    if (re.test(v)) out[axis] = (neg ? -sign : sign) * 0.8;
  }
  return out;
}
