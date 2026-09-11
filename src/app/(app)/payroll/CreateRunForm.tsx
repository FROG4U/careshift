"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPayrollPeriod } from "./actions";

const input =
  "mt-1 block rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--brand)]";

/**
 * Create a pay run, or one per branch from the All branches view.
 *
 * A client component so a refusal - a branch that already has a run for those
 * dates - is shown, instead of the button quietly doing nothing.
 */
export function CreateRunForm({
  scope,
  scopeLabel,
}: {
  /** A branch id, or "all". */
  scope: string;
  scopeLabel: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);

  function submit(fd: FormData) {
    setError(null);
    setNotes([]);
    fd.set("scope", scope);
    start(async () => {
      const res = await createPayrollPeriod(fd);
      if (res.error) {
        setError(res.error);
        return;
      }
      setNotes(res.skipped ?? []);
      formRef.current?.reset();
      router.refresh();
    });
  }

  return (
    <div className="mb-5 rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
      <form ref={formRef} action={submit} className="flex flex-wrap items-end gap-3">
        <label className="block text-xs font-medium text-[var(--text-secondary)]">
          Pay period from
          <input type="date" name="from" required className={input} />
        </label>
        <label className="block text-xs font-medium text-[var(--text-secondary)]">
          To
          <input type="date" name="to" required className={input} />
        </label>
        <button
          disabled={pending}
          className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Creating…" : scope === "all" ? "+ Create for every branch" : "+ Create pay run"}
        </button>
        <span className="ml-auto self-center text-xs text-[var(--text-muted)]">
          {scopeLabel}
        </span>
      </form>
      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {notes.length > 0 && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Created the rest. Skipped: {notes.join("; ")}.
        </p>
      )}
    </div>
  );
}
