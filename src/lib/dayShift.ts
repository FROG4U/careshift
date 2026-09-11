/**
 * Clock times saved a day early by the old Timesheets edit form.
 *
 * The form rebuilt clock times from the shift's UTC date plus a local HH:MM.
 * Any shift starting before 10am Brisbane (midnight UTC) has a UTC date one day
 * earlier, so saving the form - even just to change the notes - moved its clock
 * times back 24 hours. Pay counts the overlap of clocked and rostered time, so
 * those shifts were costed at zero.
 *
 * Detected narrowly: both clock times present, clock-in between 23 and 25
 * hours BEFORE the rostered start, and moving both forward a day makes them
 * overlap the roster. Anything outside that is left alone.
 *
 * Kept free of server-only imports so it can be checked from a plain script.
 */

export const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export type ClockTimes = {
  start: Date;
  end: Date;
  clockInAt: Date | null;
  clockOutAt: Date | null;
};

export function isDayShifted(s: ClockTimes): boolean {
  if (!s.clockInAt || !s.clockOutAt) return false;
  const offset = s.clockInAt.getTime() - s.start.getTime();
  if (offset > -23 * HOUR_MS || offset < -25 * HOUR_MS) return false;
  const inFixed = s.clockInAt.getTime() + DAY_MS;
  const outFixed = s.clockOutAt.getTime() + DAY_MS;
  const overlap =
    Math.min(outFixed, s.end.getTime()) - Math.max(inFixed, s.start.getTime());
  return overlap > 0;
}
