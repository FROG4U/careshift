"use client";

import { useState, useTransition } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { requestSwap, cancelSwap } from "@/app/my-shifts/actions";

export type SwapCandidate = { id: string; name: string };
export type PendingSwap = { id: string; toName: string } | null;

/**
 * Worker-facing swap control for one shift. Candidates are the other workers
 * allocated to this participant — a swap must still be approved by an admin.
 */
export function ShiftSwap({
  shiftId,
  candidates,
  pending,
  canSwap = true,
}: {
  shiftId: string;
  candidates: SwapCandidate[];
  pending: PendingSwap;
  /** False when the shift is within 24h — swaps close 24h before. */
  canSwap?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();

  // Already requested — show status + let them cancel.
  if (pending) {
    return (
      <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2">
        <span className="text-xs font-medium text-amber-800">
          Swap to {pending.toName} — waiting for admin approval
        </span>
        <button
          onClick={() => {
            const fd = new FormData();
            fd.set("id", pending.id);
            start(() => cancelSwap(fd));
          }}
          disabled={busy}
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-amber-800 underline disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    );
  }

  // Swaps close 24 hours before the shift.
  if (!canSwap) {
    return (
      <div className="mt-3 flex items-center justify-center gap-1.5 rounded-full bg-slate-100 py-3 text-xs font-medium text-slate-400">
        <span className="material-symbols-rounded text-[16px]">lock_clock</span>
        Swaps close 24 hours before the shift
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <p className="mt-3 text-center text-xs text-slate-400">
        No other workers are allocated to this client to swap with.
      </p>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-slate-100 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-200 active:scale-[0.99]"
      >
        <span className="material-symbols-rounded text-[20px]">swap_horiz</span>
        Request swap
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} labelledBy="swap-title">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="swap-title" className="text-lg font-bold text-slate-900">Request a swap</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Close"
              >
                <span className="material-symbols-rounded text-[20px]">close</span>
              </button>
            </div>

            <p className="mb-3 text-xs text-slate-500">
              Pick a worker who also supports this client. An admin has to
              approve before the shift moves.
            </p>

            <form
              action={async (fd) => {
                await requestSwap(fd);
                setOpen(false);
              }}
              className="space-y-3"
            >
              <input type="hidden" name="shiftId" value={shiftId} />

              <label className="block text-sm font-medium text-slate-700">
                Swap to
                <select
                  name="toStaffId"
                  required
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-[var(--brand)]"
                >
                  <option value="">Choose a worker…</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Reason (optional)
                <input
                  name="reason"
                  placeholder="e.g. Doctor's appointment"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-[var(--brand)]"
                />
              </label>

              <button
                className="mt-1 w-full rounded-xl px-4 py-3 text-sm font-bold text-white"
                style={{ background: "var(--brand)" }}
              >
                Send request
              </button>
            </form>
      </Sheet>
    </>
  );
}
