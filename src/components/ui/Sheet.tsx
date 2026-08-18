"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * A bottom sheet / modal that renders into <body> via a portal.
 *
 * Why a portal: several worker screens wrap content in `relative z-*`
 * containers (e.g. the Start button that overlaps the map) or use
 * `isolation: isolate` to keep Leaflet's panes in check. Both create a
 * stacking context, which traps any modal rendered inside them BELOW the
 * floating bottom nav no matter how high its z-index is. Portalling to
 * <body> is the only reliable fix.
 *
 * Also handles the things a hand-rolled overlay usually forgets: locking the
 * background from scrolling, Escape to close, scrolling when the content is
 * taller than the screen, and clearing the iPhone home indicator.
 */
export function Sheet({
  open,
  onClose,
  children,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      // Above the bottom nav (z-40) and the install/push banners (z-200).
      className="fixed inset-0 z-[300] flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] shadow-xl sm:rounded-3xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
