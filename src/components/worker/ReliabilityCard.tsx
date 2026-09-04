"use client";

import { useState } from "react";

type Band = "GREEN" | "AMBER" | "RED";

const BAND: Record<Band, { label: string; chip: string; bar: string; why: string }> = {
  GREEN: {
    label: "On track",
    chip: "bg-emerald-50 text-emerald-700",
    bar: "bg-emerald-500",
    why: "Great work — you're clocking in on time. Keep it up!",
  },
  AMBER: {
    label: "Needs attention",
    chip: "bg-amber-50 text-amber-700",
    bar: "bg-amber-500",
    why: "A few late starts are nudging your score down. Your most recent shifts count most, so clocking in on time will lift it again.",
  },
  RED: {
    label: "Action required",
    chip: "bg-red-50 text-red-700",
    bar: "bg-red-500",
    why: "Late starts or notices are affecting your score. Your most recent shifts count most, so a few on-time starts will bring it back up.",
  },
};

export function ReliabilityCard({
  score,
  band,
  total,
  clean,
  lateStarts,
  earlyFinishes,
  stayedLate,
  lateNotices,
  avgLateMin,
  graceMin,
}: {
  score: number;
  band: Band;
  total: number;
  clean: number;
  lateStarts: number;
  earlyFinishes: number;
  stayedLate: number;
  lateNotices: number;
  avgLateMin: number;
  graceMin: number;
}) {
  const [open, setOpen] = useState(false);
  const b = BAND[band];

  return (
    <>
      {/* ── Modern summary card ── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-500">My reliability</span>
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-0.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-[var(--brand)] transition hover:bg-slate-200"
          >
            View
            <span className="material-symbols-rounded text-[16px]">chevron_right</span>
          </button>
        </div>

        <div className="mt-1 flex items-end justify-between">
          <div className="flex items-baseline gap-0.5">
            <span className="text-4xl font-bold text-slate-900">{score}</span>
            <span className="text-lg font-bold text-slate-400">%</span>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${b.chip}`}>
            {b.label}
          </span>
        </div>

        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-2 rounded-full ${b.bar} transition-all`}
            style={{ width: `${Math.max(2, score)}%` }}
          />
        </div>

        <p className="mt-2 text-xs text-slate-400">
          {total === 0
            ? "Clock in and out on time to build your score."
            : `${clean} of ${total} shifts on time · ${graceMin} min grace`}
        </p>
      </section>

      {/* ── Summary popup ── */}
      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Your reliability</h2>
                <p className="text-xs text-slate-400">
                  Based on your last {total} completed shift{total === 1 ? "" : "s"}
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
              >
                <span className="material-symbols-rounded text-[20px]">close</span>
              </button>
            </div>

            <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4">
              <span className="text-4xl font-bold text-slate-900">{score}%</span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${b.chip}`}>
                {b.label}
              </span>
            </div>

            <p className="mt-3 text-sm text-slate-600">{b.why}</p>

            <div className="mt-4 space-y-2">
              <Row icon="check_circle" ok text={`${clean} of ${total} shifts on time`} />
              {lateStarts > 0 && (
                <Row
                  icon="schedule"
                  text={`${lateStarts} late start${lateStarts === 1 ? "" : "s"}${avgLateMin ? ` · avg ${avgLateMin} min` : ""}`}
                />
              )}
              {earlyFinishes > 0 && (
                <Row icon="logout" text={`${earlyFinishes} early finish${earlyFinishes === 1 ? "" : "es"}`} />
              )}
              {lateNotices > 0 && (
                <Row icon="notifications" text={`${lateNotices} running-late notice${lateNotices === 1 ? "" : "s"}`} />
              )}
              {stayedLate > 0 && (
                <Row icon="thumb_up" good text={`Stayed late ${stayedLate} time${stayedLate === 1 ? "" : "s"} — thank you!`} />
              )}
            </div>

            <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
              💡 Finishing late is <strong>never</strong> counted against you — only late
              starts and early finishes affect your score.
            </p>

            <button
              onClick={() => setOpen(false)}
              className="mt-5 w-full rounded-xl px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:opacity-90"
              style={{ background: "var(--brand)" }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Row({
  icon,
  text,
  ok,
  good,
}: {
  icon: string;
  text: string;
  ok?: boolean;
  good?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-slate-700">
      <span
        className={`material-symbols-rounded text-[20px] ${
          good ? "text-emerald-600" : ok ? "text-emerald-500" : "text-slate-400"
        }`}
      >
        {icon}
      </span>
      {text}
    </div>
  );
}
