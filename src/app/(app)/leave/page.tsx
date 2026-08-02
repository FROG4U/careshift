import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { fmtDate, initials } from "@/lib/format";
import { LEAVE_LABELS } from "@/lib/leave";
import { approveAvailability, rejectAvailability } from "./actions";
import { LeaveEditButton } from "./LeaveEditButton";

const statusStyle: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-red-50 text-red-700",
};

const leaveTypeStyle: Record<string, string> = {
  ANNUAL: "bg-blue-50 text-blue-700",
  SICK: "bg-purple-50 text-purple-700",
  OTHER: "bg-slate-100 text-slate-600",
};

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function label(a: {
  startDate: Date;
  endDate: Date;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
}) {
  const same = a.startDate.getTime() === a.endDate.getTime();
  if (!a.allDay && same)
    return `${fmtDate(a.startDate)} · ${a.startTime}–${a.endTime}`;
  if (same) return `${fmtDate(a.startDate)} · all day`;
  return `${fmtDate(a.startDate)} – ${fmtDate(a.endDate)}`;
}

export default async function LeavePage() {
  const { tenant } = await requireTenant();

  const requests = await prisma.availability.findMany({
    where: { tenantId: tenant.id },
    include: { staff: true },
    orderBy: [{ status: "asc" }, { startDate: "desc" }],
    take: 80,
  });

  const pending = requests.filter((r) => r.status === "PENDING");
  const decided = requests.filter((r) => r.status !== "PENDING");

  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          Availability &amp; Time Off
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Workers request time off here. Once approved, the schedule warns you if
          you try to roster them during that window.
        </p>
      </header>

      {/* Pending */}
      <section className="mb-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
        <div className="border-b border-[var(--border)] px-5 py-3">
          <h2 className="font-bold text-[var(--text-primary)]">
            Awaiting approval{" "}
            <span className="font-medium text-[var(--text-muted)]">
              ({pending.length})
            </span>
          </h2>
        </div>

        {pending.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--pastel-green)]">
              <span className="material-symbols-rounded text-[28px] text-green-600">
                check_circle
              </span>
            </div>
            <p className="font-medium text-[var(--text-primary)]">
              No time-off requests waiting
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {pending.map((a) => (
              <li key={a.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">
                        {initials(a.staff.firstName, a.staff.lastName)}
                      </span>
                      <span className="font-semibold text-[var(--text-primary)]">
                        {a.staff.firstName} {a.staff.lastName}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-[var(--text-primary)]">
                      {label(a)}
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${leaveTypeStyle[a.leaveType] ?? leaveTypeStyle.OTHER}`}>
                        {LEAVE_LABELS[a.leaveType] ?? a.leaveType}
                      </span>
                    </div>
                    {a.reason && (
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        “{a.reason}”
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <LeaveEditButton
                      id={a.id}
                      startDate={iso(a.startDate)}
                      endDate={iso(a.endDate)}
                      leaveType={a.leaveType}
                      reason={a.reason ?? ""}
                    />
                    <form action={approveAvailability}>
                      <input type="hidden" name="id" value={a.id} />
                      <button className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90">
                        Approve
                      </button>
                    </form>
                    <form action={rejectAvailability}>
                      <input type="hidden" name="id" value={a.id} />
                      <button className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--background)]">
                        Decline
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* History */}
      {decided.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
          <div className="border-b border-[var(--border)] px-5 py-3">
            <h2 className="font-bold text-[var(--text-primary)]">Recent decisions</h2>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {decided.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-[var(--text-primary)]">
                    {a.staff.firstName} {a.staff.lastName} · {label(a)}{" "}
                    <span className="text-xs font-normal text-[var(--text-muted)]">
                      · {LEAVE_LABELS[a.leaveType] ?? a.leaveType}
                    </span>
                  </div>
                  {a.decidedBy && (
                    <div className="text-xs text-[var(--text-secondary)]">
                      {a.status === "APPROVED" ? "✓ Approved" : "Declined"} by{" "}
                      <span className="font-semibold text-[var(--text-primary)]">
                        {a.decidedBy}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <LeaveEditButton
                    id={a.id}
                    startDate={iso(a.startDate)}
                    endDate={iso(a.endDate)}
                    leaveType={a.leaveType}
                    reason={a.reason ?? ""}
                  />
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      statusStyle[a.status] ?? "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {a.status.toLowerCase()}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
