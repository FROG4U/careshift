import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/format";
import { DAY_TYPE_LABELS, type DayType } from "@/lib/constants";

/** One shift as it was when the run was completed (see PayrollLine.detail). */
type Detail = {
  date: string;
  time: string;
  client: string;
  band: string;
  holiday: string | null;
  hours: number;
  rate: number;
  km: number;
  kmPay: number;
  pay: number;
};

function parse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

const bandLabel = (band: string) => DAY_TYPE_LABELS[band as DayType] ?? band;

/** Colour per band, matching the office's pay report. */
const BAND_STYLE: Record<string, string> = {
  WEEKDAY: "bg-slate-100 text-slate-600",
  WEEKDAY_DAY: "bg-slate-100 text-slate-600",
  AFTERNOON_SHIFT: "bg-sky-50 text-sky-700",
  NIGHT_SHIFT: "bg-indigo-50 text-indigo-700",
  SATURDAY: "bg-amber-50 text-amber-700",
  SUNDAY: "bg-orange-50 text-orange-700",
  PUBLIC_HOLIDAY: "bg-rose-50 text-rose-700",
};

const money = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

/**
 * "My payroll" - every pay run the office has completed for this worker.
 *
 * Reads the frozen PayrollLine written at completion, not a live
 * recalculation. That is the point: these are figures that have been paid, so
 * they must not shift if a shift is edited afterwards.
 */
export default async function MyPayrollPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.staffId) redirect("/dashboard");

  const lines = await prisma.payrollLine.findMany({
    where: {
      tenantId: session.tenantId,
      staffId: session.staffId,
      period: { status: "APPROVED" },
    },
    include: {
      period: {
        select: {
          startDate: true,
          endDate: true,
          approvedAt: true,
          branch: { select: { name: true } },
        },
      },
    },
    orderBy: { period: { startDate: "desc" } },
  });

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <h1 className="mb-1 text-xl font-bold text-slate-900">My payroll</h1>
      <p className="mb-4 text-sm text-slate-500">
        Pay runs the office has completed. These are the figures you were paid,
        fixed at the time each run was completed.
      </p>

      {lines.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <span className="material-symbols-rounded text-[32px] text-slate-300">
            payments
          </span>
          <p className="mt-2 text-sm font-medium text-slate-700">
            No completed pay runs yet
          </p>
          <p className="mt-1 text-xs text-slate-500">
            When the office completes a pay run you worked in, it appears here
            and you get a notification.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {lines.map((l) => (
            <section
              key={l.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Pay period
                  </div>
                  <div className="text-base font-semibold text-slate-900">
                    {fmtDate(l.period.startDate)} - {fmtDate(l.period.endDate)}
                  </div>
                  {l.period.branch && (
                    <div className="text-xs text-slate-500">{l.period.branch.name}</div>
                  )}
                </div>
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                  Paid
                </span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Stat label="Shifts" value={String(l.shifts)} />
                <Stat label="Hours" value={l.hours.toFixed(2)} />
                <Stat label="Mileage" value={`${l.km.toFixed(1)} km`} />
              </div>

              {/* Hours by penalty band: why Sunday work is paid differently. */}
              {(() => {
                const bands = parse<Record<string, number>>(l.bands);
                if (!bands || Object.keys(bands).length === 0) return null;
                return (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {Object.entries(bands).map(([band, hours]) => (
                      <span
                        key={band}
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          BAND_STYLE[band] ?? "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {bandLabel(band)} {hours.toFixed(1)}h
                      </span>
                    ))}
                  </div>
                );
              })()}

              <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Wages</span>
                  <span className="tabular-nums">{money(l.wagePay)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Mileage allowance</span>
                  <span className="tabular-nums">{money(l.kmPay)}</span>
                </div>
                <div className="flex justify-between pt-1 text-base font-bold text-slate-900">
                  <span>Total pay</span>
                  <span className="tabular-nums">{money(l.total)}</span>
                </div>
              </div>

              {/* Shift by shift, so they can check the total themselves. */}
              {(() => {
                const detail = parse<Detail[]>(l.detail);
                if (!detail || detail.length === 0) return null;
                return (
                  <details className="mt-3 border-t border-slate-100 pt-3">
                    <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--brand)]">
                      See the {detail.length} shift{detail.length === 1 ? "" : "s"} behind this
                    </summary>
                    <ul className="mt-2 space-y-2">
                      {detail.map((d, i) => (
                        <li key={i} className="rounded-xl bg-slate-50 p-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-slate-900">{d.date}</div>
                              <div className="truncate text-xs text-slate-500">
                                {d.time} · {d.client}
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-sm font-bold text-slate-900">{money(d.pay)}</div>
                              <div className="text-[11px] text-slate-500">
                                {d.hours.toFixed(2)}h{d.rate > 0 ? ` @ ${money(d.rate)}/h` : ""}
                              </div>
                            </div>
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                BAND_STYLE[d.band] ?? "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {bandLabel(d.band)}
                              {d.holiday ? ` · ${d.holiday}` : ""}
                            </span>
                            {d.km > 0 && (
                              <span className="text-[11px] text-slate-500">
                                {d.km.toFixed(1)} km · {money(d.kmPay)}
                              </span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[11px] text-slate-400">
                      Pay counts the time inside your rostered hours, less any breaks.
                      Something look wrong? Tell the office before the next pay run.
                    </p>
                  </details>
                );
              })()}

              {l.period.approvedAt && (
                <p className="mt-2 text-[11px] text-slate-400">
                  Completed {fmtDate(l.period.approvedAt)}. Before tax and super.
                </p>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-2 py-2">
      <div className="text-base font-bold text-slate-900">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}
