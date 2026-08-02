import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { fmtDateTime, initials } from "@/lib/format";
import {
  reliabilityOf,
  flagShift,
  fmtMins,
  type AttendanceSettings,
} from "@/lib/reliability";
import { AttendanceTable, type WorkerRow } from "./AttendanceTable";

export default async function AttendancePage() {
  const { tenant, session } = await requireTenant();
  if (session.role !== "ADMIN" && session.role !== "COORDINATOR") {
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

  const [staff, notices] = await Promise.all([
    prisma.staff.findMany({
      where: { tenantId: tenant.id, active: true },
      include: {
        branch: true,
        shifts: {
          where: { status: "COMPLETED" },
          select: {
            id: true,
            start: true,
            end: true,
            clockInAt: true,
            clockOutAt: true,
            client: { select: { firstName: true, lastName: true } },
          },
          orderBy: { start: "desc" },
        },
        _count: { select: { lateNotices: true } },
      },
      orderBy: { firstName: "asc" },
    }),
    prisma.lateNotice.findMany({
      where: { tenantId: tenant.id },
      include: { staff: true, shift: { include: { client: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const t = (d: Date | null) =>
    d
      ? new Date(d).toLocaleTimeString("en-AU", {
          hour: "numeric",
          minute: "2-digit",
        })
      : "—";
  const dayLabel = (d: Date) =>
    new Date(d).toLocaleDateString("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  /** "6m late" / "on time" / "12m early" */
  const delta = (mins: number | null, lateWord: string, earlyWord: string) => {
    if (mins == null) return "—";
    if (mins > 0) return `${fmtMins(mins)} ${lateWord}`;
    if (mins < 0) return `${fmtMins(mins)} ${earlyWord}`;
    return "on time";
  };

  const rows: WorkerRow[] = staff
    .map((s) => {
      const rating = reliabilityOf(s.shifts, s._count.lateNotices, cfg);
      const lines = s.shifts
        .filter((sh) => sh.clockInAt && sh.clockOutAt)
        .map((sh) => {
          const f = flagShift(sh, cfg);
          return {
            id: sh.id,
            dateLabel: dayLabel(sh.start),
            clientName: `${sh.client.firstName} ${sh.client.lastName}`,
            rostered: `${t(sh.start)} – ${t(sh.end)}`,
            actual: `${t(sh.clockInAt)} – ${t(sh.clockOutAt)}`,
            startDelta: delta(f.startDeltaMin, "late", "early"),
            endDelta: delta(f.endDeltaMin, "over", "early"),
            lateStart: f.lateStart,
            earlyFinish: f.earlyFinish,
            stayedLate: f.lateFinish && !f.lateStart,
          };
        });

      return {
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        branch: s.branch?.name ?? "",
        score: rating.score,
        band: rating.band,
        total: rating.total,
        clean: rating.clean,
        lateStarts: rating.lateStarts,
        earlyFinishes: rating.earlyFinishes,
        stayedLate: rating.stayedLate,
        lateNotices: rating.lateNotices,
        avgLateLabel: rating.avgLateMin ? fmtMins(rating.avgLateMin) : "—",
        lines,
      };
    })
    .sort((a, b) => a.score - b.score); // worst first

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <header className="mb-5">
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
