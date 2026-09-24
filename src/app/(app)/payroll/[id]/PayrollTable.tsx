"use client";

import { Fragment, useState } from "react";
import { initialsFromName } from "@/lib/format";
import {
  DAY_TYPE_LABELS,
  STREAM_LABELS,
  type DayType,
  type StaffStream,
} from "@/lib/constants";
import type { DayLine, WorkerRow, Totals } from "@/lib/payReportTypes";

export type { DayLine, WorkerRow, Totals };

const money = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

/** Colour per penalty band so public holidays / weekends stand out. */
const bandStyle: Record<string, string> = {
  WEEKDAY: "bg-slate-100 text-slate-600",
  AFTERNOON_SHIFT: "bg-sky-50 text-sky-700",
  NIGHT_SHIFT: "bg-indigo-50 text-indigo-700",
  SATURDAY: "bg-amber-50 text-amber-700",
  SUNDAY: "bg-orange-50 text-orange-700",
  PUBLIC_HOLIDAY: "bg-rose-50 text-rose-700",
};


/** The actual pay lines: a band at one rate is one line, whatever else varies. */
function earningLines(r: WorkerRow) {
  const map = new Map<
    string,
    { band: string; stream: string; rate: number; hours: number }
  >();
  for (const l of r.lines) {
    const key = `${l.dayType}|${l.stream}|${l.rate}`;
    const cur = map.get(key) ?? {
      band: l.dayType,
      stream: l.stream,
      rate: l.rate,
      hours: 0,
    };
    cur.hours += l.hours;
    map.set(key, cur);
  }
  return [...map.values()].sort(
    (a, b) => a.band.localeCompare(b.band) || b.rate - a.rate,
  );
}

const streamLabel = (s: string) =>
  STREAM_LABELS[s as StaffStream] ?? s;

