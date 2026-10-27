// Person + group taste profiles built from resolved Qloo anchors.

import type { Axis, AxisVector, GroupProfile, Person, PersonProfile, QlooTag, ResolvedAnchor } from '../types.js';
import { detectConflicts } from './conflicts.js';
import { AXES, directSignal, emptyVector, positionFromTexts, preferenceFromAnchorSignals, tagText, vibeToAxisNudge } from './taxonomy.js';

const MAX_SIGNAL_ENTITIES = 10;

export function buildPersonProfile(person: Person, anchors: ResolvedAnchor[]): PersonProfile {
  const perAnchor: AxisVector[] = [];
  const weights: number[] = [];
  const tagCounts = new Map<string, { name: string; id: string; n: number }>();
  const signalEntityIds: string[] = [];
  const signalTagIds: string[] = [];

  for (const ra of anchors) {
    if (ra.status !== 'resolved') continue;
    let texts: string[];
    let price: number | undefined;
    if (ra.entity) {
      texts = [ra.entity.name, ...ra.entity.tags.map(tagText)];
      price = ra.entity.priceLevel;
      if (signalEntityIds.length < MAX_SIGNAL_ENTITIES) signalEntityIds.push(ra.entity.id);
      for (const t of ra.entity.tags) bump(tagCounts, t);
    } else if (ra.tag) {
      // the person's own words count too ("loud live shows" may resolve to a plain "Live Music" tag)
      texts = [tagText(ra.tag), ra.anchor.text];
      signalTagIds.push(ra.tag.id);
      bump(tagCounts, ra.tag);
    } else {
      texts = [ra.anchor.text];
    }
    let vec = positionFromTexts(texts, price).pos;
    if (ra.anchor.kind === 'vibe') {
      // explicit vibes are the person telling us directly: use their words unshrunk, weighted double
      const direct = directSignal(ra.anchor.text);
      vec = Object.fromEntries(AXES.map((a) => [a, direct[a] !== 0 ? direct[a] : vec[a]])) as AxisVector;
    }
    perAnchor.push(vec);
    weights.push(ra.anchor.kind === 'vibe' ? 2 : 1);
  }

  const { pref, evidence } = preferenceFromAnchorSignals(perAnchor, weights);
  const resolvedCount = anchors.filter((a) => a.status === 'resolved').length;

  const topTags = [...tagCounts.values()]
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
    .slice(0, 12)
    .map((t) => ({ id: t.id, name: t.name, weight: Math.round((t.n / Math.max(1, resolvedCount)) * 100) / 100 }));

  return {
    person,
    anchors,
    pref,
    prefEvidence: evidence,
    signalEntityIds,
    signalTagIds,
    topTags,
    lowConfidence: resolvedCount < 2,
  };
}

function bump(m: Map<string, { name: string; id: string; n: number }>, t: QlooTag) {
  const key = t.name.toLowerCase();
  const cur = m.get(key);
  if (cur) cur.n++;
  else m.set(key, { name: t.name, id: t.id, n: 1 });
}

export function buildGroupProfile(profiles: PersonProfile[], vibes: string[] = []): GroupProfile {
  // tag overlap by lowercased name
  const byTag = new Map<string, { id: string; name: string; people: Set<string> }>();
  for (const p of profiles) {
    for (const t of p.topTags) {
      const key = t.name.toLowerCase();
      const cur = byTag.get(key) ?? { id: t.id, name: t.name, people: new Set<string>() };
      cur.people.add(p.person.id);
      byTag.set(key, cur);
    }
  }
  const all = [...byTag.values()].map((t) => ({ id: t.id, name: t.name, people: [...t.people] }));
  const n = profiles.length;
  const overlapTags = all.filter((t) => t.people.length === n && n > 1);
  const sharedTags = all.filter((t) => t.people.length >= 2 && t.people.length < n);
  const uniqueTags = profiles.map((p) => ({
    personId: p.person.id,
    tags: all.filter((t) => t.people.length === 1 && t.people[0] === p.person.id).slice(0, 6).map((t) => ({ id: t.id, name: t.name })),
  }));

  const groupPref = emptyVector();
  for (const axis of AXES) {
    groupPref[axis] = profiles.reduce((s, p) => s + p.pref[axis], 0) / Math.max(1, n);
  }
  for (const v of vibes) {
    const nudge = vibeToAxisNudge(v);
    for (const axis of AXES as Axis[]) if (nudge[axis] !== undefined) groupPref[axis] = nudge[axis]!;
  }

  return {
    people: profiles,
    overlapTags,
    sharedTags,
    uniqueTags,
    conflicts: detectConflicts(profiles),
    groupPref,
  };
}
