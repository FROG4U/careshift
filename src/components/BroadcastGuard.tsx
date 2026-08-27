"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markBroadcastRead } from "@/app/(app)/announcements/actions";
import type { PendingBroadcast } from "@/lib/broadcast";

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
 * An office announcement, shown until it's been opened and closed.
 *
 * Closing is what records it as read, and the office sees that. So the button
 * says what it does: this isn't a dismiss, it's a signature. If several are
 * waiting they come one at a time, oldest first, rather than stacking.
 */
export function BroadcastGuard({ item }: { item: PendingBroadcast }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function acknowledge() {
    setError(null);
    const fd = new FormData();
    fd.set("recipientId", item.recipientId);
    startTransition(async () => {
      const res = await markBroadcastRead(fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-[65] flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
        <div
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full text-white"
          style={{ background: "var(--brand)" }}
        >
          <span className="material-symbols-rounded text-[30px]">campaign</span>
        </div>

        <p className="text-center text-xs font-semibold uppercase tracking-wide text-slate-400">
          {item.fromLabel}
        </p>
        <h2 className="mt-1 text-center text-lg font-bold text-slate-900">
          {item.title}
        </h2>
        <p className="mt-0.5 text-center text-xs text-slate-400">
          {whenLabel(item.sentAt)}
        </p>

        <div className="mt-4 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-800">
          {item.body}
        </div>

        {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}

        <button
          onClick={acknowledge}
          disabled={pending}
          className="mt-6 w-full rounded-xl px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
          style={{ background: "var(--brand)" }}
        >
          {pending ? "Saving…" : "I've read this"}
        </button>
        <p className="mt-3 text-center text-xs text-slate-400">
          The office can see that you opened this, and when.
        </p>
      </div>
    </div>
  );
}
