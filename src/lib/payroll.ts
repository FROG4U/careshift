import "server-only";
import { CASUAL_LOADING, type DayType } from "./constants";
import { DEFAULT_TIMEZONE, dateKeyInTz, zonedParts } from "./timezone";

/**
 * YYYY-MM-DD key for a shift, in the LOCAL time of the branch it belongs to.
 * Never use the server clock here: a 7am Perth shift is 9am in Brisbane, and
 * a shift after 10pm in Perth has already rolled to the next date in Sydney.
 */
export function dateKey(d: Date, tz: string = DEFAULT_TIMEZONE): string {
  return dateKeyInTz(d, tz);
}

/**
 * Which penalty band a shift falls into (SCHADS), evaluated in `tz` — the
 * timezone of the branch that owns the shift:
 *   Public holiday — outranks everything
 *   Saturday / Sunday — by the day
 *   Weekday Night   — starts at/before midnight and finishes AFTER midnight,
 *                     or starts before 6:00am
 *   Weekday Evening — 8:00pm to midnight, finishing AT OR BEFORE midnight
 *   Weekday Daytime — 6:00am to 8:00pm on a single weekday
 */
export function dayTypeFor(
  start: Date,
  end: Date,
  holidays?: Set<string>,
  tz: string = DEFAULT_TIMEZONE,
): DayType {
  if (holidays?.has(dateKey(start, tz))) return "PUBLIC_HOLIDAY";
  const local = zonedParts(start, tz);
  if (local.weekday === 0) return "SUNDAY";
  if (local.weekday === 6) return "SATURDAY";

  const startHour = local.hour + local.minute / 60;

  // "Finishes after midnight" means STRICTLY past 00:00. A shift ending at
  // exactly midnight finishes *at* midnight, which is still Evening — but
  // its end timestamp falls on the next calendar date, so comparing dates
  // alone would wrongly read it as an active overnight and pay night rates.
  const endLocal = zonedParts(end, tz);
  const endsExactlyAtMidnight = endLocal.hour === 0 && endLocal.minute === 0;
  const finishesAfterMidnight =
    end > start &&
    dateKey(end, tz) !== dateKey(start, tz) &&
    !endsExactlyAtMidnight;

  if (finishesAfterMidnight || startHour < 6) return "WEEKDAY_NIGHT";
  // Evening band starts at 8pm.
  if (startHour >= 20) return "WEEKDAY_EVENING";
  return "WEEKDAY_DAY";
}

/** A participant's agreement type maps directly to a pay stream. */
export function streamFor(agreementType: string): string {
  return agreementType === "AGED_CARE" || agreementType === "DVA"
    ? agreementType
    : "NDIS";
}

export type RateGrid = Record<string, number>; // `${stream}_${dayType}` → $/hr

/**
 * Hourly rate for a shift.
 *
 * The grid handed in comes from `effectiveRates`, which has ALREADY applied
 * casual loading and any admin override — so this is a plain lookup. Loading
 * lives in one place on purpose: when it was applied here as well, an admin
 * override typed as $45 would have been paid at $56.
 */
export function hourlyRate(grid: RateGrid, stream: string, dayType: DayType): number {
  return grid[`${stream}_${dayType}`] ?? 0;
}

export type ShiftForPay = {
  start: Date;
  end: Date;
  clockInAt: Date | null;
  clockOutAt: Date | null;
  mileageKm: number | null;
  client: { agreementType: string };
  pauses: { startAt: Date; endAt: Date | null }[];
  transports: { km: number }[];
};

const hrsBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 3_600_000;

/**
 * The window a worker is actually PAID for.
 *
 * Pay follows the roster, not the clock, at both ends:
 *   - Clocking in EARLY doesn't start the pay clock — a 9am shift started at
 *     8:50 is paid from 9:00.
 *   - Clocking out LATE doesn't extend it — finishing at 12:12 on a shift
 *     rostered to 12:00 is paid to 12:00.
 *   - Clocking in LATE does count against the worker — starting at 9:15 is
 *     paid from 9:15, not 9:00.
 *   - Clocking out EARLY likewise — leaving at 11:45 is paid to 11:45.
 *
 * In short: paid time is the OVERLAP of clocked time and rostered time.
 * If the worker never clocked in or out we fall back to the rostered window.
 *
 * Genuine approved overtime is handled by an admin editing the shift's times
 * in Timesheets, which moves the rostered window itself.
 */
export type ShiftHours = {
  start: Date;
  end: Date;
  clockInAt: Date | null;
  clockOutAt: Date | null;
  pauses: { startAt: Date; endAt: Date | null }[];
};

export function paidWindowOf(s: ShiftHours): { from: Date; to: Date } {
  if (!s.clockInAt || !s.clockOutAt) return { from: s.start, to: s.end };
  const from = s.clockInAt > s.start ? s.clockInAt : s.start;
  const to = s.clockOutAt < s.end ? s.clockOutAt : s.end;
  return { from, to };
}

/** Net paid hours: the paid window, minus any breaks taken. */
export function netHoursOf(s: ShiftHours): number {
  const { from, to } = paidWindowOf(s);
  const gross = Math.max(0, hrsBetween(from, to));

  // Only count break time that falls inside the paid window — a break taken
  // during unpaid overrun would otherwise be deducted twice.
  const breaks = s.pauses.reduce((sum, p) => {
    if (!p.endAt) return sum;
    const bStart = p.startAt > from ? p.startAt : from;
    const bEnd = p.endAt < to ? p.endAt : to;
    return sum + Math.max(0, hrsBetween(bStart, bEnd));
  }, 0);

  return Math.max(0, gross - breaks);
}

/** Total kilometres claimed on a shift (tracked trips + any manual mileage). */
export function kmOf(s: ShiftForPay): number {
  const tracked = s.transports.reduce((sum, t) => sum + t.km, 0);
  return tracked > 0 ? tracked : (s.mileageKm ?? 0);
}

export type ShiftLine = {
  hours: number;
  km: number;
  rate: number;
  dayType: DayType;
  stream: string;
  pay: number;
};

/**
 * Cost a single shift for a worker on a given pay level. `tz` is the branch's
 * timezone — it decides the penalty band, so passing the wrong one changes
 * what the worker gets paid.
 */
export function costShift(
  s: ShiftForPay,
  grid: RateGrid,
  employmentType: string,
  mileageRate: number,
  holidays?: Set<string>,
  tz: string = DEFAULT_TIMEZONE,
): ShiftLine {
  const dayType = dayTypeFor(new Date(s.start), new Date(s.end), holidays, tz);
  const stream = streamFor(s.client.agreementType);
  const hours = netHoursOf(s);
  const km = kmOf(s);
  const rate = hourlyRate(grid, stream, dayType);
  const pay = hours * rate + km * mileageRate;
  return { hours, km, rate, dayType, stream, pay };
}

export const money = (n: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(n);
