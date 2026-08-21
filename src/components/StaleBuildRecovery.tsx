"use client";

import { useEffect } from "react";

/**
 * Recovers from deployment version skew.
 *
 * When a new version is deployed, Next.js regenerates the internal IDs behind
 * every server action. A page already open in someone's browser still holds
 * the old IDs, so the next button they press fails with "Failed to find
 * Server Action" — and the browser shows its own "This page couldn't load"
 * error, which looks like the app is broken.
 *
 * Care workers keep this open on a phone all day, so that is not acceptable.
 * We detect that specific failure and reload once, which fetches the new
 * build and carries on.
 *
 * Reload is capped at once per session: if something else were producing the
 * same error, looping would be worse than the original problem.
 */

const KEY = "careshift-stale-reload";

function looksLikeStaleBuild(message: string) {
  return (
    /failed to find server action/i.test(message) ||
    /older or newer deployment/i.test(message)
  );
}

export function StaleBuildRecovery() {
  useEffect(() => {
    // Surviving a few seconds means the page is healthy; allow a future
    // reload if a later deploy breaks it again.
    const settle = setTimeout(() => {
      try {
        sessionStorage.removeItem(KEY);
      } catch {
        /* private mode — nothing to clear */
      }
    }, 8000);

    const recover = (message: string) => {
      if (!looksLikeStaleBuild(message)) return;
      try {
        if (sessionStorage.getItem(KEY)) return; // already tried
        sessionStorage.setItem(KEY, "1");
      } catch {
        /* if storage is unavailable, still worth one reload */
      }
      window.location.reload();
    };

    const onError = (e: ErrorEvent) => recover(e.message ?? "");
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason as { message?: string } | string | undefined;
      recover(typeof r === "string" ? r : (r?.message ?? ""));
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      clearTimeout(settle);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
