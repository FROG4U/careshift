import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireScope } from "@/lib/tenant";
import { payrollBranchIds } from "@/lib/scope";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/format";
import { money } from "@/lib/payroll";
import { buildPayReport } from "@/lib/payReport";
import { isManager } from "@/lib/roles";
import { dateKeyInTz, tzForState } from "@/lib/timezone";
import { reopenPayrollPeriod } from "../actions";
import { CompleteRunsButton } from "../CompleteRunsButton";
import { PayrollTable } from "./PayrollTable";
import { ExportMenu, PrintTrigger } from "./ExportMenu";

export default async function PayrollReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { tenant, session, scope } = await requireScope();
  const allowed = payrollBranchIds(scope);
  if (!isManager(session.role)) {
    redirect("/dashboard");
  }

  const { id } = await params;
  const { print } = await searchParams;
  // print mode: "all" or a staff id -> hide chrome and auto-open the print
  // dialog (used by "Save as PDF").
  const printMode = print != null;
  const printStaff = print && print !== "all" ? print : null;
  const period = await prisma.payrollPeriod.findFirst({
    where: { id, tenantId: tenant.id, ...(allowed ? { branchId: { in: allowed } } : {}) },
    include: { branch: true },
  });
  if (!period) notFound();

  // The other branches' runs for the same pay period. This page only shows
  // one branch, which otherwise looks like half the timesheets are missing.
  const periodTz = tzForState(period.branch?.state ?? null);
  const periodKey = `${dateKeyInTz(period.startDate, periodTz)}|${dateKeyInTz(period.endDate, periodTz)}`;
  const DAY = 86_400_000;
  const siblings = period.branchId
    ? (
        await prisma.payrollPeriod.findMany({
          where: {
            tenantId: tenant.id,
            branchId: { not: null },
            id: { not: period.id },
            startDate: {
              gte: new Date(period.startDate.getTime() - DAY),
              lte: new Date(period.startDate.getTime() + DAY),
            },
          },
          select: {
            id: true,
            startDate: true,
            endDate: true,
            branch: { select: { name: true, state: true } },
          },
        })
      ).filter((r) => {
        const tz = tzForState(r.branch?.state ?? null);
        return `${dateKeyInTz(r.startDate, tz)}|${dateKeyInTz(r.endDate, tz)}` === periodKey;
      })
    : [];

  // The same calculation the CSV, the PDF and the worker's frozen copy use.
  const {
    rows: report,
    totals,
    shiftCount,
    pendingCount,
    holidayCount,
    states,
  } = await buildPayReport(
    tenant.id,
    { startDate: period.startDate, endDate: period.endDate, branchId: period.branchId },
    { staffId: printStaff },
  );

  const approved = period.status === "APPROVED";
  const anyUnrated = report.some((r) => r.unrated);
  const workerOptions = report.map((r) => ({ id: r.staffId, name: r.name }));
  const stateLabel = states.length ? ` (${states.join(", ")})` : "";

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto print-report">
      {printMode && <PrintTrigger />}
      {!printMode && (
        <Link
          href={`/payroll?branch=${period.branchId ?? "none"}`}
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
              {fmtDate(period.startDate)} - {fmtDate(period.endDate)}
            </h1>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                approved
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-700"
              }`}
            >
              {approved ? "completed" : "draft"}
            </span>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            {period.branch?.name ?? "No branch - covers every worker"}
            {stateLabel} · {report.length} worker{report.length === 1 ? "" : "s"} ·{" "}
            {shiftCount} approved shift{shiftCount === 1 ? "" : "s"}
            {holidayCount > 0
              ? ` · ${holidayCount} public holiday${holidayCount === 1 ? "" : "s"}`
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
            ) : period.branchId ? (
              <CompleteRunsButton
                ids={[period.id]}
                label="✓ Complete payroll"
                size="lg"
                confirmTitle="Complete this pay run?"
                confirmBody={`The figures below are frozen and each of the ${report.length} worker${report.length === 1 ? "" : "s"} is notified that their pay is ready. You can re-open it later if a timesheet needs correcting.`}
              />
            ) : null}
          </div>
        )}
      </header>

      {siblings.length > 0 && !printMode && (
        <div className="no-print mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <p className="flex-1">
            This is the <strong>{period.branch?.name}</strong> run only.{" "}
            {siblings.map((r) => r.branch?.name).join(" and ")}{" "}
            {siblings.length === 1 ? "has its own run" : "have their own runs"} for
            these dates.
          </p>
          <Link
            href={`/payroll/combined?ids=${[period.id, ...siblings.map((r) => r.id)].join(",")}`}
            className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-sky-800 shadow-sm"
          >
            See all branches together
          </Link>
        </div>
      )}

      {!period.branchId && !approved && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          This run has no branch, so it covers every worker in every branch. It
          was most likely left behind when a branch was deleted. It can&apos;t be
          completed - use the branch runs for these dates, and delete this one.
        </div>
      )}

      {pendingCount > 0 && !approved && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {pendingCount} shift{pendingCount === 1 ? " is" : "s are"} still awaiting
          approval and {pendingCount === 1 ? "is" : "are"} not included below.
          Approve or reject {pendingCount === 1 ? "it" : "them"} in Timesheets before
          completing, so nothing is left unpaid.
        </div>
      )}

      {/* Summary */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["Total hours", `${totals.hours.toFixed(2)} h`],
          ["Total mileage", `${totals.km.toFixed(1)} km`],
          ["Wages", money(totals.wagePay)],
          ["Total pay", money(totals.total)],
          [
            `Super ${(tenant.superRate * 100).toFixed(1)}%`,
            money(totals.wagePay * tenant.superRate),
          ],
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
          level has no rate for that stream/day). Those lines are costed at $0 -
          set the worker&apos;s pay level to fix.
        </div>
      )}

      {/* Worker report - click a worker to see their day-by-day detail */}
      <PayrollTable report={report} totals={totals} superRate={tenant.superRate} />

      {approved && (
        <p className="mt-3 text-xs text-emerald-700">
          Completed by {period.approvedBy} on {fmtDate(period.approvedAt)}.
        </p>
      )}
    </div>
  );
}
