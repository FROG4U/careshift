"use client";

import { useState } from "react";

/** Copies `value` to the clipboard and briefly shows a "Copied" state. */
export function CopyButton({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked — no-op */
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
    >
      <span className="material-symbols-rounded text-[18px]">
        {copied ? "check" : "content_copy"}
      </span>
      {copied ? "Copied" : label}
    </button>
  );
}
