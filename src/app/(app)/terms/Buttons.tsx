"use client";

import { useTransition, useState } from "react";
import { createFromTemplate, createNextVersion } from "./actions";

/** First-run button: builds version 1 from the PCG template as a draft. */
export function StartTemplateButton() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        onClick={() =>
          start(async () => {
            const res = await createFromTemplate();
            if (res?.error) setError(res.error);
          })
        }
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
        style={{ background: "var(--brand)" }}
      >
        <span className="material-symbols-rounded text-[18px]">note_add</span>
        {pending ? "Creating…" : "Start from the PCG template"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

/** Copies the current wording into the next version, as a draft to edit. */
export function NewVersionButton() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        onClick={() =>
          start(async () => {
            const res = await createNextVersion();
            if (res?.error) setError(res.error);
          })
        }
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] shadow-sm transition hover:border-[var(--brand)] disabled:opacity-60"
      >
        <span className="material-symbols-rounded text-[18px]">edit_document</span>
        {pending ? "Creating…" : "Create next version"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
