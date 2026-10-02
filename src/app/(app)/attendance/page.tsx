import { redirect } from "next/navigation";
import { requireScope } from "@/lib/tenant";
import { opsWhere, opsWhereVia } from "@/lib/scope";
import { prisma } from "@/lib/prisma";
import { fmtDateTime, initials } from "@/lib/format";
import {
  reliabilityOf,
  flagShift,
  fmtMins,
  type AttendanceSettings,
} from "@/lib/reliability";
import { AttendanceTable, type WorkerRow } from "./AttendanceTable";
import { loadAttendance } from "@/lib/attendanceReport";

import { isManager } from "@/lib/roles";
export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ staff?: string }>;
}) {
  const { staff: staffId } = await searchParams;
  const { tenant, session, scope } = await requireScope();
  if (!isManager(session.role)) {
    redirect("/dashboard");
  }

  const cfg: AttendanceSettings = {
    lateGraceMin: tenant.lateGraceMin,
    earlyFinishGraceMin: tenant.earlyFinishGraceMin,
    lateFinishGraceMin: tenant.lateFinishGraceMin,
    ratingGreenAt: tenant.ratingGreenAt,
    ratingAmberAt: tenant.ratingAmberAt,
    lateNoticePenalty: tenant.lateNoticePenalty,
  };

  const notices = await prisma.lateNotice.findMany({
    where: { tenantId: tenant.id, ...opsWhereVia(scope, "staff") },
    include: { staff: true, shift: { include: { client: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // One loader for the screen and the PDF - a worker shown a score in a
  // meeting will have the printout in front of them.
  const rows: WorkerRow[] = await loadAttendance(
    tenant.id,
    scope,
    cfg,
    staffId || null,
  );

  // Everyone in scope, for the picker - the rows themselves may be one person.
  const everyone = await prisma.staff.findMany({
    where: { tenantId: tenant.id, active: true, ...opsWhere(scope) },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          Attendance
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Punctuality scores and “running late” reports. A score counts a shift
          as good when the worker starts within {cfg.lateGraceMin} min of the
          rostered start and doesn&apos;t leave more than{" "}
          {cfg.earlyFinishGraceMin} min early. Staying past the end is a
          positive, never a penalty. Change the thresholds in Settings.
        </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <form method="GET" className="flex items-center gap-2">
          <select
            name="staff"
            defaultValue={staffId ?? ""}
            className="rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm"
          >
            <option value="">Everyone</option>
            {everyone.map((w) => (
              <option key={w.id} value={w.id}>
                {w.firstName} {w.lastName}
              </option>
            ))}
          </select>
          <button className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--background)]">
            Show
          </button>
        </form>
        <a
          href={`/attendance/pdf${staffId ? `?staff=${staffId}` : ""}`}
          className="flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
        >
          <span className="material-symbols-rounded text-[18px]">download</span>
          Download PDF
        </a>
        </div>
      </header>

      {/* Worker scores — click a row for the shift-by-shift detail */}
      <div className="mb-6">
        <AttendanceTable rows={rows} />
      </div>
      {/* Running-late reports */}
      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
        <div className="border-b border-[var(--border)] px-5 py-3">
          <h2 className="font-bold text-[var(--text-primary)]">
            “Running late” reports{" "}
            <span className="font-medium text-[var(--text-muted)]">
              ({notices.length})
            </span>
          </h2>
        </div>
        {notices.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--pastel-green)]">
              <span className="material-symbols-rounded text-[28px] text-green-600">
                check_circle
              </span>
            </div>
            <p className="font-medium text-[var(--text-primary)]">
              No late reports
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {notices.map((n) => (
              <li key={n.id} className="flex flex-wrap items-start gap-3 px-5 py-3.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-xs font-semibold text-amber-700">
                  {initials(n.staff.firstName, n.staff.lastName)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-[var(--text-primary)]">
                    {n.staff.firstName} {n.staff.lastName}
                    <span className="font-normal text-[var(--text-secondary)]">
                      {" "}
                      — {n.shift.client.firstName} {n.shift.client.lastName}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
                    Shift {fmtDateTime(n.shift.start)} · reported{" "}
                    {fmtDateTime(n.createdAt)}
                  </div>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    “{n.reason}”
                    {n.etaMin ? (
                      <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        ~{n.etaMin} min
                      </span>
                    ) : null}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
