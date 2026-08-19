import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { costShift, dateKey } from "@/lib/payroll";
import { effectiveRates } from "@/lib/rates";
import { DAY_TYPE_LABELS, type DayType } from "@/lib/constants";
import { calendarDateKey, fmtInTz, tzForState } from "@/lib/timezone";

import { isManager } from "@/lib/roles";
/** Escape a CSV cell (quote if it contains comma, quote or newline). */
function cell(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const row = (cells: (string | number)[]) => cells.map(cell).join(",");

/**
 * GET /payroll/:id/export?staff=<id?>&detail=1
 * Streams the pay run as CSV. `staff` limits to one worker; `detail=1` adds a
 * line per shift, otherwise it's one summary row per worker.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { tenant, session } = await requireTenant();
  if (!isManager(session.role)) {
    return new NextResponse("Not authorised", { status: 403 });
  }

  const { id } = await params;
  const period = await prisma.payrollPeriod.findFirst({
    where: { id, tenantId: tenant.id },
    include: { branch: true },
  });
  if (!period) return new NextResponse("Not found", { status: 404 });

  const staffFilter = req.nextUrl.searchParams.get("staff") || undefined;
  const detail = req.nextUrl.searchParams.get("detail") === "1";

  const shifts = await prisma.shift.findMany({
    where: {
      tenantId: tenant.id,
      status: "COMPLETED",
      staffId: staffFilter ? staffFilter : { not: null },
      ...(period.branchId ? { branchId: period.branchId } : {}),
      start: { gte: period.startDate, lte: period.endDate },
    },
    include: {
      client: true,
      pauses: true,
      transports: true,
      staff: { include: { payLevel: { include: { rates: true } }, rateOverrides: true } },
    },
    orderBy: [{ staffId: "asc" }, { start: "asc" }],
  });

  // Public holidays for this branch's state (same rule as the report).
  const branchState = period.branch?.state ?? null;
  const holidayRows = await prisma.publicHoliday.findMany({
    where: {
      tenantId: tenant.id,
      date: { gte: period.startDate, lte: period.endDate },
      OR: [
        { state: null, branchId: null },
        ...(branchState ? [{ state: branchState }] : []),
        ...(period.branchId ? [{ branchId: period.branchId }] : []),
      ],
    },
  });
  // Branch-local time drives the bands and the times printed in the export.
  const tz = tzForState(branchState);
  const holidays = new Set(holidayRows.map((h) => calendarDateKey(h.date)));

  const money = (n: number) => n.toFixed(2);
  const dstr = (d: Date) =>
    fmtInTz(new Date(d), tz, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  const tstr = (d: Date) =>
    fmtInTz(new Date(d), tz, { hour: "numeric", minute: "2-digit" });

  const lines: string[] = [];
  lines.push(
    row([
      `Payroll ${dstr(period.startDate)} - ${dstr(period.endDate)}`,
      period.branch?.name ?? "All branches",
      branchState ?? "",
      period.status,
    ]),
  );
  lines.push("");

  if (detail) {
    lines.push(
      row([
        "Worker",
        "Pay level",
        "Employment",
        "Date",
        "Participant",
        "Rostered start",
        "Rostered end",
        "Band",
        "Hours",
        "Rate",
        "KM",
        "Mileage $",
        "Pay $",
      ]),
    );
  } else {
    lines.push(
      row([
        "Worker",
        "Pay level",
        "Employment",
        "Shifts",
        "Hours",
        "KM",
        "Wages $",
        "Mileage $",
        "Total $",
      ]),
    );
  }

  // Aggregate per worker.
  type Agg = {
    name: string;
    level: string;
    emp: string;
    shifts: number;
    hours: number;
    km: number;
    wages: number;
    mileage: number;
    total: number;
  };
  const agg = new Map<string, Agg>();
  let gHours = 0,
    gKm = 0,
    gWages = 0,
    gMileage = 0,
    gTotal = 0;

  for (const s of shifts) {
    if (!s.staff) continue;
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
      holidays,
      tz,
    );
    const name = `${s.staff.firstName} ${s.staff.lastName}`;
    const level = s.staff.payLevel?.name ?? "No level";
    const mileagePay = line.km * mileageRate;
    const wages = line.hours * line.rate;

    if (detail) {
      lines.push(
        row([
          name,
          level,
          s.staff.employmentType,
          dstr(s.start),
          `${s.client.firstName} ${s.client.lastName}`,
          tstr(s.start),
          tstr(s.end),
          DAY_TYPE_LABELS[line.dayType as DayType] ?? line.dayType,
          line.hours.toFixed(2),
          money(line.rate),
          line.km.toFixed(1),
          money(mileagePay),
          money(line.pay),
        ]),
      );
    }

    const a =
      agg.get(s.staff.id) ??
      ({
        name,
        level,
        emp: s.staff.employmentType,
        shifts: 0,
        hours: 0,
        km: 0,
        wages: 0,
        mileage: 0,
        total: 0,
      } as Agg);
    a.shifts += 1;
    a.hours += line.hours;
    a.km += line.km;
    a.wages += wages;
    a.mileage += mileagePay;
    a.total += line.pay;
    agg.set(s.staff.id, a);

    gHours += line.hours;
    gKm += line.km;
    gWages += wages;
    gMileage += mileagePay;
    gTotal += line.pay;
  }

  if (!detail) {
    for (const a of [...agg.values()].sort((x, y) => x.name.localeCompare(y.name))) {
      lines.push(
        row([
          a.name,
          a.level,
          a.emp,
          a.shifts,
          a.hours.toFixed(2),
          a.km.toFixed(1),
          money(a.wages),
          money(a.mileage),
          money(a.total),
        ]),
      );
    }
    lines.push("");
    lines.push(
      row([
        "TOTAL",
        "",
        "",
        "",
        gHours.toFixed(2),
        gKm.toFixed(1),
        money(gWages),
        money(gMileage),
        money(gTotal),
      ]),
    );
  } else {
    lines.push("");
    lines.push(
      row([
        "TOTAL",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        gHours.toFixed(2),
        "",
        gKm.toFixed(1),
        money(gMileage),
        money(gTotal),
      ]),
    );
  }

  const who = staffFilter
    ? ([...agg.values()][0]?.name ?? "worker").replace(/\s+/g, "-").toLowerCase()
    : "all";
  const fname = `payroll_${dateKey(new Date(period.startDate), tz)}_${who}${detail ? "_detail" : ""}.csv`;

  // BOM so Excel opens UTF-8 cleanly.
  return new NextResponse("﻿" + lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fname}"`,
    },
  });
}
