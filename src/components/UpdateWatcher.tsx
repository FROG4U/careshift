"use client";

import { useEffect, useState } from "react";

/** Fire this after a server action fails, to check straight away. */
export const CHECK_UPDATE_EVENT = "careshift:check-update";

/**
 * Refreshes the page when PCG Shift Care has been updated underneath it.
 *
 * A page left open across a deploy keeps pointing at server actions that no
 * longer exist, so its buttons fail until it is reloaded. Checks every two
 * minutes, whenever the app comes back on screen, and right after a failure.
 * Refreshes at once unless someone is mid-typing on a timer check, in which
 * case it offers a tap-to-refresh bar instead. Typed shift notes are kept in
 * the phone's storage, so a refresh doesn't lose them.
 */
export function UpdateWatcher({ buildId }: { buildId: string }) {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (buildId === "dev") return;
    let stopped = false;

    const typing = () => {
      const el = document.activeElement as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    };

    const check = async (why: "timer" | "visible" | "failure") => {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { id } = (await res.json()) as { id?: string };
        if (stopped || !id || id === buildId) return;
        if (why !== "timer" || !typing()) window.location.reload();
        else setStale(true);
      } catch {
        /* offline - try again next time */
      }
    };

    const timer = setInterval(() => void check("timer"), 120_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check("visible");
    };
    const onFailure = () => void check("failure");
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(CHECK_UPDATE_EVENT, onFailure);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(CHECK_UPDATE_EVENT, onFailure);
    };
  }, [buildId]);

  if (!stale) return null;
  return (
    <button
      onClick={() => window.location.reload()}
      className="fixed inset-x-0 top-0 z-[100] bg-amber-400 px-4 py-2.5 text-center text-sm font-semibold text-slate-900 shadow"
    >
      PCG Shift Care has been updated. Tap here to refresh.
    </button>
  );
}
