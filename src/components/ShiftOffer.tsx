"use client";

import { useState, useTransition } from "react";
import { acceptShift, rejectShift } from "@/app/my-shifts/actions";

export function ShiftOffer({ shiftId }: { shiftId: string }) {
  const [pending, start] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  function submit(fn: (fd: FormData) => Promise<unknown>, withReason = false) {
    const fd = new FormData();
    fd.set("shiftId", shiftId);
    if (withReason) fd.set("reason", reason);
    start(() => {
      fn(fd);
    });
  }

  if (rejecting) {
    return (
      <div className="space-y-2">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          autoFocus
          placeholder="Reason for declining (the office will see this)…"
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
        />
        <div className="flex gap-2">
          <button
            onClick={() => submit(rejectShift, true)}
            disabled={pending || !reason.trim()}
            className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Sending…" : "Confirm decline"}
          </button>
          <button
            onClick={() => setRejecting(false)}
            disabled={pending}
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        onClick={() => submit(acceptShift)}
        disabled={pending}
        className="flex items-center justify-center gap-1.5 rounded-full bg-emerald-500 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-600 active:scale-[0.99] disabled:opacity-60"
      >
        <span className="material-symbols-rounded text-[18px]">check</span>
        {pending ? "…" : "Accept"}
      </button>
      <button
        onClick={() => setRejecting(true)}
        disabled={pending}
        className="flex items-center justify-center gap-1.5 rounded-full border border-slate-300 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
      >
        <span className="material-symbols-rounded text-[18px]">close</span>
        Decline
      </button>
    </div>
  );
}
