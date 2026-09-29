"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { respondToDuty } from "@/app/(app)/schedule/dutyActions";

/**
 * A worker answering an invitation to a meeting, supervision or training.
 *
 * Declining asks for a reason: the office has to cover it or move it, and
 * "no" with nothing attached leaves them ringing round to find out why.
 */
export function DutyInvite({ dutyId }: { dutyId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function send(answer: "ACCEPT" | "DECLINE") {
    setError(null);
    const fd = new FormData();
    fd.set("dutyId", dutyId);
    fd.set("answer", answer);
    fd.set("reason", reason);
    start(async () => {
      const res = await respondToDuty(fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      {declining ? (
        <div className="space-y-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why can't you make it?"
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={() => send("DECLINE")}
              disabled={pending}
              className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {pending ? "Sending…" : "Send"}
            </button>
            <button
              onClick={() => setDeclining(false)}
              disabled={pending}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-600"
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => send("ACCEPT")}
            disabled={pending}
            className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {pending ? "Saving…" : "Accept"}
          </button>
          <button
            onClick={() => setDeclining(true)}
            disabled={pending}
            className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-600"
          >
            Can't make it
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
