"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acknowledgeHandover } from "@/app/my-shifts/actions";
import type { PendingHandover } from "@/lib/handover";

function whenLabel(iso: string) {
  const then = new Date(iso);
  const mins = Math.round((Date.now() - then.getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return then.toLocaleString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Shown once a worker has clocked in and the previous worker left a handover.
 *
 * Deliberately has no dismiss: the whole point is that the note gets read, and
 * a "Later" button would make it another thing to swipe away. There's nothing
 * to lose by acknowledging — the note stays on the shift record afterwards.
 */
export function HandoverGuard({ handover }: { handover: PendingHandover }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function acknowledge() {
    setError(null);
    const fd = new FormData();
    fd.set("fromShiftId", handover.fromShiftId);
    startTransition(async () => {
      const res = await acknowledgeHandover(fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sky-100 text-sky-600">
          <span className="material-symbols-rounded text-[36px]">swap_horiz</span>
        </div>

        <h2 className="text-center text-lg font-bold text-slate-900">
          Handover from the last shift
        </h2>
        <p className="mt-1 text-center text-sm text-slate-500">
          {handover.fromWorker} · {handover.clientName} ·{" "}
          {whenLabel(handover.writtenAt)}
        </p>

        <div className="mt-4 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm text-slate-800">
          {handover.body}
        </div>

        {error && (
          <p className="mt-3 text-center text-sm text-red-600">{error}</p>
        )}

        <button
          onClick={acknowledge}
          disabled={pending}
          className="mt-6 w-full rounded-xl px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
          style={{ background: "var(--brand)" }}
        >
          {pending ? "Saving…" : "I've read this"}
        </button>
        <p className="mt-3 text-center text-xs text-slate-400">
          Your name and the time are recorded on the shift.
        </p>
      </div>
    </div>
  );
}
