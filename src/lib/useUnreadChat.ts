"use client";

import { useEffect, useState } from "react";

/** How often to re-check. Long enough to be cheap, short enough to feel live. */
const POLL_MS = 20000;

/**
 * Keeps the unread-message badge honest.
 *
 * `initial` is the server-rendered count from the `(app)` layout, so the badge
 * is correct on first paint with no flicker; polling then keeps it moving as
 * messages arrive and as you read them.
 *
 * Polling pauses while the tab is hidden — a backgrounded tab doesn't need a
 * fresh count, and every admin left open overnight would otherwise keep hitting
 * the database. Returning to the tab triggers an immediate re-check rather than
 * waiting out the interval.
 */
export function useUnreadChat(initial: number): number {
  const [polled, setPolled] = useState<number | null>(null);
  const [lastInitial, setLastInitial] = useState(initial);

  // A fresh server render — a reload, or a router.refresh() after sending a
  // message — carries a newer number than the last poll, so it wins. Adjusting
  // during render rather than in an effect avoids a throwaway second render.
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setPolled(null);
  }

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/chat/unread", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { unread?: number };
        if (!cancelled && typeof data.unread === "number") setPolled(data.unread);
      } catch {
        // Offline or mid-deploy: keep the last known count rather than
        // blanking a badge the user is relying on.
      }
    }

    const id = setInterval(check, POLL_MS);
    document.addEventListener("visibilitychange", check);
    check();

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  return polled ?? initial;
}
