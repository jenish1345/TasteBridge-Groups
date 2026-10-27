// Taste Conflict Diplomacy: detect incompatible preferences across the group.

import type { Axis, Conflict, PersonProfile } from '../types.js';
import { AXES, AXIS_META } from './taxonomy.js';

export const CONFLICT_MIN_PREF = 0.3; // |pref| needed to count as "taking a side"
export const HIGH = 0.55;
export const MEDIUM = 0.4;

export function detectConflicts(profiles: PersonProfile[]): Conflict[] {
  const out: Conflict[] = [];
  for (const axis of AXES) {
    const pos = profiles.filter((p) => p.pref[axis] >= CONFLICT_MIN_PREF);
    const neg = profiles.filter((p) => p.pref[axis] <= -CONFLICT_MIN_PREF);
    if (!pos.length || !neg.length) continue;
    const maxPos = Math.max(...pos.map((p) => p.pref[axis]));
    const maxNeg = Math.max(...neg.map((p) => -p.pref[axis]));
    const severity = round((maxPos + maxNeg) / 2);
    const level: Conflict['level'] = severity >= HIGH ? 'high' : severity >= MEDIUM ? 'medium' : 'low';
    out.push({
      axis,
      label: AXIS_META[axis].label,
      poleA: AXIS_META[axis].pos,
      poleB: AXIS_META[axis].neg,
      severity,
      level,
      sideA: pos.map((p) => p.person.id),
      sideB: neg.map((p) => p.person.id),
      explanation: explain(axis, pos, neg),
    });
  }
  return out.sort((a, b) => b.severity - a.severity);
}

function names(ps: PersonProfile[]): string {
  const n = ps.map((p) => p.person.name);
  return n.length <= 2 ? n.join(' & ') : `${n.slice(0, -1).join(', ')} & ${n[n.length - 1]}`;
}

function explain(axis: Axis, pos: PersonProfile[], neg: PersonProfile[]): string {
  const m = AXIS_META[axis];
  const v = (ps: PersonProfile[]) => (ps.length > 1 ? 'lean' : 'leans');
  return `${names(pos)} ${v(pos)} ${m.pos}; ${names(neg)} ${v(neg)} ${m.neg}.`;
}

const round = (n: number) => Math.round(n * 100) / 100;
