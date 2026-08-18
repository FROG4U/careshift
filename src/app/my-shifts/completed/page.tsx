import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtDate, fmtTime } from "@/lib/format";
import { ShiftNotes } from "@/components/ShiftNotes";
import { netHoursOf } from "@/lib/payroll";

export default async function CompletedShiftsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.staffId) redirect("/dashboard");

  const account = await prisma.user.findUnique({
    where: { id: session.id },
    select: { status: true },
  });
  if (!account || account.status !== "APPROVED") redirect("/pending");

  const me = await prisma.staff.findUnique({
    where: { id: session.staffId },
    select: { branchId: true },
  });
  const branchWhere = me?.branchId ? { branchId: me.branchId } : {};

  const shifts = await prisma.shift.findMany({
    where: {
      tenantId: session.tenantId,
      staffId: session.staffId,
      status: "COMPLETED",
      ...branchWhere,
    },
    include: { client: true, transports: true, pauses: true },
    orderBy: { start: "desc" },
    take: 100,
  });

  // Paid hours, using the same rule as payroll (the overlap of clocked and
  // rostered time, minus breaks). Showing raw clocked time here would
  // contradict what the worker sees on My Pay.
  const workedHours = (s: (typeof shifts)[number]) => {
    if (!s.clockInAt || !s.clockOutAt) return 0;
    return netHoursOf(s);
  };
  const kmOf = (s: (typeof shifts)[number]) =>
    s.transports.reduce((sum, t) => sum + t.km, 0);

  // Group by month.
  const groups = new Map<string, typeof shifts>();
  for (const s of shifts) {
    const key = new Date(s.start).toLocaleDateString("en-AU", {
      month: "long",
      year: "numeric",
    });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }

  const totalHours = shifts.reduce((sum, s) => sum + workedHours(s), 0);
  const totalKm = shifts.reduce((sum, s) => sum + kmOf(s), 0);

  return (
    <div className="space-y-4 p-4">
      {/* Totals */}
      <div className="grid grid-cols-3 gap-3">
        <Stat icon="event_available" value={shifts.length.toString()} label="shifts" />
        <Stat icon="schedule" value={totalHours.toFixed(0)} label="hours" />
        <Stat icon="directions_car" value={totalKm.toFixed(0)} label="km" />
      </div>

      {shifts.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
          No completed shifts yet. Finished shifts appear here.
        </div>
      )}

      {[...groups.entries()].map(([month, list]) => (
        <section key={month}>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {month}
          </h2>
          <div className="space-y-3">
            {list.map((s) => {
              const km = kmOf(s);
              const hasNotes = !!s.progressNote?.trim();
              return (
                <div
                  key={s.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        {fmtDate(s.start)}
                      </div>
                      <div className="text-base font-semibold text-slate-900">
                        {s.client.firstName} {s.client.lastName}
                      </div>
                    </div>
                    <span className="text-sm font-bold text-[var(--brand)]">
                      {workedHours(s).toFixed(1)} h
                    </span>
                  </div>

                  {s.clockInAt && (
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 font-semibold text-emerald-700">
                        <span
                          className="material-symbols-rounded text-[16px] leading-none"
                          style={{ fontVariationSettings: "'FILL' 0" }}
                        >
                          schedule
                        </span>
                        In {fmtTime(s.clockInAt)}
                        {s.clockOutAt && ` · Out ${fmtTime(s.clockOutAt)}`}
                      </span>
                      {km > 0 && (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-2.5 py-1.5 font-semibold text-violet-700">
                          <span
                            className="material-symbols-rounded text-[16px] leading-none"
                            style={{ fontVariationSettings: "'FILL' 0" }}
                          >
                            directions_car
                          </span>
                          {km.toFixed(1)} km
                        </span>
                      )}
                    </div>
                  )}

                  <div className="mt-3">
                    {hasNotes ? (
                      <span className="text-xs font-medium text-emerald-600">
                        ✓ Notes submitted
                      </span>
                    ) : (
                      <div id={`notes-${s.id}`}>
                        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-600">
                          <span className="material-symbols-rounded text-[16px]">warning</span>
                          Shift notes needed for payroll
                        </div>
                        <ShiftNotes
                          shiftId={s.id}
                          clockOutIso={s.clockOutAt?.toISOString() ?? null}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: string;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
      <span className="material-symbols-rounded text-[20px] text-[var(--brand)]">
        {icon}
      </span>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
