"use client";

import { useState, useTransition } from "react";
import { addShiftNotes } from "@/app/my-shifts/actions";

/**
 * Notes a worker has already submitted, and the way to change them.
 *
 * Editable until the coordinator approves the shift. After that they are
 * locked: the approval was given to what was written, and changing the words
 * underneath it would leave an approved record the coordinator never saw.
 */
export function SubmittedNotes({
  shiftId,
  note,
  approved,
  edited,
}: {
  shiftId: string;
  note: string;
  approved: boolean;
  edited: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    const fd = new FormData();
    fd.set("shiftId", shiftId);
    fd.set("note", draft);
    start(async () => {
      const res = await addShiftNotes(fd);
      if (res && "error" in res && res.error) {
        setError(res.error);
        return;
      }
      setEditing(false);
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-emerald-700">
          ✓ Notes submitted{edited ? " · edited" : ""}
        </span>
        {!approved && !editing && (
          <button
            onClick={() => {
              setDraft(note);
              setEditing(true);
            }}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-[var(--brand)] transition hover:bg-white"
          >
            <span className="material-symbols-rounded text-[15px]">edit</span>
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-2 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            autoFocus
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100"
          />
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={pending || !draft.trim()}
              className="flex-1 rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save changes"}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-white"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-700">{note}</p>
      )}

      {approved && (
        <p className="mt-2 text-[11px] text-slate-500">
          Approved by your coordinator, so these are locked. Ask them if
          something needs changing.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
