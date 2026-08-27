import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/format";
import {
  createPayrollPeriod,
  deletePayrollPeriod,
  approvePayrollPeriod,
  reopenPayrollPeriod,
} from "./actions";

import { isManager } from "@/lib/roles";
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
  const { tenant, session } = await requireTenant();
  // Managers only - workers never see payroll.
  if (!isManager(session.role)) {
    redirect("/dashboard");
  }

  const { branch, tab, q, from, to } = await searchParams;
  const branches = await prisma.branch.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "asc" },
  });
  const selected =
    branch && branches.some((b) => b.id === branch)
      ? branch
      : (branches[0]?.id ?? "");
  const selectedBranch = branches.find((b) => b.id === selected) ?? null;

  const allPeriods = await prisma.payrollPeriod.findMany({
    where: { tenantId: tenant.id, branchId: selected || null },
    orderBy: { startDate: "desc" },
  });

  // Current = not yet approved; Past Payrolls = approved (searchable).
  const view = tab === "past" ? "past" : "current";
  const query = (q ?? "").trim().toLowerCase();
  const current = allPeriods.filter((p) => p.status !== "APPROVED");
  const pastAll = allPeriods.filter((p) => p.status === "APPROVED");
  // Date filtering works on the real dates, not on formatted strings - the
  // old text search only matched what fmtDate happened to print, so "Apr 2027"
  // found a run but "2027-04-30" didn't. A run matches when its period
  // OVERLAPS the range asked for, which is what someone means by "show me
  // April": a run spanning the month boundary still counts.
  const fromDate = from ? new Date(`${from}T00:00:00`) : null;
  const toDate = to ? new Date(`${to}T23:59:59`) : null;
  const validFrom = fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : null;
  const validTo = toDate && !Number.isNaN(toDate.getTime()) ? toDate : null;

  const past = pastAll.filter((p) => {
    if (validFrom && p.endDate < validFrom) return false;
    if (validTo && p.startDate > validTo) return false;
    if (query && !(p.approvedBy ?? "").toLowerCase().includes(query)) return false;
    return true;
  });
  const filtersOn = Boolean(validFrom || validTo || query);
  const periods = view === "past" ? past : current;

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          Payroll Periods
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Create a pay run for a date range - hours, mileage and pay are pulled
          automatically for every worker in the branch.
        </p>
      </header>

      {/* Branch tabs - each branch has its own pay runs */}
      {branches.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {branches.map((b) => (
            <Link
              key={b.id}
              href={`/payroll?branch=${b.id}`}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                b.id === selected
                  ? "bg-[var(--brand)] text-white shadow-sm"
                  : "border border-[var(--border)] bg-white text-[var(--text-secondary)] hover:bg-[var(--background)]"
              }`}
            >
              {b.name}
            </Link>
          ))}
        </div>
      )}

      {branches.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-white p-12 text-center">
          <p className="font-medium text-[var(--text-primary)]">
            No branches yet
          </p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Create a branch schedule first - payroll is run per branch.
          </p>
        </div>
      ) : (
        <>
          {/* Current / Past sub-tabs */}
          <div className="mb-5 inline-flex rounded-xl border border-[var(--border)] bg-white p-1">
            <Link
              href={`/payroll?branch=${selected}`}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                view === "current" ? "bg-[var(--brand)] text-white shadow-sm" : "text-[var(--text-secondary)] hover:bg-[var(--background)]"
              }`}
            >
              Current <span className={view === "current" ? "opacity-80" : "text-[var(--text-muted)]"}>{current.length}</span>
            </Link>
            <Link
              href={`/payroll?branch=${selected}&tab=past`}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                view === "past" ? "bg-[var(--brand)] text-white shadow-sm" : "text-[var(--text-secondary)] hover:bg-[var(--background)]"
              }`}
            >
              Past Payrolls <span className={view === "past" ? "opacity-80" : "text-[var(--text-muted)]"}>{pastAll.length}</span>
            </Link>
          </div>

          {/* Filter past pay runs by date range and approver */}
          {view === "past" && (
            <form className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
              <input type="hidden" name="branch" value={selected} />
              <input type="hidden" name="tab" value="past" />
              <label className="block text-xs font-medium text-[var(--text-secondary)]">
                From
                <input
                  type="date"
                  name="from"
                  defaultValue={from ?? ""}
                  className="mt-1 block rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--brand)]"
                />
              </label>
              <label className="block text-xs font-medium text-[var(--text-secondary)]">
                To
                <input
                  type="date"
                  name="to"
                  defaultValue={to ?? ""}
                  className="mt-1 block rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--brand)]"
                />
              </label>
              <label className="block min-w-[12rem] flex-1 text-xs font-medium text-[var(--text-secondary)]">
                Approved by
                <input
                  name="q"
                  defaultValue={q ?? ""}
                  placeholder="Any approver"
                  className="mt-1 block w-full rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--brand)]"
                />
              </label>
              <button className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90">
                Filter
              </button>
              {filtersOn && (
                <Link
                  href={`/payroll?branch=${selected}&tab=past`}
                  className="px-2 py-2 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  Clear
                </Link>
              )}
            </form>
          )}

          {/* New period */}
          {view === "current" && (
          <form
            action={createPayrollPeriod}
            className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm"
          >
            <input type="hidden" name="branchId" value={selected} />
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)]">
                Pay period from
                <input
                  type="date"
                  name="from"
                  required
                  className="mt-1 block rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--brand)]"
                />
              </label>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)]">
                To
                <input
                  type="date"
                  name="to"
                  required
                  className="mt-1 block rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--brand)]"
                />
              </label>
            </div>
            <button className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90">
              + Create pay run
            </button>
            <span className="ml-auto self-center text-xs text-[var(--text-muted)]">
              {selectedBranch?.name}
            </span>
          </form>
          )}

          {/* Periods */}
          <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
            <div className="border-b border-[var(--border)] px-5 py-3">
              <h2 className="font-bold text-[var(--text-primary)]">
                {view === "past" ? "Past Payrolls" : "Current pay runs"}{" "}
                <span className="font-medium text-[var(--text-muted)]">
                  ({periods.length})
                </span>
              </h2>
            </div>

            {periods.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-[var(--text-muted)]">
                {view === "past"
                  ? query
                    ? "No past pay runs match your search."
                    : `No approved pay runs yet for ${selectedBranch?.name}.`
                  : `No pay runs in progress for ${selectedBranch?.name}. Create one above.`}
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {periods.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center gap-3 px-5 py-3.5"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/payroll/${p.id}`}
                        className="font-semibold text-[var(--text-primary)] hover:text-[var(--brand)]"
                      >
                        {fmtDate(p.startDate)} - {fmtDate(p.endDate)}
                      </Link>
                      <div className="text-xs text-[var(--text-muted)]">
                        {p.status === "APPROVED"
                          ? `Approved by ${p.approvedBy}`
                          : "Draft - not yet approved"}
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        p.status === "APPROVED"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {p.status.toLowerCase()}
                    </span>
                    <Link
                      href={`/payroll/${p.id}`}
                      className="rounded-lg bg-[var(--background)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--border)]"
                    >
                      View report →
                    </Link>
                    {p.status === "DRAFT" && (
                      <>
                        {/* Completing from the list saves opening every run
                            just to finish it. The report stays the place to
                            check the figures first. */}
                        <form action={approvePayrollPeriod}>
                          <input type="hidden" name="id" value={p.id} />
                          <button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90">
                            Complete
                          </button>
                        </form>
                        <form action={deletePayrollPeriod}>
                          <input type="hidden" name="id" value={p.id} />
                          <button className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
                            Delete
                          </button>
                        </form>
                      </>
                    )}
                    {p.status === "APPROVED" && (
                      <form action={reopenPayrollPeriod}>
                        <input type="hidden" name="id" value={p.id} />
                        <button className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--background)] hover:text-[var(--text-primary)]">
                          Re-open
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
