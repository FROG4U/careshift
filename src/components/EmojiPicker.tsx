"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A small emoji picker.
 *
 * Deliberately a hand-picked list rather than a library: the full Unicode set
 * needs a large dependency and a data file, and this app is used one-handed
 * on a phone mid-shift. These are the ones people actually reach for at work.
 */
const GROUPS: { label: string; emoji: string[] }[] = [
  {
    label: "Common",
    emoji: ["👍", "👌", "🙏", "👏", "🙌", "💪", "🤝", "✅", "❌", "⭐", "🔥", "💯"],
  },
  {
    label: "Faces",
    emoji: ["😀", "😊", "🙂", "😅", "😂", "🥰", "😍", "🤔", "😐", "😕", "😢", "😴"],
  },
  {
    label: "Care",
    emoji: ["❤️", "💚", "🩺", "💊", "🚑", "🧼", "🍽️", "🚗", "🏠", "☀️", "🌙", "⏰"],
  },
  {
    label: "Signals",
    emoji: ["⚠️", "❗", "❓", "📌", "📝", "📞", "📷", "🎉", "☕", "👋", "🆗", "🔔"],
  },
];

export function EmojiPicker({
  onPick,
  align = "left",
}: {
  onPick: (emoji: string) => void;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close when clicking elsewhere or pressing Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Emoji"
        aria-label="Insert an emoji"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--brand)] hover:bg-[var(--background)]"
      >
        <span className="material-symbols-rounded text-[22px]">mood</span>
      </button>

      {open && (
        <div
          className={`absolute bottom-11 z-50 w-64 rounded-2xl border border-[var(--border)] bg-white p-2 shadow-xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <div className="max-h-56 overflow-y-auto">
            {GROUPS.map((g) => (
              <div key={g.label} className="mb-1.5">
                <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  {g.label}
                </div>
                <div className="grid grid-cols-6 gap-0.5">
                  {g.emoji.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => {
                        onPick(e);
                        setOpen(false);
                      }}
                      className="rounded-lg py-1.5 text-xl transition hover:bg-[var(--background)]"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
