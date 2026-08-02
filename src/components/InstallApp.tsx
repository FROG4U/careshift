"use client";

import { useEffect, useState } from "react";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Platform = "ios" | "android" | "desktop";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent || "";
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports as Mac but is touch-capable
    (/Macintosh/.test(ua) && "ontouchend" in document);
  if (isIOS) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <li className="flex gap-3">
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-xs font-bold text-white">
      {n}
    </span>
    <span className="pt-0.5 text-sm text-[var(--text-secondary)]">{children}</span>
  </li>
);

export function InstallApp() {
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());

    // Already running as an installed app?
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // iOS Safari
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) setInstalled(true);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-5 text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600">
          <span className="material-symbols-rounded text-2xl">check</span>
        </div>
        <p className="font-semibold text-green-800">You're all set 🎉</p>
        <p className="mt-1 text-sm text-green-700">
          PCG Care is installed on this device — open it from your home screen.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Android / Chrome — one-tap install when the browser offers it */}
      {deferred && (
        <button
          onClick={async () => {
            await deferred.prompt();
            await deferred.userChoice;
            setDeferred(null);
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-3.5 text-sm font-bold text-white shadow-sm transition hover:opacity-90 active:scale-[0.98]"
        >
          <span className="material-symbols-rounded text-[20px]">install_mobile</span>
          Install PCG Care
        </button>
      )}

      {platform === "ios" && (
        <div className="rounded-2xl border border-[var(--border)] bg-white p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <span className="material-symbols-rounded text-[20px] text-[var(--brand)]">ios_share</span>
            On iPhone (Safari)
          </div>
          <ol className="space-y-3">
            <Step n={1}>
              Tap the <strong>Share</strong> button (the square with an arrow) at
              the bottom of Safari.
            </Step>
            <Step n={2}>
              Scroll down and tap <strong>Add to Home Screen</strong>.
            </Step>
            <Step n={3}>
              Tap <strong>Add</strong> — the PCG Care icon appears on your home
              screen like a normal app.
            </Step>
          </ol>
        </div>
      )}

      {platform === "android" && !deferred && (
        <div className="rounded-2xl border border-[var(--border)] bg-white p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <span className="material-symbols-rounded text-[20px] text-[var(--brand)]">android</span>
            On Android / Samsung (Chrome)
          </div>
          <ol className="space-y-3">
            <Step n={1}>
              Tap the <strong>⋮ menu</strong> (top-right) in Chrome.
            </Step>
            <Step n={2}>
              Tap <strong>Install app</strong> (or <strong>Add to Home screen</strong>).
            </Step>
            <Step n={3}>
              Confirm — PCG Care is added to your home screen and app drawer.
            </Step>
          </ol>
        </div>
      )}

      {platform === "desktop" && !deferred && (
        <div className="rounded-2xl border border-[var(--border)] bg-white p-5 text-sm text-[var(--text-secondary)]">
          <p className="mb-3 font-semibold text-[var(--text-primary)]">
            Open this on your phone to install
          </p>
          <p>
            The app installs from a phone. On your iPhone open it in{" "}
            <strong>Safari</strong>; on Android/Samsung open it in{" "}
            <strong>Chrome</strong>, then use the browser menu to{" "}
            <strong>Add to Home Screen</strong>.
          </p>
        </div>
      )}
    </div>
  );
}
