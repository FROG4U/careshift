"use client";

import { useState } from "react";
import { reportRunningLate } from "@/app/my-shifts/actions";

const REASONS = [
  "Traffic / delay",
  "Public transport",
  "Previous shift ran over",
  "Personal emergency",
  "Unwell",
  "Other",
];

/**
 * "Running late" control on the worker's clock-in card. Asks for a reason so
 * the office knows, and records it against the shift.
 */
export function RunningLate({
  shiftId,
  alreadyReported,
}: {
  shiftId: string;
  alreadyReported: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (alreadyReported) {
    return (
      <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-800">
        The office has been told you&apos;re running late.
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-orange-500 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-orange-600 active:scale-[0.99]"
      >
        <span className="material-symbols-rounded text-[20px]">schedule</span>
        Running late
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Running late?</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Close"
              >
                <span className="material-symbols-rounded text-[20px]">close</span>
              </button>
            </div>

            <p className="mb-3 text-xs text-slate-500">
              Let the office know so they can support the participant. This is
              recorded against the shift.
            </p>

            <form
              action={async (fd) => {
                await reportRunningLate(fd);
                setOpen(false);
              }}
              className="space-y-3"
            >
              <input type="hidden" name="shiftId" value={shiftId} />

              <label className="block text-sm font-medium text-slate-700">
                Reason
                <select
                  name="reason"
                  required
                  defaultValue=""
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-[var(--brand)]"
                >
                  <option value="" disabled>
                    Choose a reason…
                  </option>
                  {REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium text-slate-700">
                How many minutes late? (optional)
                <input
                  name="etaMin"
                  type="number"
                  min="1"
                  placeholder="e.g. 15"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-[var(--brand)]"
                />
              </label>

              <button
                className="mt-1 w-full rounded-xl px-4 py-3 text-sm font-bold text-white"
                style={{ background: "var(--brand)" }}
              >
                Tell the office
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
