import "server-only";
import { CASUAL_LOADING, type DayType } from "./constants";

/** Local YYYY-MM-DD key, used to match a shift against the holiday calendar. */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Which penalty band a shift falls into (SCHADS):
 *   Public holiday — outranks everything
 *   Saturday / Sunday — by the day
 *   Weekday Night   — starts at/before midnight and finishes after midnight
 *                     (crosses the date), or starts before 6:00am
 *   Weekday Evening — starts at/after 8:00pm and ends by midnight
 *   Weekday Daytime — 6:00am to 8:00pm
 */
export function dayTypeFor(
  start: Date,
  end: Date,
  holidays?: Set<string>,
): DayType {
  if (holidays?.has(dateKey(start))) return "PUBLIC_HOLIDAY";
  const day = start.getDay(); // 0 = Sunday
  if (day === 0) return "SUNDAY";
  if (day === 6) return "SATURDAY";

  const startHour = start.getHours() + start.getMinutes() / 60;
  // Active night: runs past midnight into the next day, or begins before 6am.
  const crossesMidnight = dateKey(end) !== dateKey(start) && end > start;
  if (crossesMidnight || startHour < 6) return "WEEKDAY_NIGHT";
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
 * Hourly rate for a shift. Pay levels store PERMANENT rates; casual staff use
 * the award's additive method: base × (multiplier + loading), i.e. the
 * permanent cell plus the loading applied to the weekday base.
 */
export function hourlyRate(
  grid: RateGrid,
  stream: string,
  dayType: DayType,
  employmentType: string,
): number {
  const cell = grid[`${stream}_${dayType}`];
  if (cell == null) return 0;
  if (employmentType !== "CASUAL") return cell;
  const base = grid[`${stream}_WEEKDAY_DAY`] ?? 0;
  return cell + CASUAL_LOADING * base;
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

/** Net paid hours: clocked time minus breaks, falling back to rostered time. */
export function netHoursOf(s: ShiftForPay): number {
  const hrs = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 3_600_000;
  const gross =
    s.clockInAt && s.clockOutAt
      ? hrs(s.clockInAt, s.clockOutAt)
      : hrs(s.start, s.end);
  const breaks = s.pauses.reduce(
    (sum, p) => sum + (p.endAt ? hrs(p.startAt, p.endAt) : 0),
    0,
  );
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

/** Cost a single shift for a worker on a given pay level. */
export function costShift(
  s: ShiftForPay,
  grid: RateGrid,
  employmentType: string,
  mileageRate: number,
  holidays?: Set<string>,
): ShiftLine {
  const dayType = dayTypeFor(new Date(s.start), new Date(s.end), holidays);
  const stream = streamFor(s.client.agreementType);
  const hours = netHoursOf(s);
  const km = kmOf(s);
  const rate = hourlyRate(grid, stream, dayType, employmentType);
  const pay = hours * rate + km * mileageRate;
  return { hours, km, rate, dayType, stream, pay };
}

export const money = (n: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(n);
