"use client";

import { useEffect, useState } from "react";
import type { SidebarCounts } from "./sidebarCounts";

/**
 * Keeps the sidebar badges current while someone sits in the app.
 *
 * The server renders them once when the shell loads. Next does not re-render
 * a layout as you navigate, so without this a queue that fills during the
 * day stays invisible until a hard refresh. Chat already polled for itself;
 * the approval queues did not, which is how a new worker could sit waiting
 * with nothing on screen to say so.
 *
 * Deliberately modest: every 45 seconds, only while the tab is visible, and
 * immediately when it becomes visible again. An admin coming back to the
 * window is the moment they most want to know.
 */
const POLL_MS = 45_000;

export function useLiveCounts(initial: SidebarCounts): SidebarCounts {
  const [polled, setPolled] = useState<SidebarCounts | null>(null);
  const [lastInitial, setLastInitial] = useState(initial);

  // A fresh server render - a reload, or a router.refresh() after approving
  // someone - is newer than any poll, so it wins. Adjusting during render
  // rather than in an effect avoids a throwaway second render.
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setPolled(null);
  }

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/badges", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as SidebarCounts;
        if (!cancelled && typeof data.pendingApprovals === "number") {
          setPolled(data);
        }
      } catch {
        // Offline or mid-deploy: keep the last known numbers rather than
        // blanking badges somebody is relying on.
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
