import {
  DAY_TYPES,
  DAY_TYPE_MULTIPLIER,
  STAFF_STREAMS,
  type DayType,
} from "./constants";
import type { RateGrid } from "./payroll";

/**
 * A worker's effective pay rates.
 *
 * Rates normally come from the award Pay Level assigned to the worker. An
 * admin can also set a manual override per stream on the worker's profile —
 * useful for someone paid above award, or a stream the level doesn't cover.
 *
 * An override sets the worker's WEEKDAY BASE for that stream. The SCHADS
 * penalty multipliers still apply on top (evening +12.5%, night +15%,
 * Saturday ×1.5, Sunday ×2, public holiday ×2.5), because those are legal
 * entitlements — an override raises someone's pay, it must not quietly strip
 * their penalty rates. Casual loading is applied later, in hourlyRate().
 */

export type StaffRateSource = {
  employmentType: string;
  rateNdis: number | null;
  rateAgedCare: number | null;
  rateDva: number | null;
  rateCleaning: number | null;
  payLevel: {
    name: string;
    mileageRate: number;
    rates: { stream: string; dayType: string; rate: number }[];
  } | null;
};

/** Which profile field overrides which stream. */
const OVERRIDE_FIELD: Record<string, keyof StaffRateSource> = {
  NDIS: "rateNdis",
  AGED_CARE: "rateAgedCare",
  DVA: "rateDva",
  CLEANING: "rateCleaning",
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function overrideFor(
  staff: StaffRateSource,
  stream: string,
): number | null {
  const field = OVERRIDE_FIELD[stream];
  if (!field) return null;
  const value = staff[field];
  return typeof value === "number" && value > 0 ? value : null;
}

export type EffectiveRates = {
  grid: RateGrid;
  /** Streams currently driven by a manual override rather than the level. */
  overriddenStreams: string[];
  levelName: string | null;
  mileageRate: number;
};

/** The rate grid actually used to pay this worker. */
export function effectiveRates(staff: StaffRateSource): EffectiveRates {
  const grid: RateGrid = {};

  // Start from the assigned award level.
  for (const r of staff.payLevel?.rates ?? []) {
    grid[`${r.stream}_${r.dayType}`] = r.rate;
  }

  // Manual overrides win, expanded across the penalty bands.
  const overriddenStreams: string[] = [];
  for (const stream of STAFF_STREAMS) {
    const base = overrideFor(staff, stream);
    if (base == null) continue;
    overriddenStreams.push(stream);
    for (const dayType of DAY_TYPES) {
      grid[`${stream}_${dayType}`] = round2(
        base * DAY_TYPE_MULTIPLIER[dayType as DayType],
      );
    }
  }

  return {
    grid,
    overriddenStreams,
    levelName: staff.payLevel?.name ?? null,
    mileageRate: staff.payLevel?.mileageRate ?? 0,
  };
}
