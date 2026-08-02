"use client";

import { useEffect } from "react";
import { pingPresence } from "@/app/(app)/actions";

/**
 * Keeps the signed-in user's presence fresh: pings on mount, every 45s while
 * the app is open, and whenever the tab becomes visible again. Renders nothing.
 */
export function PresenceHeartbeat() {
  useEffect(() => {
    const ping = () => {
      pingPresence().catch(() => {});
    };
    ping();
    const t = setInterval(ping, 45_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
