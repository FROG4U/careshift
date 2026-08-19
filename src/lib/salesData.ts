import "server-only";
import { prisma } from "./prisma";
import { calendarDateKey, tzForState } from "./timezone";
import {
  addMargin,
  chargeRatesFor,
  emptyTotals,
  marginFor,
  type MarginTotals,
  type ShiftMargin,
} from "./billing";

/**
 * Loads completed shifts for a period and costs each one — revenue, worker
 * cost (wages + super + mileage) and profit.
 *
 * Both the participant's budget view and the Sales dashboard read from here,
 * so a client's remaining budget and the company's revenue can never be
 * computed two different ways.
 */

export type PricedShift = {
  id: string;
  start: Date;
  end: Date;
  clientId: string;
  clientName: string;
  agreementType: string;
  staffId: string | null;
  staffName: string;
  branchName: string | null;
  margin: ShiftMargin;
  /** True when the participant has no charge rate for this band. */
  unrated: boolean;
};

export async function loadPricedShifts(opts: {
  tenantId: string;
  from: Date;
  to: Date;
  clientId?: string;
  branchId?: string;
}): Promise<{ shifts: PricedShift[]; totals: MarginTotals }> {
  const { tenantId, from, to, clientId, branchId } = opts;

  const [tenant, rawShifts, defaults, holidayRows] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { superRate: true },
    }),
    prisma.shift.findMany({
      where: {
        tenantId,
        status: "COMPLETED",
        ...(clientId ? { clientId } : {}),
        ...(branchId ? { branchId } : {}),
        start: { gte: from, lte: to },
      },
      include: {
        client: true,
        pauses: true,
        transports: true,
        branch: { select: { name: true, state: true } },
        staff: { include: { payLevel: { include: { rates: true } }, rateOverrides: true } },
      },
      orderBy: { start: "asc" },
    }),
    prisma.chargeDefault.findMany({ where: { tenantId } }),
    prisma.publicHoliday.findMany({
      where: { tenantId, date: { gte: from, lte: to } },
    }),
  ]);

  const superRate = tenant?.superRate ?? 0.12;

  // Holiday keys per state: national rows (state null) apply everywhere.
  const nationalKeys = holidayRows
    .filter((h) => h.state == null)
    .map((h) => calendarDateKey(h.date));
  const holidaysByState = new Map<string, Set<string>>();
  const holidaysFor = (state: string | null | undefined) => {
    const key = state ?? "__none__";
    let set = holidaysByState.get(key);
    if (!set) {
      set = new Set([
        ...nationalKeys,
        ...holidayRows
          .filter((h) => state != null && h.state === state)
          .map((h) => calendarDateKey(h.date)),
      ]);
      holidaysByState.set(key, set);
    }
    return set;
  };

  let totals = emptyTotals();
  const shifts: PricedShift[] = [];

  for (const s of rawShifts) {
    if (!s.staff) continue; // unassigned shift — nothing to cost

    const { grid, mileageRate } = chargeRatesFor(s.client, defaults);
    const tz = tzForState(s.branch?.state);

    const margin = marginFor(
      {
        start: s.start,
        end: s.end,
        clockInAt: s.clockInAt,
        clockOutAt: s.clockOutAt,
        mileageKm: s.mileageKm,
        client: { agreementType: s.client.agreementType },
        pauses: s.pauses,
        transports: s.transports,
      },
      {
        staff: s.staff,
        chargeGrid: grid,
        chargeMileageRate: mileageRate,
        superRate,
        holidays: holidaysFor(s.branch?.state),
        tz,
      },
    );

    shifts.push({
      id: s.id,
      start: s.start,
      end: s.end,
      clientId: s.clientId,
      clientName: `${s.client.firstName} ${s.client.lastName}`,
      agreementType: s.client.agreementType,
      staffId: s.staffId,
      staffName: `${s.staff.firstName} ${s.staff.lastName}`,
      branchName: s.branch?.name ?? null,
      margin,
      unrated: margin.chargeRate === 0,
    });
    totals = addMargin(totals, margin);
  }

  return { shifts, totals };
}

/** Roll priced shifts up by a key (client, worker, week, month…). */
export function groupTotals<T extends string>(
  shifts: PricedShift[],
  keyOf: (s: PricedShift) => T,
): Map<T, MarginTotals> {
  const out = new Map<T, MarginTotals>();
  for (const s of shifts) {
    const key = keyOf(s);
    out.set(key, addMargin(out.get(key) ?? emptyTotals(), s.margin));
  }
  return out;
}

/** A participant's budget position, all-time. */
export async function budgetFor(tenantId: string, clientId: string) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, tenantId },
    select: { budget: true, planStart: true, planEnd: true },
  });

  const from = client?.planStart ?? new Date(2000, 0, 1);
  const to = client?.planEnd ?? new Date(2100, 0, 1);

  const { totals } = await loadPricedShifts({ tenantId, from, to, clientId });

  // Rostered but not yet delivered — money already committed against the plan.
  const upcoming = await prisma.shift.count({
    where: {
      tenantId,
      clientId,
      status: { in: ["SCHEDULED", "IN_PROGRESS"] },
      start: { gte: new Date() },
    },
  });

  const budget = client?.budget ?? 0;
  const spent = totals.revenue;
  const remaining = budget - spent;

  return {
    budget,
    spent,
    remaining,
    usedPct: budget > 0 ? Math.min(100, (spent / budget) * 100) : null,
    upcomingShifts: upcoming,
    totals,
    planStart: client?.planStart ?? null,
    planEnd: client?.planEnd ?? null,
  };
}
