"use client";

import { Fragment, useState } from "react";
import { initials } from "@/lib/format";
import { RatingBar, type Band } from "@/components/RatingBar";

export type ShiftLine = {
  id: string;
  dateLabel: string;
  clientName: string;
  rostered: string; // "9:00 am – 12:00 pm"
  actual: string; // "9:02 am – 12:20 pm" or "—"
  startDelta: string; // "2m late" / "on time" / "4m early"
  endDelta: string;
  lateStart: boolean;
  earlyFinish: boolean;
  stayedLate: boolean;
};

export type WorkerRow = {
  id: string;
  name: string;
  branch: string;
  score: number;
  band: Band;
  total: number;
  clean: number;
  lateStarts: number;
  earlyFinishes: number;
  stayedLate: number;
  lateNotices: number;
  avgLateLabel: string;
  lines: ShiftLine[];
};

export function AttendanceTable({ rows }: { rows: WorkerRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [branch, setBranch] = useState("ALL");

  const branches = Array.from(
    new Set(rows.map((r) => r.branch).filter(Boolean)),
  ).sort();
  const visible =
    branch === "ALL" ? rows : rows.filter((r) => r.branch === branch);

  return (
    <section className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-white shadow-sm">
      <div className="border-b border-[var(--border)] px-5 py-3">
        <h2 className="font-bold text-[var(--text-primary)]">
          Worker reliability
        </h2>
        <p className="text-xs text-[var(--text-muted)]">
          Click a worker to see the shifts behind their score.
        </p>
      </div>

      {/* Branch tabs */}
      {branches.length > 1 && (
        <div className="flex flex-wrap gap-2 border-b border-[var(--border)] px-5 py-3">
          {["ALL", ...branches].map((b) => {
            const active = branch === b;
            const count =
              b === "ALL" ? rows.length : rows.filter((r) => r.branch === b).length;
            return (
              <button
                key={b}
                onClick={() => setBranch(b)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                  active
                    ? "bg-[var(--brand)] text-white shadow-sm"
                    : "bg-white border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--background)]"
                }`}
              >
                {b === "ALL" ? "All staff" : b}{" "}
                <span className={active ? "opacity-80" : "text-[var(--text-muted)]"}>{count}</span>
              </button>
            );
          })}
        </div>
      )}
      <table className="w-full text-sm">
        <thead className="border-b border-[var(--border)] bg-[var(--background)] text-left text-xs uppercase tracking-wide text-[var(--text-secondary)]">
          <tr>
            <th className="px-5 py-3 font-medium">Worker</th>
            <th className="px-5 py-3 font-medium">Rating</th>
            <th className="px-3 py-3 font-medium text-right">Shifts</th>
            <th className="px-3 py-3 font-medium text-right">On time</th>
            <th className="px-3 py-3 font-medium text-right">Late starts</th>
            <th className="px-3 py-3 font-medium text-right">Early finish</th>
            <th className="px-3 py-3 font-medium text-right">Stayed late</th>
            <th className="px-3 py-3 font-medium text-right">Notices</th>
            <th className="px-5 py-3 font-medium text-right">Avg late</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {visible.map((r) => {
            const isOpen = open === r.id;
            return (
              <Fragment key={r.id}>
                <tr
                  onClick={() => setOpen(isOpen ? null : r.id)}
                  className="cursor-pointer hover:bg-[var(--background)]"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span
                        className={`material-symbols-rounded text-[20px] text-[var(--text-muted)] transition-transform ${isOpen ? "rotate-90" : ""}`}
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
                        {r.branch && (
                          <div className="text-xs text-[var(--text-muted)]">
                            {r.branch}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <RatingBar score={r.score} band={r.band} size="sm" />
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{r.total}</td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums text-emerald-700">
                    {r.clean}
                  </td>
                  <td
                    className={`px-3 py-3 text-right tabular-nums ${r.lateStarts ? "font-semibold text-red-600" : ""}`}
                  >
                    {r.lateStarts}
                  </td>
                  <td
                    className={`px-3 py-3 text-right tabular-nums ${r.earlyFinishes ? "font-semibold text-red-600" : ""}`}
                  >
                    {r.earlyFinishes}
                  </td>
                  <td
                    className={`px-3 py-3 text-right tabular-nums ${r.stayedLate ? "font-semibold text-emerald-700" : ""}`}
                  >
                    {r.stayedLate}
                  </td>
                  <td
                    className={`px-3 py-3 text-right tabular-nums ${r.lateNotices ? "font-semibold text-amber-600" : ""}`}
                  >
                    {r.lateNotices}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-[var(--text-secondary)]">
                    {r.avgLateLabel}
                  </td>
                </tr>

                {isOpen && (
                  <tr className="bg-[var(--background)]">
                    <td colSpan={9} className="px-5 py-4">
                      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white">
                        <table className="w-full text-xs">
                          <thead className="border-b border-[var(--border)] text-left uppercase tracking-wide text-[var(--text-muted)]">
                            <tr>
                              <th className="px-3 py-2 font-medium">Date</th>
                              <th className="px-3 py-2 font-medium">Participant</th>
                              <th className="px-3 py-2 font-medium">Rostered</th>
                              <th className="px-3 py-2 font-medium">Actual</th>
                              <th className="px-3 py-2 font-medium">Start</th>
                              <th className="px-3 py-2 font-medium">Finish</th>
                              <th className="px-3 py-2 font-medium">Result</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border)]">
                            {r.lines.map((l) => (
                              <tr key={l.id}>
                                <td className="px-3 py-2 font-medium text-[var(--text-primary)]">
                                  {l.dateLabel}
                                </td>
                                <td className="px-3 py-2 text-[var(--text-secondary)]">
                                  {l.clientName}
                                </td>
                                <td className="px-3 py-2 text-[var(--text-secondary)]">
                                  {l.rostered}
                                </td>
                                <td className="px-3 py-2 text-[var(--text-secondary)]">
                                  {l.actual}
                                </td>
                                <td
                                  className={`px-3 py-2 ${l.lateStart ? "font-semibold text-red-600" : "text-[var(--text-secondary)]"}`}
                                >
                                  {l.startDelta}
                                </td>
                                <td
                                  className={`px-3 py-2 ${
                                    l.earlyFinish
                                      ? "font-semibold text-red-600"
                                      : l.stayedLate
                                        ? "font-semibold text-emerald-700"
                                        : "text-[var(--text-secondary)]"
                                  }`}
                                >
                                  {l.endDelta}
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex flex-wrap gap-1">
                                    {l.lateStart && (
                                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                                        Late start
                                      </span>
                                    )}
                                    {l.earlyFinish && (
                                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                                        Early finish
                                      </span>
                                    )}
                                    {l.stayedLate && (
                                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                        Stayed late 👍
                                      </span>
                                    )}
                                    {!l.lateStart && !l.earlyFinish && !l.stayedLate && (
                                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                        On time
                                      </span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                            {r.lines.length === 0 && (
                              <tr>
                                <td
                                  colSpan={7}
                                  className="px-3 py-4 text-center text-[var(--text-muted)]"
                                >
                                  No completed shifts with clock-in and clock-out
                                  yet — nothing counted against them.
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
          {rows.length === 0 && (
            <tr>
              <td colSpan={9} className="px-5 py-10 text-center text-[var(--text-muted)]">
                No active staff yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
