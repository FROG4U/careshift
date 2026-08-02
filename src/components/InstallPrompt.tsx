"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// Permanent: user tapped "Maybe later" / X, or installed. Never nudge again.
const DISMISS_KEY = "careshift-install-dismissed";
// Per-session: user tapped "Show me how" (engaged) — quiet for this session,
// but nudge again next login. Matches "until installed or dismissed".
const SESSION_KEY = "careshift-install-hidden";

/**
 * A gentle "add to home screen" banner shown to signed-in users (workers and
 * admins) until they install the app or dismiss it. Reuses the /install page
 * for the full platform-specific steps, and offers Android's one-tap native
 * install when the browser provides it. Hidden entirely once the app runs
 * standalone (i.e. already installed).
 */
export function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);

  useEffect(() => {
    // Already installed / running from the home screen?
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;
    if (localStorage.getItem(DISMISS_KEY) === "1") return;
    if (sessionStorage.getItem(SESSION_KEY) === "1") return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    const onInstalled = () => {
      localStorage.setItem(DISMISS_KEY, "1");
      setShow(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // Small delay so it doesn't jump in the instant the page paints.
    const t = setTimeout(() => setShow(true), 1200);
    return () => {
      clearTimeout(t);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!show) return null;

  const dismissForever = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  };
  const hideForSession = () => {
    sessionStorage.setItem(SESSION_KEY, "1");
    setShow(false);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-[200] flex justify-center p-4 pb-24 sm:pb-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-white p-4 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--brand)] text-white">
            <span className="material-symbols-rounded">install_mobile</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Add CareShift to your home screen
            </p>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              Open it in one tap, like a normal app — no app store needed.
            </p>
          </div>
          <button
            onClick={dismissForever}
            aria-label="Dismiss"
            className="-mr-1 -mt-1 ml-auto rounded-lg p-1 text-[var(--text-muted)] transition hover:bg-[var(--background)]"
          >
            <span className="material-symbols-rounded text-[20px]">close</span>
          </button>
        </div>

        <div className="mt-3 flex gap-2">
          {deferred ? (
            <button
              onClick={async () => {
                await deferred.prompt();
                await deferred.userChoice;
                setDeferred(null);
                hideForSession();
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 active:scale-[0.98]"
            >
              <span className="material-symbols-rounded text-[18px]">install_mobile</span>
              Install
            </button>
          ) : (
            <Link
              href="/install"
              onClick={hideForSession}
              className="flex-1 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-center text-sm font-bold text-white transition hover:opacity-90 active:scale-[0.98]"
            >
              Show me how
            </Link>
          )}
          <button
            onClick={dismissForever}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--background)]"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
