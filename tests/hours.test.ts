import { describe, expect, it } from 'vitest';
import { isOpenAt, parseHours, parseLocal } from '../src/core/hours.js';
import { normalizeEntity } from '../src/qloo/live.js';

// 2026-11-14 is a Saturday
const hours = parseHours({
  saturday: [{ opens: 'T11:00:00', closes: 'T02:00:00', closed: false }], // closes after midnight
  sunday: [{ opens: 'T11:00:00', closes: 'T22:00:00', closed: false }],
  monday: [{ closed: true }],
});

describe('opening hours', () => {
  it('parses Qloo hour ranges, including after-midnight closing', () => {
    expect(hours!.saturday).toEqual([[660, 1560]]);
    expect(hours!.monday).toEqual([]);
    expect(parseLocal('2026-11-14T19:00')).toEqual({ dow: 6, minutes: 1140 });
  });
  it('knows when a venue is open or closed at a stop time', () => {
    expect(isOpenAt(hours, '2026-11-14T19:00', 0)).toMatchObject({ open: true, closesAt: '2:00 AM' });
    expect(isOpenAt(hours, '2026-11-14T10:00', 0).open).toBe(false); // before opening
    expect(isOpenAt(hours, '2026-11-14T19:00', 360).open).toBe(true); // 1 AM Sunday: Saturday's late hours spill over
    expect(isOpenAt(hours, '2026-11-14T19:00', 480).open).toBe(false); // 3 AM Sunday
    expect(isOpenAt(hours, '2026-11-16T19:00', 0).open).toBe(false); // Monday closed all day
  });
  it('says "unknown" rather than guessing when there is no data', () => {
    expect(isOpenAt(undefined, '2026-11-14T19:00').open).toBeUndefined();
    expect(isOpenAt(hours, '2026-11-17T19:00').open).toBeUndefined(); // Tuesday missing
    expect(isOpenAt(hours, undefined).open).toBeUndefined();
  });
  it('is parsed from the live entity shape and flags permanently closed venues', () => {
    const e = normalizeEntity({ entity_id: 'P', name: 'Cafe', subtype: 'urn:entity:place', properties: { hours: { saturday: [{ opens: 'T09:00:00', closes: 'T17:00:00', closed: false }] }, is_closed: true, website: 'https://x.test', phone: '+1555' } }, 'qloo-live', 'urn:entity:place')!;
    expect(e.hours?.saturday).toEqual([[540, 1020]]);
    expect(e.permanentlyClosed).toBe(true);
    expect(e.website).toBe('https://x.test');
  });
});
