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
 * Refreshes at once, EXCEPT where there is unsaved work on the page - a
 * half-filled form, or a dropdown someone has changed - in which case it
 * offers a tap-to-refresh bar and leaves the choice to them. Typed shift
 * notes are kept in the phone's storage, so a refresh doesn't lose them.
 */
export function UpdateWatcher({ buildId }: { buildId: string }) {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (buildId === "dev") return;
    let stopped = false;

    // Anything half-filled on the page. A reload throws it away, and the
    // person then saves whatever the form reset itself to - which is how an
    // incident was saved as "New" seconds after someone set it to "Under
    // review". Tracks changes rather than focus: a dropdown someone picked
    // and then clicked away from is still unsaved work, and so is a form
    // sitting behind a tab they switched away from.
    let dirty = false;
    const touched = () => {
      dirty = true;
    };
    const saved = () => {
      dirty = false;
    };
    document.addEventListener("input", touched, true);
    document.addEventListener("change", touched, true);
    document.addEventListener("submit", saved, true);

    const busy = () => {
      if (dirty) return true;
      const el = document.activeElement as HTMLElement | null;
      return (
        !!el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      );
    };

    const check = async (why: "timer" | "visible" | "failure") => {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { id } = (await res.json()) as { id?: string };
        if (stopped || !id || id === buildId) return;
        // Never reload over unsaved work, whatever prompted the check.
        if (busy()) setStale(true);
        else window.location.reload();
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
      document.removeEventListener("input", touched, true);
      document.removeEventListener("change", touched, true);
      document.removeEventListener("submit", saved, true);
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
