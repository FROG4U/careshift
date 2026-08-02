"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { NOTES_WINDOW_H, type NoteDue } from "@/lib/notesDue";

function countdown(clockOutIso: string) {
  const deadline = new Date(clockOutIso).getTime() + NOTES_WINDOW_H * 3_600_000;
  const ms = deadline - Date.now();
  if (ms <= 0) return null;
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function NotesGuard({ dues }: { dues: NoteDue[] }) {
  const router = useRouter();
  const path = usePathname();
  const [dismissed, setDismissed] = useState(false);
  const [, setTick] = useState(0);

  // Re-render each minute so the countdown stays live.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  // Don't interrupt an open conversation with the popup.
  const inThread = /^\/my-shifts\/chat\/.+/.test(path);
  if (inThread || dismissed || dues.length === 0) return null;

  // Most urgent first (list is already ordered by clock-out time).
  const due = dues[0];
  const left = due.clockOutIso ? countdown(due.clockOutIso) : null;
  const overdue = due.overdue || left === null;
  const more = dues.length - 1;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
        <div
          className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
            overdue ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"
          }`}
        >
          <span className="material-symbols-rounded text-[36px]">
            {overdue ? "error" : "warning"}
          </span>
        </div>

        <h2 className="text-center text-lg font-bold text-slate-900">
          {overdue ? "Shift notes overdue" : "Time to fill your shift notes"}
        </h2>

        <p className="mt-2 text-center text-sm text-slate-600">
          Add notes for your shift with <strong>{due.client}</strong>.{" "}
          {overdue ? (
            <>
              This shift <strong>won't go to payroll</strong> until you add your
              notes — and you <strong>can't start new shifts</strong> until it's
              done.
            </>
          ) : (
            <>
              You have <strong>{left}</strong> left. After {NOTES_WINDOW_H} hours
              this shift <strong>won't go to payroll</strong>.
            </>
          )}
        </p>

        {more > 0 && (
          <p className="mt-2 text-center text-xs text-slate-400">
            +{more} other shift{more === 1 ? "" : "s"} also need notes.
          </p>
        )}

        <div className="mt-6 space-y-2">
          <button
            onClick={() => {
              setDismissed(true);
              router.push("/my-shifts/completed");
            }}
            className="w-full rounded-xl px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:opacity-90"
            style={{ background: "var(--brand)" }}
          >
            Fill now
          </button>
          {!overdue && (
            <button
              onClick={() => setDismissed(true)}
              className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-slate-500 transition hover:bg-slate-50"
            >
              Later
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
