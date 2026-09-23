import "server-only";
import { prisma } from "@/lib/prisma";
import {
  costShift,
  dateKey,
  MIN_ENGAGEMENT_HOURS,
  ENGAGEMENT_GAP_MIN,
} from "@/lib/payroll";
import { effectiveRates } from "@/lib/rates";
import { calendarDateKey, fmtInTz, tzForState } from "@/lib/timezone";
import type { DayLine, Totals, WorkerRow } from "@/lib/payReportTypes";

export type PayRunScope = {
  startDate: Date;
  endDate: Date;
  /** Null means every branch. */
  branchId: string | null;
};

export type PayReport = {
  rows: WorkerRow[];
  totals: Totals;
  shiftCount: number;
  /**
   * Completed in the window but still awaiting approval. These are NOT paid,
   * and are counted so the office can see work is waiting rather than
   * wondering why a total looks light.
   */
  pendingCount: number;
  holidayCount: number;
  /** Distinct states the paid shifts fell in, for the header. */
  states: string[];
};

/**
 * The one calculation behind every view of a pay run.
 *
 * This used to be written out three times - report screen, CSV export and PDF
 * - and a worker's frozen copy would have made four. Copies drift, and on a
 * payroll a drift is someone being paid a different figure from the one on the
 * report you signed off.
 *
 * Two rules that matter:
 *
 * - Only APPROVED shifts are paid. The old queries only checked COMPLETED, so
 *   rejecting a timesheet had no effect on pay - which contradicted the worker
 *   guide, where we tell them an unapproved shift can't go into a pay run.
 *
 * - Every shift is costed in its OWN branch's timezone, with its own state's
 *   public holidays. A run with no branch used to cost everything in one zone
 *   with one state's holidays, so Sydney shifts in it would miss NSW public
 *   holidays and be paid at the ordinary rate.
 */
