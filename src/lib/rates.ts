import {
  CASUAL_LOADING,
  DAY_TYPES,
  STAFF_STREAMS,
  type DayType,
} from "./constants";
import type { RateGrid } from "./payroll";

/**
 * A worker's effective pay rates — the FINAL dollars-per-hour for every
 * stream and day-type combination.
 *
 * Two inputs, in order:
 *   1. The award Pay Level assigned to them. Levels store PERMANENT rates,
 *      so casual loading is added here using the award's additive method:
 *      base x (multiplier + loading), i.e. the permanent cell plus the
 *      loading applied to the weekday base.
 *   2. Any per-worker override an admin has typed into the rate grid on the
 *      staff profile. An override is taken LITERALLY — it is the rate paid,
 *      with no loading added on top. The admin types what they see in the
 *      grid, and that is what the worker gets.
 *
 * Everything downstream (payroll, the CSV, the PDF, the worker's own rate
 * and pay screens) reads this one function, so there is a single answer to
 * "what is this person paid".
 */

export type StaffRateSource = {
  employmentType: string;
  payLevel: {
    name: string;
    mileageRate: number;
    rates: { stream: string; dayType: string; rate: number }[];
  } | null;
  /**
   * Admin overrides. REQUIRED on purpose — if this were optional, a query
   * that forgot `rateOverrides: true` would compile fine and silently pay
   * the level rate instead of the agreed one. Better a build error.
   */
  rateOverrides: { stream: string; dayType: string; rate: number }[];
};

export type EffectiveRates = {
  /** Final $/hr per `${stream}_${dayType}` — loading already included. */
  grid: RateGrid;
  /** Keys an admin has overridden, so the UI can mark them. */
  overriddenKeys: Set<string>;
  levelName: string | null;
  mileageRate: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function effectiveRates(staff: StaffRateSource): EffectiveRates {
  const grid: RateGrid = {};
  const casual = staff.employmentType === "CASUAL";

  // 1. The level's permanent rates.
  for (const r of staff.payLevel?.rates ?? []) {
    grid[`${r.stream}_${r.dayType}`] = r.rate;
  }

  // 2. Casual loading, additive on the weekday base for that stream.
  if (casual) {
    for (const stream of STAFF_STREAMS) {
      const base = grid[`${stream}_WEEKDAY_DAY`] ?? 0;
      if (base === 0) continue;
      for (const dayType of DAY_TYPES) {
        const key = `${stream}_${dayType}`;
        if (grid[key] == null) continue;
        grid[key] = round2(grid[key] + CASUAL_LOADING * base);
      }
    }
  }

  // 3. Admin overrides — taken exactly as typed.
  const overriddenKeys = new Set<string>();
  for (const o of staff.rateOverrides ?? []) {
    if (!(o.rate > 0)) continue;
    const key = `${o.stream}_${o.dayType}`;
    grid[key] = o.rate;
    overriddenKeys.add(key);
  }

  return {
    grid,
    overriddenKeys,
    levelName: staff.payLevel?.name ?? null,
    mileageRate: staff.payLevel?.mileageRate ?? 0,
  };
}

/** The final rate for one cell. */
export function rateFor(
  grid: RateGrid,
  stream: string,
  dayType: DayType,
): number {
  return grid[`${stream}_${dayType}`] ?? 0;
}
