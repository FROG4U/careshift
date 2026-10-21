"use client";

import { useEffect } from "react";
import { refreshShifts, syncQueue } from "@/lib/clockQueue";

/**
 * Gets the phone ready to clock in with no signal, every time the app is
 * opened with one.
 *
 * Four things, none of which the worker should ever have to think about: send
 * anything the phone is still holding, save the roster so a scanned card can
 * be matched offline, make sure the service worker is installed, and ask for
 * /clock so it keeps a copy of that screen and its build assets.
 */
export function ClockPrep() {
  useEffect(() => {
    let done = false;

    const prepare = async () => {
      if (!navigator.onLine || done) return;
      done = true;
      await syncQueue();
      await refreshShifts();
      try {
        // Register it here rather than leaning on the push registrar: that one
        // only runs once a worker has agreed to notifications, and clocking in
        // somewhere with no signal can't wait on an unrelated permission.
        if ("serviceWorker" in navigator) {
          await navigator.serviceWorker.register("/sw.js");
          await navigator.serviceWorker.ready;
        }
        // Asks for the clock screen through the worker, which saves it along
        // with the build assets it needs. Keeps the saved copy current after
        // a deploy, when those asset names change.
        await fetch("/clock", { credentials: "same-origin" });
      } catch {
        /* nothing to do - the next launch tries again */
      }
    };

    // After the shift list has painted: this is housekeeping, not the point
    // of opening the app.
    const t = setTimeout(() => void prepare(), 1500);
    const retry = () => {
      done = false;
      void prepare();
    };
    window.addEventListener("online", retry);
    return () => {
      clearTimeout(t);
      window.removeEventListener("online", retry);
    };
  }, []);

  return null;
}
