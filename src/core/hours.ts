// Opening-hours handling. Qloo place entities expose properties.hours as
// { monday: [{ opens: "T10:30:00", closes: "T17:30:00", closed: false }], ... }.
// We normalise to minutes-since-midnight ranges so "is it open at 8 PM Saturday?" is a pure function.

/** weekday name -> [open, close] ranges in minutes; close may exceed 1440 for after-midnight closing. [] = closed all day. */
export type Hours = Record<string, [number, number][]>;

export const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const toMin = (s: unknown): number | undefined => {
  const m = typeof s === 'string' ? /(\d{1,2}):(\d{2})/.exec(s) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
};

export function parseHours(raw: unknown): Hours | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Hours = {};
  for (const day of WEEKDAYS) {
    const entries = (raw as Record<string, unknown>)[day];
    if (!Array.isArray(entries)) continue;
    const ranges: [number, number][] = [];
    for (const e of entries as Record<string, unknown>[]) {
      if (e?.closed === true) continue;
      const o = toMin(e?.opens);
      let c = toMin(e?.closes);
      if (o === undefined || c === undefined) continue;
      if (c <= o) c += 1440; // closes after midnight (or open 24h when opens === closes)
      ranges.push([o, c]);
    }
    out[day] = ranges; // [] means explicitly closed that day
  }
  return Object.keys(out).length ? out : undefined;
}

export function fmtMinutes(total: number): string {
  const m = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  return `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** Parse "YYYY-MM-DDTHH:mm" (as typed by the user, no timezone) into weekday + minutes. */
export function parseLocal(datetime: string | undefined): { dow: number; minutes: number } | undefined {
  const m = datetime ? /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/.exec(datetime) : null;
  if (!m) return undefined;
  const dow = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
  return { dow, minutes: Number(m[4]) * 60 + Number(m[5]) };
}

export interface OpenCheck {
  /** undefined = we don't have hours for that day, so we can't say */
  open: boolean | undefined;
  at?: string;
  closesAt?: string;
}

/** Is the venue open `offsetMin` minutes after the plan's start time? */
export function isOpenAt(hours: Hours | undefined, datetime: string | undefined, offsetMin = 0): OpenCheck {
  const start = parseLocal(datetime);
  if (!hours || !start) return { open: undefined };
  const t = start.minutes + offsetMin;
  const dow = (start.dow + Math.floor(t / 1440)) % 7;
  const m = t % 1440;
  const today = hours[WEEKDAYS[dow]];
  const yesterday = hours[WEEKDAYS[(dow + 6) % 7]];
  if (!today && !yesterday) return { open: undefined };
  const at = fmtMinutes(m);
  for (const [o, c] of today ?? []) if (m >= o && m < c) return { open: true, at, closesAt: fmtMinutes(c) };
  for (const [, c] of yesterday ?? []) if (c > 1440 && m + 1440 < c) return { open: true, at, closesAt: fmtMinutes(c) };
  // a known weekday with no matching range = closed; if today's key is missing we only know about spillover
  return today ? { open: false, at } : { open: undefined };
}
