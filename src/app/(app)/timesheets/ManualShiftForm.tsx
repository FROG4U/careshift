"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createManualShift } from "./actions";

const field =
  "mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand)]";

/**
 * Add a shift the office knows happened but nobody clocked.
 *
 * Collapsed by default: the clocked path should stay the normal one, and this
 * should feel like the exception it is.
 */
export function ManualShiftForm({
  staff,
  clients,
}: {
  staff: { id: string; name: string }[];
  clients: { id: string; name: string }[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    setDone(null);
    startTransition(async () => {
      const res = await createManualShift(formData);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setDone(
        `Added ${res?.hours?.toFixed(2)} h for ${res?.worker}. It's waiting for approval below.`,
      );
      formRef.current?.reset();
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mb-5 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] shadow-sm transition hover:bg-[var(--background)]"
      >
        <span className="material-symbols-rounded text-[18px] text-[var(--brand)]">
          post_add
        </span>
        Add a shift manually
      </button>
    );
  }

  return (
    <div className="mb-5 rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-[var(--text-primary)]">
            Add a shift manually
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            For work that happened but was never clocked. It goes into the
            approval queue like any other shift, and is marked on the record as
            entered by you.
          </p>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          Close
        </button>
      </div>

      <form ref={formRef} action={submit} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-medium text-[var(--text-secondary)]">
            Support worker
            <select name="staffId" required defaultValue="" className={field}>
              <option value="" disabled>
                Choose a worker
              </option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-[var(--text-secondary)]">
            Participant
            <select name="clientId" required defaultValue="" className={field}>
              <option value="" disabled>
                Choose a participant
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <label className="block text-xs font-medium text-[var(--text-secondary)]">
            Date
            <input type="date" name="date" required className={field} />
          </label>
          <label className="block text-xs font-medium text-[var(--text-secondary)]">
            Start
            <input type="time" name="startTime" required className={field} />
          </label>
          <label className="block text-xs font-medium text-[var(--text-secondary)]">
            Finish
            <input type="time" name="endTime" required className={field} />
          </label>
          <label className="block text-xs font-medium text-[var(--text-secondary)]">
            Mileage km
            <input
              type="number"
              name="mileageKm"
              min="0"
              step="0.1"
              placeholder="optional"
              className={field}
            />
          </label>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          Times are read in the participant&apos;s local time.
        </p>

        <label className="block text-xs font-medium text-[var(--text-secondary)]">
          Why is this being entered by hand?
          <input
            name="reason"
            required
            maxLength={200}
            placeholder="Phone battery died mid-shift"
            className={field}
          />
        </label>

        <label className="block text-xs font-medium text-[var(--text-secondary)]">
          Shift notes
          <textarea
            name="note"
            required
            rows={3}
            placeholder="What happened on the shift. Required, or it can't be approved or paid."
            className={field}
          />
        </label>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {done && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {done}
          </p>
        )}

        <button
          disabled={pending}
          className="rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
          style={{ background: "var(--brand)" }}
        >
          {pending ? "Adding…" : "Add shift"}
        </button>
      </form>
    </div>
  );
}
