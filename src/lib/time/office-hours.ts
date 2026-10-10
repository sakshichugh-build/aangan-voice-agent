import { toZonedTime } from 'date-fns-tz';

/**
 * IST office-hours logic. Office hours are configurable (seeded default:
 * 10:00–19:00, Mon–Sat, Asia/Kolkata). A call is "after hours" if it lands
 * outside those windows in IST.
 */
export interface OfficeHours {
  start: string; // "HH:mm"
  end: string; // "HH:mm"
  days: number[]; // ISO weekday: 1=Mon … 7=Sun
  tz: string; // IANA tz, e.g. "Asia/Kolkata"
}

export const DEFAULT_OFFICE_HOURS: OfficeHours = {
  start: '10:00',
  end: '19:00',
  days: [1, 2, 3, 4, 5, 6],
  tz: 'Asia/Kolkata',
};

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** ISO weekday 1..7 (Mon..Sun) for a Date in a given tz. */
function isoWeekday(d: Date): number {
  const js = d.getDay(); // 0=Sun..6=Sat (already zoned)
  return js === 0 ? 7 : js;
}

/** True if the instant falls within office hours (in the configured tz). */
export function isWithinOfficeHours(at: Date, hours: OfficeHours = DEFAULT_OFFICE_HOURS): boolean {
  const zoned = toZonedTime(at, hours.tz);
  const day = isoWeekday(zoned);
  if (!hours.days.includes(day)) return false;
  const mins = zoned.getHours() * 60 + zoned.getMinutes();
  return mins >= toMinutes(hours.start) && mins < toMinutes(hours.end);
}

/** Convenience: a call is after-hours when it is NOT within office hours. */
export function isAfterHours(at: Date, hours: OfficeHours = DEFAULT_OFFICE_HOURS): boolean {
  return !isWithinOfficeHours(at, hours);
}
