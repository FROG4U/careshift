import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/format";
import { money } from "@/lib/payroll";
import { buildPayReport } from "@/lib/payReport";
import { isManager } from "@/lib/roles";
import type { Totals, WorkerRow } from "@/lib/payReportTypes";
import { CompleteRunsButton } from "../CompleteRunsButton";
import { PayrollTable } from "../[id]/PayrollTable";

/**
 * Every branch's run for one pay period, on one screen.
 *
 * Each branch keeps its own run (costed in its own state), so opening one run
 * only ever shows that branch's shifts - which reads as "the pay run isn't
 * pulling all the timesheets". This puts them back together: every worker,
 * every approved shift in the period, one set of totals.
 *
 * Nothing is recalculated differently here: each run goes through the same
 * buildPayReport as its own page, and the rows are merged by worker (someone
 * can work in both branches).
 */
export default async function CombinedPayRunPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { tenant, session } = await requireTenant();
  if (!isManager(session.role)) redirect("/dashboard");

  const { ids } = await searchParams;
  const wanted = (ids ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const runs = await prisma.payrollPeriod.findMany({
    where: { tenantId: tenant.id, id: { in: wanted }, branchId: { not: null } },
    include: { branch: { select: { name: true } } },
  });
  if (runs.length === 0) notFound();
  runs.sort((a, b) => (a.branch?.name ?? "").localeCompare(b.branch?.name ?? ""));

  const reports = await Promise.all(
    runs.map((r) =>
      buildPayReport(tenant.id, {
        startDate: r.startDate,
        endDate: r.endDate,
        branchId: r.branchId,
      }),
    ),
  );

  const byWorker = new Map<string, WorkerRow>();
  for (const rep of reports) {
    for (const row of rep.rows) {
      const prev = byWorker.get(row.staffId);
      if (!prev) {
        byWorker.set(row.staffId, { ...row, bands: { ...row.bands }, lines: [...row.lines] });
        continue;
      }
      prev.shifts += row.shifts;
      prev.hours += row.hours;
      prev.km += row.km;
      prev.wagePay += row.wagePay;
      prev.kmPay += row.kmPay;
      prev.total += row.total;
      for (const [band, h] of Object.entries(row.bands)) {
        prev.bands[band] = (prev.bands[band] ?? 0) + h;
      }
      prev.unrated = prev.unrated || row.unrated;
      prev.lines.push(...row.lines);
    }
  }
  const rows = [...byWorker.values()]
    .map((r) => ({ ...r, lines: [...r.lines].sort((a, b) => a.startIso.localeCompare(b.startIso)) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const totals = reports.reduce<Totals>(
    (t, r) => ({
      hours: t.hours + r.totals.hours,
      km: t.km + r.totals.km,
      wagePay: t.wagePay + r.totals.wagePay,
      kmPay: t.kmPay + r.totals.kmPay,
      total: t.total + r.totals.total,
    }),
    { hours: 0, km: 0, wagePay: 0, kmPay: 0, total: 0 },
  );
  const shiftCount = reports.reduce((n, r) => n + r.shiftCount, 0);
  const pendingCount = reports.reduce((n, r) => n + r.pendingCount, 0);
  const drafts = runs.filter((r) => r.status === "DRAFT");
  const allDone = drafts.length === 0;
  const first = runs[0];

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <Link
        href="/payroll"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <span className="material-symbols-rounded text-[18px]">arrow_back</span>
        Payroll periods
      </Link>

      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              {fmtDate(first.startDate)} - {fmtDate(first.endDate)}
            </h1>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                allDone ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
              }`}
            >
              {allDone ? "completed" : "draft"}
            </span>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            All branches · {rows.length} worker{rows.length === 1 ? "" : "s"} ·{" "}
            {shiftCount} approved shift{shiftCount === 1 ? "" : "s"}
          </p>
        </div>

        {drafts.length > 0 && (
          <CompleteRunsButton
            ids={drafts.map((r) => r.id)}
            label={drafts.length > 1 ? `✓ Complete all ${drafts.length} branches` : "✓ Complete payroll"}
            size="lg"
            confirmTitle={drafts.length > 1 ? `Complete ${drafts.length} pay runs together?` : "Complete this pay run?"}
            confirmBody={`${drafts.map((r) => r.branch?.name).join(" and ")} for ${fmtDate(first.startDate)} - ${fmtDate(first.endDate)}. The figures below are frozen and every worker is notified that their pay is ready. You can re-open a run later if a timesheet needs correcting.`}
          />
        )}
      </header>

      {/* One chip per branch run - export and PDF live on each branch's page. */}
      <div className="mb-5 flex flex-wrap gap-2">
        {runs.map((r, i) => (
          <Link
            key={r.id}
            href={`/payroll/${r.id}`}
            className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm shadow-sm transition hover:border-[var(--brand)]"
          >
            <span className="font-semibold text-[var(--text-primary)]">{r.branch?.name}</span>{" "}
            <span className="text-[var(--text-secondary)]">
              · {reports[i].shiftCount} shift{reports[i].shiftCount === 1 ? "" : "s"} ·{" "}
              {money(reports[i].totals.total)} ·{" "}
              {r.status === "APPROVED" ? "completed" : "draft"}
            </span>
          </Link>
        ))}
      </div>

      {pendingCount > 0 && !allDone && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {pendingCount} shift{pendingCount === 1 ? " is" : "s are"} still awaiting
          approval and {pendingCount === 1 ? "is" : "are"} not included below.
          Approve or reject {pendingCount === 1 ? "it" : "them"} in Timesheets before
          completing, so nothing is left unpaid.
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Total hours", `${totals.hours.toFixed(2)} h`],
          ["Total mileage", `${totals.km.toFixed(1)} km`],
          ["Wages", money(totals.wagePay)],
          ["Total pay", money(totals.total)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
            <div className="text-xl font-bold text-[var(--text-primary)]">{value}</div>
            <div className="text-xs text-[var(--text-secondary)]">{label}</div>
          </div>
        ))}
      </div>

      {rows.some((r) => r.unrated) && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Some shifts have no matching rate (worker has no pay level, or the level
          has no rate for that stream/day). Those lines are costed at $0 - set the
          worker&apos;s pay level to fix.
        </div>
      )}

      <PayrollTable report={rows} totals={totals} />
    </div>
  );
}
