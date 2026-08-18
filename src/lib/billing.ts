import "server-only";
import { type DayType } from "./constants";
import {
  costShift,
  dayTypeFor,
  kmOf,
  netHoursOf,
  type ShiftForPay,
  type RateGrid,
} from "./payroll";
import { effectiveRates, type StaffRateSource } from "./rates";

/**
 * The income side: what the provider CHARGES a participant, versus what it
 * COSTS to deliver (worker wages + superannuation + mileage).
 *
 * Charge rates come from ChargeDefault (per funding agreement) and can be
 * overridden per participant on their profile. Hours are the same PAID hours
 * used for wages — capped to the rostered window — so revenue and cost are
 * always measured over the identical period and the margin can't drift.
 */

export type ChargeSource = {
  agreementType: string;
  chargeWeekdayDay: number | null;
  chargeWeekdayEvening: number | null;
  chargeWeekdayNight: number | null;
  chargeSaturday: number | null;
  chargeSunday: number | null;
  chargePublicHoliday: number | null;
  chargeMileageRate: number | null;
};

export type ChargeDefaults = {
  agreementType: string;
  weekdayDay: number;
  weekdayEvening: number;
  weekdayNight: number;
  saturday: number;
  sunday: number;
  publicHoliday: number;
  mileageRate: number;
};

export type ChargeGrid = Record<DayType, number>;

/** Charge rates for a participant: their overrides over the agreement default. */
export function chargeRatesFor(
  client: ChargeSource,
  defaults: ChargeDefaults[],
): { grid: ChargeGrid; mileageRate: number; overridden: boolean } {
  const d = defaults.find((x) => x.agreementType === client.agreementType);
  const pick = (own: number | null, fallback: number) =>
    own != null && own > 0 ? own : fallback;

  const grid: ChargeGrid = {
    WEEKDAY_DAY: pick(client.chargeWeekdayDay, d?.weekdayDay ?? 0),
    WEEKDAY_EVENING: pick(client.chargeWeekdayEvening, d?.weekdayEvening ?? 0),
    WEEKDAY_NIGHT: pick(client.chargeWeekdayNight, d?.weekdayNight ?? 0),
    SATURDAY: pick(client.chargeSaturday, d?.saturday ?? 0),
    SUNDAY: pick(client.chargeSunday, d?.sunday ?? 0),
    PUBLIC_HOLIDAY: pick(client.chargePublicHoliday, d?.publicHoliday ?? 0),
  };

  const overridden = [
    client.chargeWeekdayDay,
    client.chargeWeekdayEvening,
    client.chargeWeekdayNight,
    client.chargeSaturday,
    client.chargeSunday,
    client.chargePublicHoliday,
    client.chargeMileageRate,
  ].some((v) => v != null && v > 0);

  return {
    grid,
    mileageRate: pick(client.chargeMileageRate, d?.mileageRate ?? 0),
    overridden,
  };
}

export type ShiftMargin = {
  dayType: DayType;
  hours: number;
  km: number;
  /** Charged to the participant. */
  revenue: number;
  chargeRate: number;
  /** Worker wages (excluding super). */
  wages: number;
  /** Superannuation on those wages. */
  super: number;
  /** Mileage reimbursed to the worker. */
  mileageCost: number;
  /** wages + super + mileage. */
  cost: number;
  profit: number;
  /** Profit as a share of revenue, or null when nothing was charged. */
  marginPct: number | null;
};

/**
 * Revenue, cost and profit for one shift.
 *
 * `unrated` is worth checking upstream: if a participant has no charge rate
 * set, revenue is 0 and the shift will look like a pure loss rather than
 * being flagged as unconfigured.
 */
export function marginFor(
  shift: ShiftForPay,
  opts: {
    staff: StaffRateSource;
    chargeGrid: ChargeGrid;
    chargeMileageRate: number;
    superRate: number;
    holidays?: Set<string>;
    tz?: string;
  },
): ShiftMargin {
  const { grid: payGrid, mileageRate: payMileage } = effectiveRates(opts.staff);

  const pay = costShift(
    shift,
    payGrid as RateGrid,
    opts.staff.employmentType,
    payMileage,
    opts.holidays,
    opts.tz,
  );

  const dayType = dayTypeFor(
    new Date(shift.start),
    new Date(shift.end),
    opts.holidays,
    opts.tz,
  );
  const hours = netHoursOf(shift);
  const km = kmOf(shift);

  const chargeRate = opts.chargeGrid[dayType] ?? 0;
  const revenue = hours * chargeRate + km * opts.chargeMileageRate;

  const wages = pay.hours * pay.rate;
  const superAmount = wages * opts.superRate;
  const mileageCost = pay.km * payMileage;
  const cost = wages + superAmount + mileageCost;
  const profit = revenue - cost;

  return {
    dayType,
    hours,
    km,
    revenue,
    chargeRate,
    wages,
    super: superAmount,
    mileageCost,
    cost,
    profit,
    marginPct: revenue > 0 ? (profit / revenue) * 100 : null,
  };
}

export type MarginTotals = {
  shifts: number;
  hours: number;
  km: number;
  revenue: number;
  wages: number;
  super: number;
  mileageCost: number;
  cost: number;
  profit: number;
  marginPct: number | null;
};

export const emptyTotals = (): MarginTotals => ({
  shifts: 0,
  hours: 0,
  km: 0,
  revenue: 0,
  wages: 0,
  super: 0,
  mileageCost: 0,
  cost: 0,
  profit: 0,
  marginPct: null,
});

export function addMargin(t: MarginTotals, m: ShiftMargin): MarginTotals {
  const next = {
    shifts: t.shifts + 1,
    hours: t.hours + m.hours,
    km: t.km + m.km,
    revenue: t.revenue + m.revenue,
    wages: t.wages + m.wages,
    super: t.super + m.super,
    mileageCost: t.mileageCost + m.mileageCost,
    cost: t.cost + m.cost,
    profit: t.profit + m.profit,
    marginPct: null as number | null,
  };
  next.marginPct = next.revenue > 0 ? (next.profit / next.revenue) * 100 : null;
  return next;
}

export const aud = (n: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(n);

export const aud2 = (n: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(n);
