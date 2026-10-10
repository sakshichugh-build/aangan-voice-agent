import { describe, it, expect } from 'vitest';
import { isAfterHours, isWithinOfficeHours } from './office-hours';

// Helper: build a UTC instant for a given IST wall-clock time.
// IST = UTC+5:30, so 11:00 IST = 05:30 UTC.
function ist(dateUtc: string): Date {
  return new Date(dateUtc);
}

describe('IST office hours (10:00–19:00 Mon–Sat)', () => {
  it('11:00 IST Tuesday is within hours', () => {
    // 2026-09-15 is a Tuesday. 11:00 IST = 05:30 UTC.
    expect(isWithinOfficeHours(ist('2026-09-15T05:30:00Z'))).toBe(true);
  });
  it('11:42 PM IST (after hours) is after hours — the 2am-call case', () => {
    // 23:42 IST = 18:12 UTC same day.
    expect(isAfterHours(ist('2026-09-15T18:12:00Z'))).toBe(true);
  });
  it('2:00 AM IST is after hours', () => {
    // 02:00 IST = 20:30 UTC previous day.
    expect(isAfterHours(ist('2026-09-14T20:30:00Z'))).toBe(true);
  });
  it('09:59 IST is after hours (before open)', () => {
    // 09:59 IST = 04:29 UTC.
    expect(isAfterHours(ist('2026-09-15T04:29:00Z'))).toBe(true);
  });
  it('19:00 IST is after hours (at close, exclusive)', () => {
    // 19:00 IST = 13:30 UTC.
    expect(isAfterHours(ist('2026-09-15T13:30:00Z'))).toBe(true);
  });
  it('18:59 IST is within hours', () => {
    expect(isWithinOfficeHours(ist('2026-09-15T13:29:00Z'))).toBe(true);
  });
  it('Sunday 11:00 IST is after hours (closed day)', () => {
    // 2026-09-13 is a Sunday.
    expect(isAfterHours(ist('2026-09-13T05:30:00Z'))).toBe(true);
  });
  it('Saturday 11:00 IST is within hours', () => {
    // 2026-09-12 is a Saturday.
    expect(isWithinOfficeHours(ist('2026-09-12T05:30:00Z'))).toBe(true);
  });
});
