import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/tenant";
import { payrollBranchIds } from "@/lib/scope";
import { prisma } from "@/lib/prisma";
import { dateKey } from "@/lib/payroll";
import { buildPayReport } from "@/lib/payReport";
import { DAY_TYPE_LABELS, type DayType } from "@/lib/constants";
import { fmtInTz, tzForState } from "@/lib/timezone";
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
 *
 * Built from the same calculation as the report screen, so the spreadsheet can
 * never disagree with the figures on the page.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { tenant, session, scope } = await requireScope();
  const allowed = payrollBranchIds(scope);
  if (!isManager(session.role)) {
    return new NextResponse("Not authorised", { status: 403 });
  }

  const { id } = await params;
  const period = await prisma.payrollPeriod.findFirst({
    where: { id, tenantId: tenant.id, ...(allowed ? { branchId: { in: allowed } } : {}) },
    include: { branch: true },
  });
  if (!period) return new NextResponse("Not found", { status: 404 });

  const staffFilter = req.nextUrl.searchParams.get("staff") || null;
  const detail = req.nextUrl.searchParams.get("detail") === "1";
  const xero = req.nextUrl.searchParams.get("xero") === "1";

  const report = await buildPayReport(
    tenant.id,
    { startDate: period.startDate, endDate: period.endDate, branchId: period.branchId },
    { staffId: staffFilter },
  );

  // Period dates are labelled in the branch's zone; each shift in its own.
  const periodTz = tzForState(period.branch?.state ?? null);
  const money = (n: number) => n.toFixed(2);
  const dstr = (d: Date | string, tz: string) =>
    fmtInTz(new Date(d), tz, { day: "2-digit", month: "short", year: "numeric" });
  const tstr = (d: Date | string, tz: string) =>
    fmtInTz(new Date(d), tz, { hour: "numeric", minute: "2-digit" });

  const lines: string[] = [];
  lines.push(
    row([
      `Payroll ${dstr(period.startDate, periodTz)} - ${dstr(period.endDate, periodTz)}`,
      period.branch?.name ?? "No branch",
      report.states.join("/"),
      period.status,
    ]),
  );
  lines.push("");

  if (xero) {
    // One row per worker per earnings rate, the shape a payroll system wants.
    // Hours carry 4 decimals on purpose: the screen rounds them for reading,
    // and a rounded figure typed into Xero moves the total by a dollar or two.
    lines.push(
      row(["Worker", "Pay level", "Employment", "Earnings rate", "Hours / KM", "Rate", "Total $"]),
    );
    for (const r of report.rows) {
      for (const [band, hours] of Object.entries(r.bands)) {
        const rate = r.lines.find((l) => l.dayType === band)?.rate ?? 0;
        lines.push(
          row([
            r.name,
            r.level,
            r.employment,
            DAY_TYPE_LABELS[band as DayType] ?? band,
            hours.toFixed(4),
            money(rate),
            money(hours * rate),
          ]),
        );
      }
      if (r.km > 0) {
        lines.push(
          row([
            r.name,
            r.level,
            r.employment,
            "Transport",
            r.km.toFixed(4),
            money(r.kmPay / r.km),
            money(r.kmPay),
          ]),
        );
      }
      lines.push(row([r.name, "", "", "TOTAL", "", "", money(r.total)]));
    }
  } else if (detail) {
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
    for (const r of report.rows) {
      for (const l of r.lines) {
        lines.push(
          row([
            r.name,
            r.level,
            r.employment,
            dstr(l.startIso, l.tz),
            l.clientName,
            tstr(l.startIso, l.tz),
            tstr(l.endIso, l.tz),
            DAY_TYPE_LABELS[l.dayType as DayType] ?? l.dayType,
            l.hours.toFixed(2),
            money(l.rate),
            l.km.toFixed(1),
            money(l.kmPay),
            money(l.pay),
          ]),
        );
      }
    }
    lines.push("");
    lines.push(
      row([
        "TOTAL", "", "", "", "", "", "", "",
        report.totals.hours.toFixed(2),
        "",
        report.totals.km.toFixed(1),
        money(report.totals.kmPay),
        money(report.totals.total),
      ]),
    );
  } else {
    lines.push(
      row(["Worker", "Pay level", "Employment", "Shifts", "Hours", "KM", "Wages $", "Mileage $", "Total $"]),
    );
    for (const r of report.rows) {
      lines.push(
        row([
          r.name,
          r.level,
          r.employment,
          r.shifts,
          r.hours.toFixed(2),
          r.km.toFixed(1),
          money(r.wagePay),
          money(r.kmPay),
          money(r.total),
        ]),
      );
    }
    lines.push("");
    lines.push(
      row([
        "TOTAL", "", "", "",
        report.totals.hours.toFixed(2),
        report.totals.km.toFixed(1),
        money(report.totals.wagePay),
        money(report.totals.kmPay),
        money(report.totals.total),
      ]),
    );
  }

  const who = staffFilter
    ? (report.rows[0]?.name ?? "worker").replace(/\s+/g, "-").toLowerCase()
    : "all";
  const fname = `payroll_${dateKey(new Date(period.startDate), periodTz)}_${who}${detail ? "_detail" : ""}.csv`;

  // BOM so Excel opens UTF-8 cleanly.
  return new NextResponse("﻿" + lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fname}"`,
    },
  });
}
