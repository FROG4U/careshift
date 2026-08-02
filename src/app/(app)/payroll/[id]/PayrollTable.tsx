"use client";

import { Fragment, useState } from "react";
import { initials } from "@/lib/format";
import { DAY_TYPE_LABELS, type DayType } from "@/lib/constants";

export type DayLine = {
  id: string;
  dateLabel: string; // "Mon 20 Jul"
  timeLabel: string; // "9:00 am – 12:00 pm"
  clientName: string;
  dayType: string;
  holidayName: string | null;
  hours: number;
  rate: number;
  km: number;
  kmPay: number;
  pay: number;
};

export type WorkerRow = {
  staffId: string;
  name: string;
  level: string;
  employment: string;
  shifts: number;
  hours: number;
  km: number;
  wagePay: number;
  kmPay: number;
  total: number;
  bands: Record<string, number>;
  unrated: boolean;
  lines: DayLine[];
};

export type Totals = {
  hours: number;
  km: number;
  wagePay: number;
  kmPay: number;
  total: number;
};

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

export function PayrollTable({
  report,
  totals,
}: {
  report: WorkerRow[];
  totals: Totals;
}) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <section className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-white shadow-sm">
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
            const isOpen = open === r.staffId;
            return (
              <Fragment key={r.staffId}>
                <tr
                  onClick={() => setOpen(isOpen ? null : r.staffId)}
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
                        {initials(...(r.name.split(" ") as [string, string]))}
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
                          {DAY_TYPE_LABELS[band as DayType] ?? band} {h.toFixed(1)}h
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
                                  {l.holidayName && (
                                    <span className="ml-1 text-[11px] text-rose-700">
                                      {l.holidayName}
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {l.hours.toFixed(2)}
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
