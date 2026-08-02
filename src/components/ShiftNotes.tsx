"use client";

import { useState, useEffect, useTransition } from "react";
import { addShiftNotes } from "@/app/my-shifts/actions";

/** Prompts the worker to add shift notes after a completed shift. Until notes
 *  are saved the shift is not payable; a 24h countdown + warning is shown. */
export function ShiftNotes({
  shiftId,
  clockOutIso,
}: {
  shiftId: string;
  clockOutIso: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Tick the countdown each minute.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const deadline = clockOutIso
    ? new Date(clockOutIso).getTime() + 24 * 60 * 60 * 1000
    : null;
  const hoursLeft =
    deadline != null ? Math.max(0, (deadline - now) / 3_600_000) : null;
  const overdue = hoursLeft != null && hoursLeft <= 0;

  function save() {
    setError(null);
    const fd = new FormData();
    fd.set("shiftId", shiftId);
    fd.set("note", note);
    start(async () => {
      const res = await addShiftNotes(fd);
      if (res && "error" in res && res.error) setError(res.error);
    });
  }

  return (
    <div
      className={`rounded-xl border px-3 py-3 ${
        overdue
          ? "border-red-300 bg-red-50"
          : "border-amber-300 bg-amber-50"
      }`}
    >
      <div className="flex items-start gap-2">
        <span
          className={`material-symbols-rounded text-[20px] ${overdue ? "text-red-600" : "text-amber-600"}`}
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          warning
        </span>
        <div className="flex-1">
          <div
            className={`text-sm font-semibold ${overdue ? "text-red-800" : "text-amber-800"}`}
          >
            Shift notes required
          </div>
          <div
            className={`text-xs ${overdue ? "text-red-700" : "text-amber-700"}`}
          >
            {overdue
              ? "Overdue — this shift is not counted as paid until you add notes."
              : `Add notes within ${hoursLeft != null ? Math.ceil(hoursLeft) : 24}h or this shift won't be paid.`}
          </div>
        </div>
      </div>

      {open ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            autoFocus
            placeholder="What did you do this shift? (required to be paid)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
          />
          <button
            onClick={save}
            disabled={pending || !note.trim()}
            className="w-full rounded-lg bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save shift notes"}
          </button>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className={`mt-3 w-full rounded-lg px-4 py-2 text-sm font-semibold text-white ${overdue ? "bg-red-600" : "bg-amber-500"}`}
        >
          + Add shift notes
        </button>
      )}
    </div>
  );
}
