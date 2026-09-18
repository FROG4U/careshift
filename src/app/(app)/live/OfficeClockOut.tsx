"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { officeClockOut } from "./actions";

/**
 * End a shift from the office, for a worker whose own clock-out didn't go
 * through (no signal, flat battery, app trouble). Without it a shift stayed
 * "live" all night with no way for the office to stop it.
 *
 * Defaults to the rostered finish: pay stops there anyway, and a stuck shift
 * is usually noticed long after the worker has gone home.
 */
export function OfficeClockOut({
  shiftId,
  worker,
  rosteredEndHm,
}: {
  shiftId: string;
  worker: string;
  rosteredEndHm: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState(rosteredEndHm);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    const fd = new FormData();
    fd.set("shiftId", shiftId);
    fd.set("endTime", time);
    startTransition(async () => {
      const res = await officeClockOut(fd);
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
        Finished but still clocked in? Clock out
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900">
              Clock out {worker}?
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Use this when they&apos;ve finished but their own clock-out
              didn&apos;t go through. They&apos;ll still need to add their shift
              notes before it can be approved.
            </p>

            <label className="mt-4 block text-xs font-medium text-slate-600">
              Finished at
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
              />
            </label>
            <p className="mt-1 text-xs text-slate-500">
              Defaults to the rostered finish. Change it if they left earlier.
              Pay never goes past the rostered finish.
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
                {pending ? "Clocking out…" : "Clock them out"}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Recorded as clocked out by you. No location is saved, because they
              didn&apos;t press anything.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
