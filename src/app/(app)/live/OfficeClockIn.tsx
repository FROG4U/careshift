"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { officeClockIn } from "./actions";

/**
 * Clock a worker in from the office, for someone on site who can't.
 *
 * Offers the rostered start as the default rather than "now": paid time is the
 * overlap of clocked and rostered, so stamping the current time on a shift
 * noticed 40 minutes late would silently dock the worker 40 minutes they were
 * actually working.
 */
export function OfficeClockIn({
  shiftId,
  worker,
  rosteredStartHm,
}: {
  shiftId: string;
  worker: string;
  rosteredStartHm: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState(rosteredStartHm);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    const fd = new FormData();
    fd.set("shiftId", shiftId);
    fd.set("startTime", time);
    startTransition(async () => {
      const res = await officeClockIn(fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition hover:bg-[var(--background)]"
      >
        They&apos;re on site — clock in
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900">
              Clock in {worker}?
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Use this when they&apos;re working but couldn&apos;t clock in
              themselves. They can still clock out normally at the end.
            </p>

            <label className="mt-4 block text-xs font-medium text-slate-600">
              Started at
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
              />
            </label>
            <p className="mt-1 text-xs text-slate-500">
              Defaults to the rostered start. Change it only if they genuinely
              began later, since this is what they&apos;re paid from.
            </p>

            {error && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="mt-5 flex gap-2">
              <button
                onClick={submit}
                disabled={pending}
                className="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
                style={{ background: "var(--brand)" }}
              >
                {pending ? "Clocking in…" : "Clock them in"}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Recorded as clocked in by you. No location is saved, because they
              didn&apos;t press anything.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
