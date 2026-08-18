"use client";

import { useEffect, useState } from "react";

/**
 * Push notifications: keeps this device's subscription registered, and asks
 * permission if we don't have it yet.
 *
 * Behaviour:
 *  - permission already granted → silently (re)subscribe, no UI. This keeps
 *    the stored subscription fresh when browsers rotate them.
 *  - permission not yet asked → a small banner offering to turn them on.
 *  - permission denied → nothing (only the browser can undo that).
 *  - iPhone not yet installed to the Home Screen → nothing, because iOS
 *    cannot deliver push in a normal Safari tab. InstallPrompt already nudges
 *    them to install, and we pick it up once they open the installed app.
 */

const DISMISS_KEY = "careshift-push-dismissed";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isIos() {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}
function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** Register the SW and store the subscription. Returns false if it couldn't. */
async function subscribe(publicKey: string): Promise<boolean> {
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  return res.ok;
}

export function PushRegistrar() {
  const [show, setShow] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const supported =
        typeof window !== "undefined" &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;
      if (!supported) return;
      // iOS can't do push until the app is installed — stay quiet.
      if (isIos() && !isStandalone()) return;
      if (Notification.permission === "denied") return;

      let key: string | null = null;
      try {
        const res = await fetch("/api/push/subscribe");
        const json = await res.json();
        if (!json?.enabled || !json?.publicKey) return;
        key = json.publicKey as string;
      } catch {
        return; // offline — try again next page load
      }
      if (cancelled || !key) return;
      setPublicKey(key);

      if (Notification.permission === "granted") {
        // Already allowed: just make sure the server has this device.
        await subscribe(key).catch(() => {});
        return;
      }

      if (localStorage.getItem(DISMISS_KEY) === "1") return;
      // Let the install banner have the stage first.
      setTimeout(() => {
        if (!cancelled) setShow(true);
      }, 2600);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!show) return null;

  async function enable() {
    if (!publicKey) return;
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError("Notifications were blocked — you can allow them in your browser settings.");
        setBusy(false);
        return;
      }
      const ok = await subscribe(publicKey);
      if (!ok) throw new Error("Couldn't save this device.");
      setShow(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-[200] flex justify-center p-4 pb-24 sm:pb-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-white p-4 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--brand)] text-white">
            <span className="material-symbols-rounded">notifications_active</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Turn on notifications
            </p>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              Get told straight away about new shifts, swaps and messages —
              even when the app is closed.
            </p>
          </div>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="-mr-1 -mt-1 ml-auto rounded-lg p-1 text-[var(--text-muted)] transition hover:bg-[var(--background)]"
          >
            <span className="material-symbols-rounded text-[20px]">close</span>
          </button>
        </div>

        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

        <div className="mt-3 flex gap-2">
          <button
            onClick={enable}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
          >
            <span className="material-symbols-rounded text-[18px]">notifications</span>
            {busy ? "Turning on…" : "Turn on"}
          </button>
          <button
            onClick={dismiss}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--background)]"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