export function PayrollTable({
  report,
  totals,
  superRate = 0,
}: {
  report: WorkerRow[];
  totals: Totals;
  /**
   * Superannuation guarantee, e.g. 0.12. Shown beside the pay but never added
   * into it: super is paid to the worker's fund, not in this run's total, and
   * it is owed on wages only - a mileage allowance is not ordinary time
   * earnings.
   */
  superRate?: number;
}) {
  // Every worker starts open so each shift in the run is visible, the same way
  // Timesheets lists them. Collapsed rows read as "the shifts are missing".
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(report.map((r) => r.staffId)),
  );
  const allOpen = report.length > 0 && report.every((r) => open.has(r.staffId));
  const shiftTotal = report.reduce((n, r) => n + r.lines.length, 0);
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-white shadow-sm">
      {report.length > 0 && (
        <div className="no-print flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-2.5 text-sm">
          <span className="text-[var(--text-secondary)]">
            {shiftTotal} shift{shiftTotal === 1 ? "" : "s"} across {report.length} worker
            {report.length === 1 ? "" : "s"}
          </span>
          <button
            onClick={() =>
              setOpen(allOpen ? new Set() : new Set(report.map((r) => r.staffId)))
            }
            className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--background)]"
          >
            {allOpen ? "Hide shifts" : "Show every shift"}
          </button>
        </div>
      )}
      <table className="w-full text-sm">
        <thead className="border-b border-[var(--border)] bg-[var(--background)] text-left text-xs uppercase tracking-wide text-[var(--text-secondary)]">
          <tr>
            <th className="px-5 py-3 font-medium">Worker</th>
            <th className="px-3 py-3 font-medium text-right">Shifts</th>
            <th className="px-3 py-3 font-medium text-right">Hours</th>
            <th className="px-5 py-3 font-medium">Breakdown</th>
            <th className="px-3 py-3 font-medium text-right">KM</th>
            <th className="px-3 py-3 font-medium text-right">Wages</th>
            <th className="px-3 py-3 font-medium text-right">Mileage</th>
            <th className="px-5 py-3 font-medium text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {report.map((r) => {
            const isOpen = open.has(r.staffId);
            return (
              <Fragment key={r.staffId}>
                <tr
                  onClick={() => toggle(r.staffId)}
                  className="cursor-pointer hover:bg-[var(--background)]"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span
                        className={`material-symbols-rounded text-[20px] text-[var(--text-muted)] transition-transform ${
                          isOpen ? "rotate-90" : ""
                        }`}
                      >
                        chevron_right
                      </span>
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                        {initialsFromName(r.name)}
                      </span>
                      <div>
                        <div className="font-medium text-[var(--text-primary)]">
                          {r.name}
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">
                          {r.level}
                          {r.employment === "CASUAL" ? " · Casual" : ""}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{r.shifts}</td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">
                    {r.hours.toFixed(2)}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(r.bands).map(([band, h]) => (
                        <span
                          key={band}
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            bandStyle[band] ?? "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {DAY_TYPE_LABELS[band as DayType] ?? band} {h.toFixed(2)}h
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {r.km.toFixed(1)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {money(r.wagePay)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {money(r.kmPay)}
                  </td>
                  <td className="px-5 py-3 text-right font-bold tabular-nums text-[var(--text-primary)]">
                    {money(r.total)}
                    {superRate > 0 && (
                      <div className="text-[11px] font-normal text-[var(--text-secondary)]">
                        + {money(r.wagePay * superRate)} super
                      </div>
                    )}
                  </td>
                </tr>

                {/* Day-by-day detail for this worker */}
                {isOpen && (
                  <tr className="bg-[var(--background)]">
                    <td colSpan={8} className="px-5 py-4">
                      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white">
                        <table className="w-full text-xs">
                          <thead className="border-b border-[var(--border)] text-left uppercase tracking-wide text-[var(--text-muted)]">
                            <tr>
                              <th className="px-3 py-2 font-medium">Day</th>
                              <th className="px-3 py-2 font-medium">Time</th>
                              <th className="px-3 py-2 font-medium">Participant</th>
                              <th className="px-3 py-2 font-medium">Band</th>
                              <th className="px-3 py-2 font-medium text-right">Hours</th>
                              <th className="px-3 py-2 font-medium text-right">Rate</th>
                              <th className="px-3 py-2 font-medium text-right">KM</th>
                              <th className="px-3 py-2 font-medium text-right">Mileage</th>
                              <th className="px-3 py-2 font-medium text-right">Pay</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border)]">
                            {r.lines.map((l) => (
                              <tr key={l.id}>
                                <td className="px-3 py-2 font-medium text-[var(--text-primary)]">
                                  {l.dateLabel}
                                </td>
                                <td className="px-3 py-2 text-[var(--text-secondary)]">
                                  {l.timeLabel}
                                </td>
                                <td className="px-3 py-2 text-[var(--text-secondary)]">
                                  {l.clientName}
                                </td>
                                <td className="px-3 py-2">
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                      bandStyle[l.dayType] ??
                                      "bg-slate-100 text-slate-600"
                                    }`}
                                  >
                                    {DAY_TYPE_LABELS[l.dayType as DayType] ??
                                      l.dayType}
                                  </span>
                                  <span className="ml-1 text-[11px] text-[var(--text-secondary)]">
                                    {streamLabel(l.stream)}
                                  </span>
                                  {l.holidayName && (
                                    <span className="ml-1 text-[11px] text-rose-700">
                                      {l.holidayName}
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {l.hours.toFixed(2)}
                                  {l.topUpHours ? (
                                    <span
                                      className="ml-1 text-[10px] font-semibold text-emerald-700"
                                      title={`Topped up by ${Math.round(l.topUpHours * 60)} min to the 2 hour minimum engagement`}
                                    >
                                      min
                                    </span>
                                  ) : null}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {l.rate > 0 ? `${money(l.rate)}/h` : "—"}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {l.km ? l.km.toFixed(1) : "—"}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {l.kmPay ? money(l.kmPay) : "—"}
                                </td>
                                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                                  {money(l.pay)}
                                </td>
                              </tr>
                            ))}
                            {r.lines.length === 0 && (
                              <tr>
                                <td
                                  colSpan={9}
                                  className="px-3 py-4 text-center text-[var(--text-muted)]"
                                >
                                  No shifts.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>

                        {/* What to type into Xero.
                            The band chips above are rounded for reading, and
                            typing 5.3 where the worker did 5.2692 hours moves
                            the total by a dollar or two. These are the exact
                            figures, one line per earnings rate. */}
                        <div className="mt-4 rounded-xl border border-[var(--border)] bg-white p-3">
                          <div className="mb-2 flex items-center gap-2">
                            <span className="material-symbols-rounded text-[16px] text-[var(--text-secondary)]">
                              content_copy
                            </span>
                            <span className="text-xs font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                              Payroll - exact figures
                            </span>
                          </div>
                          <table className="w-full text-xs">
                            <thead className="text-left text-[var(--text-secondary)]">
                              <tr>
                                <th className="py-1 font-medium">Earnings rate</th>
                                <th className="py-1 text-right font-medium">Hours / KM</th>
                                <th className="py-1 text-right font-medium">Rate</th>
                                <th className="py-1 text-right font-medium">Total</th>
                              </tr>
                            </thead>
                            <tbody className="tabular-nums">
                              {earningLines(r).map((e) => (
                                <tr
                                  key={`${e.band}|${e.stream}|${e.rate}`}
                                  className="border-t border-[var(--border)]"
                                >
                                  <td className="py-1.5">
                                    {DAY_TYPE_LABELS[e.band as DayType] ?? e.band}
                                    <span className="ml-1 text-[var(--text-secondary)]">
                                      · {streamLabel(e.stream)}
                                    </span>
                                  </td>
                                  <td className="py-1.5 text-right font-semibold">
                                    {e.hours.toFixed(4)}
                                  </td>
                                  <td className="py-1.5 text-right">
                                    {e.rate.toFixed(2)}
                                  </td>
                                  <td className="py-1.5 text-right">
                                    {money(e.hours * e.rate)}
                                  </td>
                                </tr>
                              ))}
                              {r.km > 0 && (
                                <tr className="border-t border-[var(--border)]">
                                  <td className="py-1.5">Transport</td>
                                  <td className="py-1.5 text-right font-semibold">
                                    {r.km.toFixed(4)}
                                  </td>
                                  <td className="py-1.5 text-right">
                                    {(r.kmPay / r.km).toFixed(2)}
                                  </td>
                                  <td className="py-1.5 text-right">{money(r.kmPay)}</td>
                                </tr>
                              )}
                              <tr className="border-t-2 border-[var(--border)] font-bold">
                                <td className="py-1.5" colSpan={3}>
                                  Total
                                </td>
                                <td className="py-1.5 text-right">{money(r.total)}</td>
                              </tr>
                              {superRate > 0 && (
                                <tr className="text-[var(--text-secondary)]">
                                  <td className="py-1.5" colSpan={3}>
                                    Super {(superRate * 100).toFixed(1)}% of wages
                                    (not in the total above)
                                  </td>
                                  <td className="py-1.5 text-right">
                                    {money(r.wagePay * superRate)}
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                          <p className="mt-2 text-[11px] text-[var(--text-secondary)]">
                            These are the figures to enter in your payroll
                            system. Type the hours exactly as shown - rounding
                            them, as the coloured chips do, changes the total.
                          </p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}

          {report.length === 0 && (
            <tr>
              <td
                colSpan={8}
                className="px-5 py-10 text-center text-[var(--text-muted)]"
              >
                No completed shifts in this period for this branch.
              </td>
            </tr>
          )}
        </tbody>

        {report.length > 0 && (
          <tfoot className="border-t-2 border-[var(--border)] bg-[var(--background)] font-bold">
            <tr>
              <td className="px-5 py-3 text-[var(--text-primary)]">Totals</td>
              <td />
              <td className="px-3 py-3 text-right tabular-nums">
                {totals.hours.toFixed(2)}
              </td>
              <td />
              <td className="px-3 py-3 text-right tabular-nums">
                {totals.km.toFixed(1)}
              </td>
              <td className="px-3 py-3 text-right tabular-nums">
                {money(totals.wagePay)}
              </td>
              <td className="px-3 py-3 text-right tabular-nums">
                {money(totals.kmPay)}
              </td>
              <td className="px-5 py-3 text-right tabular-nums">
                {money(totals.total)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </section>
  );
}
