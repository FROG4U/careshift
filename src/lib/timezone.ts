// Australian timezone handling.
//
// Shift times are stored as UTC instants. Everything that decides *what a
// clock on the wall said* — which SCHADS penalty band a shift falls into,
// whether it landed on a Saturday, whether it matches a public holiday — must
// be evaluated in the LOCAL time of the branch the shift belongs to, not in
// whatever timezone the server happens to run in.
//
// Australia spans three offsets (and only some states observe daylight
// saving), so a single server clock cannot be correct for every branch:
//   Brisbane 10:00  =  Perth 08:00  =  Sydney 11:00 (in daylight saving)
// A 6am shift start in Perth is 8am in Brisbane — different penalty bands.
//
// Each branch declares its state; the state gives us the IANA timezone.

import { type AuState } from "./constants";

/** IANA timezone for each Australian state/territory. */
export const STATE_TIMEZONES: Record<AuState, string> = {
  NSW: "Australia/Sydney",
  VIC: "Australia/Melbourne",
  QLD: "Australia/Brisbane",
  WA: "Australia/Perth",
  SA: "Australia/Adelaide",
  TAS: "Australia/Hobart",
  ACT: "Australia/Sydney",
  NT: "Australia/Darwin",
};

/**
 * Used when a branch has no state set, or a record has no branch at all.
 * Brisbane: matches head office and never observes daylight saving, so it is
 * the most predictable fallback.
 */
export const DEFAULT_TIMEZONE = "Australia/Brisbane";

/** Short label for the UI, e.g. "AEST / AEDT". */
export const STATE_TZ_LABELS: Record<AuState, string> = {
  NSW: "Sydney time (AEST/AEDT)",
  VIC: "Melbourne time (AEST/AEDT)",
  QLD: "Brisbane time (AEST, no daylight saving)",
  WA: "Perth time (AWST)",
  SA: "Adelaide time (ACST/ACDT)",
  TAS: "Hobart time (AEST/AEDT)",
  ACT: "Canberra time (AEST/AEDT)",
  NT: "Darwin time (ACST, no daylight saving)",
};

/** The timezone a branch operates in, from its state. */
export function tzForState(state?: string | null): string {
  if (!state) return DEFAULT_TIMEZONE;
  return STATE_TIMEZONES[state as AuState] ?? DEFAULT_TIMEZONE;
}

// Intl formatters are expensive to construct and payroll loops over every
// shift in a period, so keep one per timezone.
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = formatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    });
    formatterCache.set(tz, f);
  }
  return f;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export type ZonedParts = {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number; // 0–23
  minute: number;
  weekday: number; // 0 = Sunday, matching Date#getDay()
};

/** What the wall clock read in `tz` at instant `d`. */
export function zonedParts(d: Date, tz: string): ZonedParts {
  const parts = partsFormatter(tz).formatToParts(d);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  // Some engines render midnight as "24" under h23; normalise it.
  const hour = Number(get("hour")) % 24;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour,
    minute: Number(get("minute")),
    weekday: WEEKDAY_INDEX[get("weekday").slice(0, 3)] ?? 0,
  };
}

/** `YYYY-MM-DD` as seen in `tz` — the local calendar date of an instant. */
export function dateKeyInTz(d: Date, tz: string): string {
  const p = zonedParts(d, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/**
 * `YYYY-MM-DD` for values that represent a CALENDAR DATE rather than an
 * instant — public holidays are stored at UTC midnight of the day they fall
 * on, so they must be read back in UTC or a timezone offset would slide them
 * onto the wrong day.
 */
export function calendarDateKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

/** Store a `YYYY-MM-DD` calendar date unambiguously, at UTC midnight. */
export function calendarDateFromKey(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** Format an instant for display in a branch's local time. */
export function fmtInTz(
  d: Date,
  tz: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat("en-AU", { ...options, timeZone: tz }).format(d);
}