export async function buildPayReport(
  tenantId: string,
  scope: PayRunScope,
  opts: { staffId?: string | null } = {},
): Promise<PayReport> {
  const window = { gte: scope.startDate, lte: scope.endDate };
  const branchWhere = scope.branchId ? { branchId: scope.branchId } : {};
  const staffWhere = opts.staffId ? opts.staffId : { not: null };

  const [shifts, pendingCount, holidayRows] = await Promise.all([
    prisma.shift.findMany({
      where: {
        tenantId,
        status: "COMPLETED",
        approval: "APPROVED",
        staffId: staffWhere,
        ...branchWhere,
        start: window,
      },
      // Only what pay depends on. Selecting every column would tie the payroll
      // query to unrelated fields - notes, handovers, GPS reasons - and break
      // it whenever one is added before the database has caught up.
      select: {
        id: true,
        start: true,
        end: true,
        clockInAt: true,
        clockOutAt: true,
        approvedEnd: true,
        mileageKm: true,
        branchId: true,
        client: { select: { agreementType: true, firstName: true, lastName: true } },
        pauses: { select: { startAt: true, endAt: true } },
        transports: { select: { km: true } },
        branch: { select: { state: true } },
        staff: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employmentType: true,
            payLevel: {
              select: {
                name: true,
                mileageRate: true,
                rates: { select: { stream: true, dayType: true, rate: true } },
              },
            },
            rateOverrides: { select: { stream: true, dayType: true, rate: true } },
          },
        },
      },
      orderBy: { start: "asc" },
    }),
    // Rejected shifts are deliberately unpaid, so only PENDING counts as work
    // waiting on someone.
    prisma.shift.count({
      where: {
        tenantId,
        status: "COMPLETED",
        approval: "PENDING",
        staffId: staffWhere,
        ...branchWhere,
        start: window,
      },
    }),
    prisma.publicHoliday.findMany({ where: { tenantId, date: window } }),
  ]);

  // Holidays that apply to a shift: national ones, its state's, and any
  // pinned to its branch. Built once per state/branch pair, not per shift.
  const usedHolidayIds = new Set<string>();
  const holidayCache = new Map<
    string,
    { keys: Set<string>; names: Map<string, string> }
  >();
  const holidaysFor = (state: string | null, branchId: string | null) => {
    const cacheKey = `${state ?? ""}|${branchId ?? ""}`;
    const hit = holidayCache.get(cacheKey);
    if (hit) return hit;
    const applies = holidayRows.filter(
      (h) =>
        (h.state == null && h.branchId == null) ||
        (state != null && h.state === state) ||
        (branchId != null && h.branchId === branchId),
    );
    for (const h of applies) usedHolidayIds.add(h.id);
    const built = {
      keys: new Set(applies.map((h) => calendarDateKey(h.date))),
      names: new Map(applies.map((h) => [calendarDateKey(h.date), h.name])),
    };
    holidayCache.set(cacheKey, built);
    return built;
  };

  const rows = new Map<string, WorkerRow>();
  const states = new Set<string>();

  for (const s of shifts) {
    if (!s.staff) continue;
    const state = s.branch?.state ?? null;
    if (state) states.add(state);
    const tz = tzForState(state);
    const holidays = holidaysFor(state, s.branchId);

    // Award level, with any manual per-worker override applied.
    const { grid, mileageRate } = effectiveRates(s.staff);
    const line = costShift(
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
      grid,
      s.staff.employmentType,
      mileageRate,
      holidays.keys,
      tz,
    );

    const start = new Date(s.start);
    const end = new Date(s.end);
    const time = (d: Date) => fmtInTz(d, tz, { hour: "numeric", minute: "2-digit" });

    // Time past the rostered finish that the office authorised, and the pay
    // run therefore includes (see paidWindowOf).
    const extraHours =
      s.approvedEnd && s.clockOutAt && s.approvedEnd > s.end
        ? Math.max(
            0,
            (Math.min(s.clockOutAt.getTime(), s.approvedEnd.getTime()) -
              s.end.getTime()) /
              3600000,
          )
        : 0;

    const dayLine: DayLine = {
      id: s.id,
      dateLabel: fmtInTz(start, tz, { weekday: "short", day: "numeric", month: "short" }),
      timeLabel: `${time(start)} - ${time(end)}`,
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      tz,
      clientName: `${s.client.firstName} ${s.client.lastName}`,
      dayType: line.dayType,
      holidayName: holidays.names.get(dateKey(start, tz)) ?? null,
      hours: line.hours,
      extraHours: extraHours > 0 ? extraHours : undefined,
      rate: line.rate,
      km: line.km,
      kmPay: line.km * mileageRate,
      pay: line.pay,
    };

    const key = s.staff.id;
    const row: WorkerRow = rows.get(key) ?? {
      staffId: key,
      name: `${s.staff.firstName} ${s.staff.lastName}`,
      level: s.staff.payLevel?.name ?? "No level",
      employment: s.staff.employmentType,
      shifts: 0,
      hours: 0,
      km: 0,
      wagePay: 0,
      kmPay: 0,
      total: 0,
      bands: {},
      unrated: false,
      lines: [],
    };

    row.lines.push(dayLine);
    row.shifts += 1;
    if (line.rate === 0) row.unrated = true;
    rows.set(key, row);
  }

  // Minimum engagement, then the totals.
  //
  // Done here rather than per shift because the minimum belongs to the
  // ENGAGEMENT: two calls half an hour apart are one attendance, and topping
  // each up to 2 hours would pay four hours for one short morning. Shifts
  // within ENGAGEMENT_GAP_MIN of each other are treated as one run, and only
  // a run that comes to less than the minimum is topped up - on its first
  // line, at that line's rate.
  for (const row of rows.values()) {
    row.lines.sort((a, b) => a.startIso.localeCompare(b.startIso));

    let i = 0;
    while (i < row.lines.length) {
      let j = i;
      while (
        j + 1 < row.lines.length &&
        new Date(row.lines[j + 1].startIso).getTime() -
          new Date(row.lines[j].endIso).getTime() <=
          ENGAGEMENT_GAP_MIN * 60_000
      ) {
        j += 1;
      }
      const run = row.lines.slice(i, j + 1);
      const worked = run.reduce((n, l) => n + l.hours, 0);
      // Nothing worked means nobody attended, so there is no engagement to
      // pay a minimum on.
      if (worked > 0 && worked < MIN_ENGAGEMENT_HOURS) {
        const top = MIN_ENGAGEMENT_HOURS - worked;
        const first = run[0];
        first.topUpHours = top;
        first.hours += top;
        first.pay = first.hours * first.rate + first.kmPay;
      }
      i = j + 1;
    }

    for (const l of row.lines) {
      row.hours += l.hours;
      row.km += l.km;
      row.wagePay += l.hours * l.rate;
      row.kmPay += l.kmPay;
      row.total += l.pay;
      row.bands[l.dayType] = (row.bands[l.dayType] ?? 0) + l.hours;
    }
  }

  const report = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
  const totals = report.reduce<Totals>(
    (t, r) => ({
      hours: t.hours + r.hours,
      km: t.km + r.km,
      wagePay: t.wagePay + r.wagePay,
      kmPay: t.kmPay + r.kmPay,
      total: t.total + r.total,
    }),
    { hours: 0, km: 0, wagePay: 0, kmPay: 0, total: 0 },
  );

  return {
    rows: report,
    totals,
    shiftCount: shifts.length,
    pendingCount,
    holidayCount: usedHolidayIds.size,
    states: [...states].sort(),
  };
}
