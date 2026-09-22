import Link from "next/link";
import { redirect } from "next/navigation";
import { requireScope } from "@/lib/tenant";
import { payrollBranchIds } from "@/lib/scope";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/format";
import { isManager } from "@/lib/roles";
import { dateKeyInTz, tzForState } from "@/lib/timezone";
import { deletePayrollPeriod, reopenPayrollPeriod } from "./actions";
import { CompleteRunsButton } from "./CompleteRunsButton";
import { CreateRunForm } from "./CreateRunForm";
import { DeleteOrphansButton } from "./DeleteOrphansButton";
import { AssignBranchForm } from "./AssignBranchForm";
import { DayShiftRepair } from "@/components/DayShiftRepair";
import { TripRepair } from "@/components/TripRepair";
import { findShortTrips } from "@/lib/tripRepair";
import { isDayShifted } from "@/lib/dayShift";

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{
    branch?: string;
    tab?: string;
    q?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const { tenant, session, scope } = await requireScope();
  // Managers only - workers never see payroll.
  if (!isManager(session.role)) {
    redirect("/dashboard");
  }
  // A branch-restricted manager sees pay only for the branches they look after.
  const allowed = payrollBranchIds(scope);
  if (allowed && allowed.length === 0) redirect("/dashboard");
  const inAllowed = allowed ? { branchId: { in: allowed } } : {};

  const { branch, tab, q, from, to } = await searchParams;
  const [branches, allRuns, unbranched, clocked] = await Promise.all([
    prisma.branch.findMany({
      where: { tenantId: tenant.id, ...(allowed ? { id: { in: allowed } } : {}) },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, state: true },
    }),
    prisma.payrollPeriod.findMany({
      where: { tenantId: tenant.id, ...inAllowed },
      orderBy: { startDate: "desc" },
      include: { branch: { select: { name: true, state: true } } },
    }),
    // Completed shifts with no branch. No branch run pays them, so they are
    // shown against their pay period rather than left unpaid in silence.
    // Head office only: a branch manager can't place branchless shifts.
    prisma.shift.findMany({
      where: {
        tenantId: tenant.id,
        branchId: null,
        // Nothing for a branch manager: placing these is head office's job.
        ...(allowed ? { id: { in: [] as string[] } } : {}),
        status: "COMPLETED",
        approval: { not: "REJECTED" },
      },
      select: {
        id: true,
        start: true,
        staff: { select: { firstName: true, lastName: true } },
        client: { select: { firstName: true, lastName: true } },
      },
      orderBy: { start: "asc" },
    }),
    prisma.shift.findMany({
      where: { tenantId: tenant.id, clockInAt: { not: null }, clockOutAt: { not: null }, ...inAllowed },
      select: {
        id: true,
        start: true,
        end: true,
        clockInAt: true,
        clockOutAt: true,
        staff: { select: { firstName: true, lastName: true } },
        client: { select: { firstName: true, lastName: true } },
      },
      orderBy: { start: "asc" },
    }),
  ]);
  // Clock times the old Timesheets form saved a day early - paid at zero.
  const dayShifted = clocked.filter(isDayShifted);
  // Trips saved shorter than their GPS trail - mileage that would go unpaid.
  const shortTrips = await findShortTrips(tenant.id, { branchIds: allowed });

  // Runs with no branch are leftovers from a deleted branch. They cover every
  // worker, so they get their own clearly-marked view rather than sitting
  // among the real runs.
  const orphans = allRuns.filter((r) => !r.branchId);
  const orphanDrafts = orphans.filter((r) => r.status === "DRAFT").length;

  // "all" (default) | a branch id | "none" (the leftovers).
  const selected =
    branch === "none" && orphans.length > 0
      ? "none"
      : branch && branches.some((b) => b.id === branch)
        ? branch
        : "all";
  const selectedBranch = branches.find((b) => b.id === selected) ?? null;
  const view = tab === "past" ? "past" : "current";

  const scoped =
    selected === "all"
      ? allRuns.filter((r) => r.branchId)
      : selected === "none"
        ? orphans
        : allRuns.filter((r) => r.branchId === selected);

  // Group runs covering the same calendar dates, read in each run's own
  // timezone: Sydney and Brisbane midnights are different instants during
  // daylight saving, but "20 Aug to 3 Sep" is the same pay period.
  type RunRow = (typeof allRuns)[number];
  const byDates = new Map<string, RunRow[]>();
  for (const r of scoped) {
    const tz = tzForState(r.branch?.state ?? null);
    const key = `${dateKeyInTz(r.startDate, tz)}|${dateKeyInTz(r.endDate, tz)}`;
    byDates.set(key, [...(byDates.get(key) ?? []), r]);
  }
  const groups = [...byDates.entries()]
    .map(([key, runs]) => {
      const sorted = [...runs].sort((a, b) =>
        (a.branch?.name ?? "").localeCompare(b.branch?.name ?? ""),
      );
      // The widest span across the group's runs: their instants differ by
      // timezone, and a shift anywhere inside should count.
      const windowStart = Math.min(...sorted.map((r) => r.startDate.getTime()));
      const windowEnd = Math.max(...sorted.map((r) => r.endDate.getTime()));
      return {
        key,
        runs: sorted,
        first: sorted[0],
        done: sorted.every((r) => r.status === "APPROVED"),
        drafts: sorted.filter((r) => r.status === "DRAFT"),
        loose: unbranched.filter(
          (sh) => sh.start.getTime() >= windowStart && sh.start.getTime() <= windowEnd,
        ),
      };
    })
    .sort((a, b) => b.first.startDate.getTime() - a.first.startDate.getTime());

  // Past filters work on the real dates, not formatted strings. A group matches
  // when its dates OVERLAP the range asked for, so "show me April" includes a
  // run that crosses the month boundary.
  const query = (q ?? "").trim().toLowerCase();
  const fromDate = from ? new Date(`${from}T00:00:00`) : null;
  const toDate = to ? new Date(`${to}T23:59:59`) : null;
  const validFrom = fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : null;
  const validTo = toDate && !Number.isNaN(toDate.getTime()) ? toDate : null;
  const filtersOn = Boolean(validFrom || validTo || query);

  const current = groups.filter((g) => !g.done);
  const pastAll = groups.filter((g) => g.done);
  const past = pastAll.filter((g) => {
    if (validFrom && g.first.endDate < validFrom) return false;
    if (validTo && g.first.startDate > validTo) return false;
    if (query && !g.runs.some((r) => (r.approvedBy ?? "").toLowerCase().includes(query)))
      return false;
    return true;
  });
  const shown = view === "past" ? past : current;

  const scopeLabel =
    selected === "all"
      ? "Every branch"
      : selected === "none"
        ? "No branch"
        : (selectedBranch?.name ?? "");
  const tabHref = (b: string) => `/payroll?branch=${b}`;

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          Payroll Periods
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Create a pay run for a date range - hours, mileage and pay are pulled
          automatically. In All branches each branch keeps its own run, costed
          in its own state, and you complete them together.
        </p>
      </header>

      {orphans.length > 0 && selected !== "none" && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="flex-1 text-sm text-red-800">
            <strong>
              {orphans.length} pay run{orphans.length === 1 ? " has" : "s have"} no
              branch.
            </strong>{" "}
            They were left behind when a branch was deleted, and each covers every
            worker - so one sitting beside the branch runs for the same dates
            would pay those shifts twice. They can&apos;t be completed.
          </p>
          <Link
            href={tabHref("none")}
            className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-red-700 shadow-sm"
          >
            Review them
          </Link>
        </div>
      )}

      <DayShiftRepair
        items={dayShifted.map((d) => ({
          id: d.id,
          label: `${fmtDate(d.start)} · ${d.staff ? `${d.staff.firstName} ${d.staff.lastName}` : "Unassigned"} · ${d.client.firstName} ${d.client.lastName}`,
        }))}
      />

      <TripRepair
        items={shortTrips.map((t) => ({
          id: t.id,
          label: `${fmtDate(t.shiftStart)} · ${t.worker} · ${t.client}: saved ${t.savedKm.toFixed(1)} km, GPS shows at least ${t.gpsKm.toFixed(1)} km`,
        }))}
      />

      {branches.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-white p-12 text-center">
          <p className="font-medium text-[var(--text-primary)]">No branches yet</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Create a branch schedule first - payroll is run per branch.
          </p>
        </div>
      ) : (
        <>
          {/* Scope tabs */}
          <div className="mb-5 flex flex-wrap gap-2">
            {[{ id: "all", name: "All branches" }, ...branches].map((b) => (
              <Link
                key={b.id}
                href={tabHref(b.id)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  b.id === selected
                    ? "bg-[var(--brand)] text-white shadow-sm"
                    : "border border-[var(--border)] bg-white text-[var(--text-secondary)] hover:bg-[var(--background)]"
                }`}
              >
                {b.name}
              </Link>
            ))}
            {orphans.length > 0 && (
              <Link
                href={tabHref("none")}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  selected === "none"
                    ? "bg-red-600 text-white shadow-sm"
                    : "border border-red-200 bg-red-50 text-red-700"
                }`}
              >
                No branch ({orphans.length})
              </Link>
            )}
          </div>

          {selected === "none" ? (
            <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-red-200 bg-white p-4 shadow-sm">
              <p className="flex-1 text-sm text-[var(--text-secondary)]">
                Runs with no branch pay every worker in every branch, so they
                can&apos;t be completed. Use the branch runs, and delete these
                unless you know why they exist.
              </p>
              <DeleteOrphansButton count={orphanDrafts} />
            </div>
          ) : (
            <>
              {/* Current / Past sub-tabs */}
              <div className="mb-5 inline-flex rounded-xl border border-[var(--border)] bg-white p-1">
                <Link
                  href={tabHref(selected)}
                  className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                    view === "current" ? "bg-[var(--brand)] text-white shadow-sm" : "text-[var(--text-secondary)] hover:bg-[var(--background)]"
                  }`}
                >
                  Current{" "}
                  <span className={view === "current" ? "opacity-80" : "text-[var(--text-muted)]"}>
                    {current.length}
                  </span>
                </Link>
                <Link
                  href={`${tabHref(selected)}&tab=past`}
                  className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                    view === "past" ? "bg-[var(--brand)] text-white shadow-sm" : "text-[var(--text-secondary)] hover:bg-[var(--background)]"
                  }`}
                >
                  Past Payrolls{" "}
                  <span className={view === "past" ? "opacity-80" : "text-[var(--text-muted)]"}>
                    {pastAll.length}
                  </span>
                </Link>
              </div>

              {view === "past" && (
                <form className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
                  <input type="hidden" name="branch" value={selected} />
                  <input type="hidden" name="tab" value="past" />
                  <label className="block text-xs font-medium text-[var(--text-secondary)]">
                    From
                    <input type="date" name="from" defaultValue={from ?? ""} className="mt-1 block rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--brand)]" />
                  </label>
                  <label className="block text-xs font-medium text-[var(--text-secondary)]">
                    To
                    <input type="date" name="to" defaultValue={to ?? ""} className="mt-1 block rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--brand)]" />
                  </label>
                  <label className="block min-w-[12rem] flex-1 text-xs font-medium text-[var(--text-secondary)]">
                    Completed by
                    <input name="q" defaultValue={q ?? ""} placeholder="Anyone" className="mt-1 block w-full rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--brand)]" />
                  </label>
                  <button className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90">
                    Filter
                  </button>
                  {filtersOn && (
                    <Link href={`${tabHref(selected)}&tab=past`} className="px-2 py-2 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                      Clear
                    </Link>
                  )}
                </form>
              )}

              {view === "current" && (
                <CreateRunForm
                  scope={selected}
                  scopeLabel={scopeLabel}
                />
              )}
            </>
          )}

          <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
            <div className="border-b border-[var(--border)] px-5 py-3">
              <h2 className="font-bold text-[var(--text-primary)]">
                {selected === "none"
                  ? "Runs with no branch"
                  : view === "past"
                    ? "Past Payrolls"
                    : "Current pay runs"}{" "}
                <span className="font-medium text-[var(--text-muted)]">
                  ({selected === "none" ? orphans.length : shown.length})
                </span>
              </h2>
            </div>

            {(selected === "none" ? orphans.length : shown.length) === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-[var(--text-muted)]">
                {view === "past"
                  ? filtersOn
                    ? "No past pay runs match your filter."
                    : "No completed pay runs yet."
                  : "No pay runs in progress. Create one above."}
              </p>
            ) : selected === "none" ? (
              <ul className="divide-y divide-[var(--border)]">
                {orphans.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <Link href={`/payroll/${p.id}`} className="font-semibold text-[var(--text-primary)] hover:text-[var(--brand)]">
                        {fmtDate(p.startDate)} - {fmtDate(p.endDate)}
                      </Link>
                      <div className="text-xs text-[var(--text-muted)]">
                        {p.status === "APPROVED" ? `Completed by ${p.approvedBy}` : "Draft, no branch"}
                      </div>
                    </div>
                    {p.status === "DRAFT" && (
                      <form action={deletePayrollPeriod}>
                        <input type="hidden" name="id" value={p.id} />
                        <button className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
                          Delete
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {shown.map((g) => {
                  const single = g.runs.length === 1 ? g.runs[0] : null;
                  const approvers = [...new Set(g.runs.map((r) => r.approvedBy).filter(Boolean))];
                  return (
                    <li key={g.key} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                      <div className="min-w-0 flex-1">
                        {/* The period opens every branch together; the chips
                            below open one branch each. */}
                        <Link
                          href={
                            g.runs.length > 1
                              ? `/payroll/combined?ids=${g.runs.map((r) => r.id).join(",")}`
                              : `/payroll/${g.first.id}`
                          }
                          className="font-semibold text-[var(--text-primary)] hover:text-[var(--brand)]"
                        >
                          {fmtDate(g.first.startDate)} - {fmtDate(g.first.endDate)}
                          {g.runs.length > 1 && (
                            <span className="ml-2 text-xs font-medium text-[var(--brand)]">
                              View all branches together
                            </span>
                          )}
                        </Link>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {g.runs.map((r) => (
                            <Link
                              key={r.id}
                              href={`/payroll/${r.id}`}
                              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold transition hover:opacity-80 ${
                                r.status === "APPROVED"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-amber-50 text-amber-700"
                              }`}
                            >
                              {r.branch?.name ?? "No branch"} ·{" "}
                              {r.status === "APPROVED" ? "completed" : "draft"}
                            </Link>
                          ))}
                        </div>
                        {g.done && approvers.length > 0 && (
                          <div className="mt-1 text-xs text-[var(--text-muted)]">
                            Completed by {approvers.join(", ")}
                          </div>
                        )}
                        {g.loose.length > 0 && (
                          <div className="mt-2 rounded-xl border border-red-200 bg-red-50 p-3">
                            <p className="text-xs font-semibold text-red-800">
                              {g.loose.length} shift{g.loose.length === 1 ? " in these dates has" : "s in these dates have"}{" "}
                              no branch, so none of these runs will pay{" "}
                              {g.loose.length === 1 ? "it" : "them"}. Assign{" "}
                              {g.loose.length === 1 ? "it" : "them"} to a branch before completing.
                            </p>
                            <ul className="mt-1 space-y-0.5 text-xs text-red-800">
                              {g.loose.slice(0, 6).map((sh) => (
                                <li key={sh.id}>
                                  {fmtDate(sh.start)} ·{" "}
                                  {sh.staff ? `${sh.staff.firstName} ${sh.staff.lastName}` : "Unassigned"} ·{" "}
                                  {sh.client.firstName} {sh.client.lastName}
                                </li>
                              ))}
                              {g.loose.length > 6 && <li>and {g.loose.length - 6} more</li>}
                            </ul>
                            <AssignBranchForm
                              ids={g.loose.map((sh) => sh.id)}
                              branches={branches.map((b) => ({ id: b.id, name: b.name }))}
                            />
                          </div>
                        )}
                      </div>

                      {g.drafts.length > 0 && (
                        <CompleteRunsButton
                          ids={g.drafts.map((r) => r.id)}
                          label={
                            g.drafts.length > 1
                              ? `Complete all ${g.drafts.length} branches`
                              : "Complete"
                          }
                          confirmTitle={
                            g.drafts.length > 1
                              ? `Complete ${g.drafts.length} pay runs together?`
                              : "Complete this pay run?"
                          }
                          confirmBody={`${g.drafts.map((r) => r.branch?.name).filter(Boolean).join(" and ")} for ${fmtDate(g.first.startDate)} - ${fmtDate(g.first.endDate)}. Figures are frozen and every worker in ${g.drafts.length > 1 ? "them" : "it"} is notified their pay is ready. Each branch is still costed in its own state.${g.loose.length ? ` Warning: ${g.loose.length} shift${g.loose.length === 1 ? "" : "s"} in these dates with no branch will NOT be paid by these runs.` : ""}`}
                        />
                      )}

                      {single && single.status === "DRAFT" && (
                        <form action={deletePayrollPeriod}>
                          <input type="hidden" name="id" value={single.id} />
                          <button className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
                            Delete
                          </button>
                        </form>
                      )}
                      {single && single.status === "APPROVED" && (
                        <form action={reopenPayrollPeriod}>
                          <input type="hidden" name="id" value={single.id} />
                          <button className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--background)] hover:text-[var(--text-primary)]">
                            Re-open
                          </button>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
