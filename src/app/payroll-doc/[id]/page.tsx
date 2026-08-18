import { notFound, redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/format";
import { costShift, dateKey, money } from "@/lib/payroll";
import { effectiveRates } from "@/lib/rates";
import { DAY_TYPE_LABELS, type DayType } from "@/lib/constants";
import { calendarDateKey, tzForState } from "@/lib/timezone";
import { AutoPrint } from "./AutoPrint";

import { isManager } from "@/lib/roles";
/**
 * Standalone, print-ready payroll document. Lives OUTSIDE the (app) layout, so
 * there is no sidebar or notification bar — what you see is the whole page,
 * ready to Save as PDF. ?staff=<id> limits it to one worker.
 */
export default async function PayrollDoc({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ staff?: string }>;
}) {
  // Outside the (app) layout, so an auth failure would surface as a 500
  // rather than a login prompt.
  const ctx = await requireTenant().catch(() => null);
  if (!ctx) redirect("/login");
  const { tenant, session } = ctx;
  if (!isManager(session.role)) {
    redirect("/dashboard");
  }

  const { id } = await params;
  const { staff: staffFilter } = await searchParams;

  const period = await prisma.payrollPeriod.findFirst({
    where: { id, tenantId: tenant.id },
    include: { branch: true },
  });
  if (!period) notFound();

  const branchState = period.branch?.state ?? null;

  const [shifts, holidayRows] = await Promise.all([
    prisma.shift.findMany({
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
        staff: { include: { payLevel: { include: { rates: true } } } },
      },
      orderBy: { start: "asc" },
    }),
    prisma.publicHoliday.findMany({
      where: {
        tenantId: tenant.id,
        date: { gte: period.startDate, lte: period.endDate },
        OR: [
          { state: null, branchId: null },
          ...(branchState ? [{ state: branchState }] : []),
          ...(period.branchId ? [{ branchId: period.branchId }] : []),
        ],
      },
    }),
  ]);
  // Penalty bands are decided in this branch's local time, not the server's.
  const tz = tzForState(branchState);
  const holidays = new Set(holidayRows.map((h) => calendarDateKey(h.date)));

  type Row = {
    name: string;
    level: string;
    emp: string;
    shifts: number;
    hours: number;
    km: number;
    wages: number;
    mileage: number;
    total: number;
    bands: Record<string, number>;
  };
  const rows = new Map<string, Row>();
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
    const key = s.staff.id;
    const r =
      rows.get(key) ??
      ({
        name: `${s.staff.firstName} ${s.staff.lastName}`,
        level: s.staff.payLevel?.name ?? "No level",
        emp: s.staff.employmentType,
        shifts: 0,
        hours: 0,
        km: 0,
        wages: 0,
        mileage: 0,
        total: 0,
        bands: {},
      } as Row);
    r.shifts += 1;
    r.hours += line.hours;
    r.km += line.km;
    r.wages += line.hours * line.rate;
    r.mileage += line.km * mileageRate;
    r.total += line.pay;
    r.bands[line.dayType] = (r.bands[line.dayType] ?? 0) + line.hours;
    rows.set(key, r);
  }

  const report = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
  const totals = report.reduce(
    (t, r) => ({
      hours: t.hours + r.hours,
      km: t.km + r.km,
      wages: t.wages + r.wages,
      mileage: t.mileage + r.mileage,
      total: t.total + r.total,
    }),
    { hours: 0, km: 0, wages: 0, mileage: 0, total: 0 },
  );

  const brand = tenant.brandColor || "#2563a8";
  const generated = new Date().toLocaleString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="mx-auto max-w-[900px] bg-white px-10 py-8 text-slate-900">
      <AutoPrint />

      {/* Letterhead */}
      <header className="mb-6 flex items-start justify-between border-b-2 pb-5" style={{ borderColor: brand }}>
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl text-lg font-bold text-white"
            style={{ background: brand }}
          >
            {tenant.name[0]}
          </div>
          <div>
            <div className="text-lg font-bold leading-tight">{tenant.name}</div>
            <div className="text-xs text-slate-500">Payroll Report</div>
          </div>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div>Generated {generated}</div>
          <div>By {session.name}</div>
          <div className="mt-1">
            <span
              className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                period.status === "APPROVED"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {period.status}
            </span>
          </div>
        </div>
      </header>

      {/* Period meta */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">
          {fmtDate(period.startDate)} – {fmtDate(period.endDate)}
        </h1>
        <p className="text-sm text-slate-600">
          {period.branch?.name ?? "All branches"}
          {branchState ? ` (${branchState})` : ""} · {report.length} worker
          {report.length === 1 ? "" : "s"} · {shifts.length} completed shift
          {shifts.length === 1 ? "" : "s"}
          {holidayRows.length
            ? ` · ${holidayRows.length} public holiday${holidayRows.length === 1 ? "" : "s"}`
            : ""}
        </p>
      </div>

      {/* Summary tiles */}
      <div className="mb-6 grid grid-cols-4 gap-3">
        {[
          ["Total hours", `${totals.hours.toFixed(2)} h`],
          ["Total mileage", `${totals.km.toFixed(1)} km`],
          ["Wages", money(totals.wages)],
          ["Total pay", money(totals.total)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 p-3">
            <div className="text-lg font-bold">{value}</div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y border-slate-300 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <th className="py-2 pr-3 font-semibold">Worker</th>
            <th className="py-2 px-2 text-right font-semibold">Shifts</th>
            <th className="py-2 px-2 text-right font-semibold">Hours</th>
            <th className="py-2 px-2 font-semibold">Breakdown</th>
            <th className="py-2 px-2 text-right font-semibold">KM</th>
            <th className="py-2 px-2 text-right font-semibold">Wages</th>
            <th className="py-2 px-2 text-right font-semibold">Mileage</th>
            <th className="py-2 pl-2 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {report.map((r) => (
            <tr key={r.name} className="border-b border-slate-200 align-top">
              <td className="py-2.5 pr-3">
                <div className="font-semibold">{r.name}</div>
                <div className="text-[11px] text-slate-500">
                  {r.level}
                  {r.emp === "CASUAL" ? " · Casual" : ""}
                </div>
              </td>
              <td className="py-2.5 px-2 text-right tabular-nums">{r.shifts}</td>
              <td className="py-2.5 px-2 text-right font-semibold tabular-nums">
                {r.hours.toFixed(2)}
              </td>
              <td className="py-2.5 px-2 text-[11px] text-slate-600">
                {Object.entries(r.bands)
                  .map(
                    ([b, h]) =>
                      `${DAY_TYPE_LABELS[b as DayType] ?? b} ${h.toFixed(1)}h`,
                  )
                  .join(" · ")}
              </td>
              <td className="py-2.5 px-2 text-right tabular-nums">
                {r.km.toFixed(1)}
              </td>
              <td className="py-2.5 px-2 text-right tabular-nums">
                {money(r.wages)}
              </td>
              <td className="py-2.5 px-2 text-right tabular-nums">
                {money(r.mileage)}
              </td>
              <td className="py-2.5 pl-2 text-right font-bold tabular-nums">
                {money(r.total)}
              </td>
            </tr>
          ))}
          {report.length === 0 && (
            <tr>
              <td colSpan={8} className="py-8 text-center text-slate-400">
                No completed shifts in this period.
              </td>
            </tr>
          )}
        </tbody>
        {report.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-slate-400 font-bold">
              <td className="py-2.5 pr-3">Totals</td>
              <td />
              <td className="py-2.5 px-2 text-right tabular-nums">
                {totals.hours.toFixed(2)}
              </td>
              <td />
              <td className="py-2.5 px-2 text-right tabular-nums">
                {totals.km.toFixed(1)}
              </td>
              <td className="py-2.5 px-2 text-right tabular-nums">
                {money(totals.wages)}
              </td>
              <td className="py-2.5 px-2 text-right tabular-nums">
                {money(totals.mileage)}
              </td>
              <td className="py-2.5 pl-2 text-right tabular-nums">
                {money(totals.total)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>

      {/* Sign-off */}
      <div className="mt-10 grid grid-cols-2 gap-10 text-xs text-slate-600">
        <div>
          <div className="mb-8 border-b border-slate-400" />
          Prepared by — {session.name}
        </div>
        <div>
          <div className="mb-8 border-b border-slate-400" />
          Approved by / date
        </div>
      </div>

      <footer className="mt-8 border-t border-slate-200 pt-3 text-[10px] text-slate-400">
        {tenant.name} · Payroll {fmtDate(period.startDate)}–{fmtDate(period.endDate)} ·
        Generated {generated}. Rates are calculated from SCHADS pay levels and
        recorded clock times; verify against your award before payment.
      </footer>
    </div>
  );
}
