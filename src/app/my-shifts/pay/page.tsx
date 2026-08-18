import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { costShift } from "@/lib/payroll";
import { effectiveRates } from "@/lib/rates";
import { calendarDateKey, fmtInTz, tzForState } from "@/lib/timezone";
import { DAY_TYPE_LABELS, type DayType } from "@/lib/constants";

const money = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

/**
 * "My pay" — the worker's current pay period in plain terms: which shifts
 * count, how many hours, at what rate, and what that adds up to.
 *
 * Uses the branch's open PayrollPeriod when the office has created one;
 * otherwise falls back to the current fortnight so the page is still useful.
 * Either way it's clearly an ESTIMATE until the office approves the run.
 */
export default async function MyPayPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.staffId) redirect("/dashboard");

  const staff = await prisma.staff.findUnique({
    where: { id: session.staffId },
    include: {
      payLevel: { include: { rates: true } },
      branch: { select: { id: true, state: true, name: true } },
    },
  });
  if (!staff) redirect("/my-shifts");

  const tz = tzForState(staff.branch?.state);
  const now = new Date();

  // The office's period for this branch, if one covers today.
  const period = await prisma.payrollPeriod.findFirst({
    where: {
      tenantId: session.tenantId,
      ...(staff.branchId ? { branchId: staff.branchId } : {}),
      startDate: { lte: now },
      endDate: { gte: now },
    },
    orderBy: { startDate: "desc" },
  });

  // Fallback: the current fortnight, Monday-anchored.
  let start: Date;
  let end: Date;
  if (period) {
    start = period.startDate;
    end = period.endDate;
  } else {
    start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // Monday
    end = new Date(start);
    end.setDate(end.getDate() + 13);
    end.setHours(23, 59, 59, 999);
  }

  const [shifts, holidayRows] = await Promise.all([
    prisma.shift.findMany({
      where: {
        tenantId: session.tenantId,
        staffId: session.staffId,
        status: "COMPLETED",
        start: { gte: start, lte: end },
      },
      include: { client: true, pauses: true, transports: true },
      orderBy: { start: "asc" },
    }),
    prisma.publicHoliday.findMany({
      where: {
        tenantId: session.tenantId,
        date: { gte: start, lte: end },
        OR: [
          { state: null, branchId: null },
          ...(staff.branch?.state ? [{ state: staff.branch.state }] : []),
          ...(staff.branchId ? [{ branchId: staff.branchId }] : []),
        ],
      },
    }),
  ]);

  const holidays = new Set(holidayRows.map((h) => calendarDateKey(h.date)));
  const { grid, mileageRate } = effectiveRates(staff);

  const lines = shifts.map((s) => {
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
      staff.employmentType,
      mileageRate,
      holidays,
      tz,
    );
    return { shift: s, line, needsNotes: !s.progressNote?.trim() };
  });

  const totals = lines.reduce(
    (t, l) => ({
      hours: t.hours + l.line.hours,
      km: t.km + l.line.km,
      wages: t.wages + l.line.hours * l.line.rate,
      mileage: t.mileage + l.line.km * mileageRate,
      total: t.total + l.line.pay,
    }),
    { hours: 0, km: 0, wages: 0, mileage: 0, total: 0 },
  );

  const unpaidCount = lines.filter((l) => l.needsNotes).length;
  const approved = period?.status === "APPROVED";
  const dateRange = `${fmtInTz(start, tz, { day: "numeric", month: "short" })} – ${fmtInTz(end, tz, { day: "numeric", month: "short" })}`;

  return (
    <div className="space-y-4 p-4">
      {/* Headline */}
      <div className="rounded-2xl bg-[var(--brand)] p-5 text-white shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wide opacity-70">
          {approved ? "Approved pay" : "Pay so far this period"}
        </div>
        <div className="mt-1 text-4xl font-bold">{money(totals.total)}</div>
        <div className="mt-1 text-sm opacity-80">{dateRange}</div>

        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/20 pt-3 text-center">
          <div>
            <div className="text-lg font-bold">{totals.hours.toFixed(1)}</div>
            <div className="text-[11px] uppercase opacity-70">Hours</div>
          </div>
          <div>
            <div className="text-lg font-bold">{shifts.length}</div>
            <div className="text-[11px] uppercase opacity-70">Shifts</div>
          </div>
          <div>
            <div className="text-lg font-bold">{totals.km.toFixed(0)}</div>
            <div className="text-[11px] uppercase opacity-70">km</div>
          </div>
        </div>
      </div>

      {/* Breakdown of the total */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex justify-between py-1.5 text-sm">
          <span className="text-slate-500">Shift pay</span>
          <span className="font-semibold text-slate-900">
            {money(totals.wages)}
          </span>
        </div>
        <div className="flex justify-between py-1.5 text-sm">
          <span className="text-slate-500">Mileage</span>
          <span className="font-semibold text-slate-900">
            {money(totals.mileage)}
          </span>
        </div>
        <div className="mt-1 flex justify-between border-t border-slate-100 pt-2.5 text-base">
          <span className="font-semibold text-slate-700">Total</span>
          <span className="font-bold text-slate-900">{money(totals.total)}</span>
        </div>
      </div>

      {unpaidCount > 0 && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <span className="material-symbols-rounded text-amber-600">warning</span>
          <p className="text-sm text-amber-800">
            <strong>
              {unpaidCount} shift{unpaidCount === 1 ? "" : "s"} still need shift
              notes.
            </strong>{" "}
            They won&apos;t be approved for payment until the notes are filled
            in.
          </p>
        </div>
      )}

      {/* Every shift that counts towards it */}
      <section>
        <h2 className="mb-2 px-1 text-sm font-bold uppercase tracking-wide text-slate-500">
          Shifts in this period
        </h2>

        {lines.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
            No completed shifts in this period yet.
          </div>
        ) : (
          <div className="space-y-2.5">
            {lines.map(({ shift: s, line, needsNotes }) => (
              <div
                key={s.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900">
                      {s.client.firstName} {s.client.lastName}
                    </div>
                    <div className="text-xs text-slate-500">
                      {fmtInTz(s.start, tz, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}{" "}
                      ·{" "}
                      {fmtInTz(s.start, tz, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}{" "}
                      –{" "}
                      {fmtInTz(s.end, tz, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-bold text-slate-900">
                      {money(line.pay)}
                    </div>
                    {needsNotes && (
                      <div className="text-[11px] font-semibold text-amber-600">
                        notes needed
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                  <span className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-600">
                    {line.hours.toFixed(2)} h × {money(line.rate)}
                  </span>
                  <span className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-600">
                    {DAY_TYPE_LABELS[line.dayType as DayType]}
                  </span>
                  {line.km > 0 && (
                    <span className="rounded-md bg-violet-50 px-2 py-1 font-medium text-violet-700">
                      {line.km.toFixed(1)} km
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="px-1 pb-2 text-center text-xs text-slate-400">
        {approved
          ? "This pay run has been approved by the office."
          : "This is an estimate based on your completed shifts. The office checks and approves every pay run before it's paid."}
      </p>
    </div>
  );
}
