import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/format";
import { costShift, dateKey, money, type RateGrid } from "@/lib/payroll";
import { approvePayrollPeriod, reopenPayrollPeriod } from "../actions";
import {
  PayrollTable,
  type WorkerRow,
  type DayLine,
} from "./PayrollTable";
import { ExportMenu, PrintTrigger } from "./ExportMenu";

export default async function PayrollReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { tenant, session } = await requireTenant();
  if (session.role !== "ADMIN" && session.role !== "COORDINATOR") {
    redirect("/dashboard");
  }

  const { id } = await params;
  const { print } = await searchParams;
  // print mode: "all" or a staff id → hide chrome and auto-open the print
  // dialog (used by "Save as PDF").
  const printMode = print != null;
  const printStaff = print && print !== "all" ? print : null;
  const period = await prisma.payrollPeriod.findFirst({
    where: { id, tenantId: tenant.id },
    include: { branch: true },
  });
  if (!period) notFound();

  // Completed shifts in the window for this branch.
  const shifts = await prisma.shift.findMany({
    where: {
      tenantId: tenant.id,
      status: "COMPLETED",
      staffId: printStaff ? printStaff : { not: null },
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
  });

  // Public holidays in this window. Holidays differ by state, so we take the
  // national ones (state = null) plus any for this branch's state, and any
  // pinned directly to this branch.
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
  const holidays = new Set(holidayRows.map((h) => dateKey(new Date(h.date))));
  const holidayName = new Map(
    holidayRows.map((h) => [dateKey(new Date(h.date)), h.name]),
  );

  const dayLabel = (d: Date) =>
    d.toLocaleDateString("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  const timeLabel = (a: Date, b: Date) =>
    `${a.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })} – ${b.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}`;

  // Roll up per worker.
  const rows = new Map<string, WorkerRow>();

  for (const s of shifts) {
    if (!s.staff) continue;
    const grid: RateGrid = {};
    for (const r of s.staff.payLevel?.rates ?? [])
      grid[`${r.stream}_${r.dayType}`] = r.rate;
    const mileageRate = s.staff.payLevel?.mileageRate ?? 0;

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
    );

    const key = s.staff.id;
    const row =
      rows.get(key) ??
      ({
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
        lines: [] as DayLine[],
      } as WorkerRow);

    row.lines.push({
      id: s.id,
      dateLabel: dayLabel(new Date(s.start)),
      timeLabel: timeLabel(new Date(s.start), new Date(s.end)),
      clientName: `${s.client.firstName} ${s.client.lastName}`,
      dayType: line.dayType,
      holidayName: holidayName.get(dateKey(new Date(s.start))) ?? null,
      hours: line.hours,
      rate: line.rate,
      km: line.km,
      kmPay: line.km * mileageRate,
      pay: line.pay,
    });

    row.shifts += 1;
    row.hours += line.hours;
    row.km += line.km;
    row.wagePay += line.hours * line.rate;
    row.kmPay += line.km * mileageRate;
    row.total += line.pay;
    row.bands[line.dayType] = (row.bands[line.dayType] ?? 0) + line.hours;
    if (line.rate === 0) row.unrated = true;
    rows.set(key, row);
  }

  const report = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
  const totals = report.reduce(
    (t, r) => ({
      hours: t.hours + r.hours,
      km: t.km + r.km,
      wagePay: t.wagePay + r.wagePay,
      kmPay: t.kmPay + r.kmPay,
      total: t.total + r.total,
    }),
    { hours: 0, km: 0, wagePay: 0, kmPay: 0, total: 0 },
  );

  const approved = period.status === "APPROVED";
  const anyUnrated = report.some((r) => r.unrated);

  const workerOptions = report.map((r) => ({ id: r.staffId, name: r.name }));

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto print-report">
      {printMode && <PrintTrigger />}
      {!printMode && (
        <Link
          href={`/payroll?branch=${period.branchId ?? ""}`}
          className="no-print mb-3 inline-flex items-center gap-1 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <span className="material-symbols-rounded text-[18px]">arrow_back</span>
          Payroll periods
        </Link>
      )}

      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              {fmtDate(period.startDate)} – {fmtDate(period.endDate)}
            </h1>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                approved
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-700"
              }`}
            >
              {period.status.toLowerCase()}
            </span>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            {period.branch?.name ?? "All branches"}
            {branchState ? ` (${branchState})` : ""} ·{" "}
            {report.length} worker{report.length === 1 ? "" : "s"} ·{" "}
            {shifts.length} completed shift{shifts.length === 1 ? "" : "s"}
            {holidayRows.length > 0
              ? ` · ${holidayRows.length} public holiday${holidayRows.length === 1 ? "" : "s"}`
              : ""}
          </p>
        </div>

        {!printMode && (
          <div className="no-print flex items-center gap-2">
            <ExportMenu periodId={period.id} workers={workerOptions} />
            {approved ? (
              <form action={reopenPayrollPeriod}>
                <input type="hidden" name="id" value={period.id} />
                <button className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--background)]">
                  Re-open
                </button>
              </form>
            ) : (
              <form action={approvePayrollPeriod}>
                <input type="hidden" name="id" value={period.id} />
                <button
                  disabled={report.length === 0}
                  className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
                >
                  ✓ Accept payroll
                </button>
              </form>
            )}
          </div>
        )}
      </header>

      {/* Summary */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Total hours", `${totals.hours.toFixed(2)} h`],
          ["Total mileage", `${totals.km.toFixed(1)} km`],
          ["Wages", money(totals.wagePay)],
          ["Total pay", money(totals.total)],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm"
          >
            <div className="text-xl font-bold text-[var(--text-primary)]">
              {value}
            </div>
            <div className="text-xs text-[var(--text-secondary)]">{label}</div>
          </div>
        ))}
      </div>

      {anyUnrated && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Some shifts have no matching rate (worker has no pay level, or the
          level has no rate for that stream/day). Those lines are costed at $0 —
          set the worker&apos;s pay level to fix.
        </div>
      )}

      {/* Worker report — click a worker to see their day-by-day detail */}
      <PayrollTable report={report} totals={totals} />

      {approved && (
        <p className="mt-3 text-xs text-emerald-700">
          Approved by {period.approvedBy} on {fmtDate(period.approvedAt)}.
        </p>
      )}
    </div>
  );
}
