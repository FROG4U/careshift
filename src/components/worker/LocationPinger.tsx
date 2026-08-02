"use client";

import { useEffect } from "react";
import { pingLocation } from "@/app/my-shifts/actions";

/**
 * While the worker has a live/imminent shift, quietly report the device's
 * location every ~90s so the office can see where they are on Live Shifts.
 * Runs only when `enabled` (i.e. there's a shift happening around now).
 */
export function LocationPinger({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !navigator.geolocation)
      return;
    let cancelled = false;

    const send = () =>
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!cancelled) pingLocation(pos.coords.latitude, pos.coords.longitude);
        },
        () => {},
        { enableHighAccuracy: false, maximumAge: 60_000, timeout: 15_000 },
      );

    send();
    const t = setInterval(send, 90_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [enabled]);

  return null;
}
