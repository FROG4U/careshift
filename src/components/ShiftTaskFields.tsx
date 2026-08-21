"use client";

import { useState } from "react";

/**
 * One-off tasks typed while creating a shift.
 *
 * These are extra to whatever the participant's recurring task list already
 * contributes — they're submitted as repeated `taskTitle` fields and become
 * ShiftTask rows on the new shift only.
 */
export function ShiftTaskFields() {
  const [tasks, setTasks] = useState<string[]>([]);
  const [draft, setDraft] = useState("");

  const add = () => {
    const t = draft.trim();
    if (!t) return;
    setTasks((prev) => [...prev, t]);
    setDraft("");
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-sm font-medium text-slate-700">
        Tasks for this shift
      </div>
      <p className="mt-0.5 text-xs text-slate-500">
        Just for this one. The participant&apos;s regular tasks are added
        automatically.
      </p>

      {tasks.length > 0 && (
        <ul className="mt-2 space-y-1">
          {tasks.map((t, i) => (
            <li
              key={`${t}-${i}`}
              className="flex items-center gap-2 rounded-md bg-white px-2.5 py-1.5 text-sm"
            >
              {/* Submitted with the form */}
              <input type="hidden" name="taskTitle" value={t} />
              <span className="material-symbols-rounded text-[16px] text-slate-400">
                check_box_outline_blank
              </span>
              <span className="min-w-0 flex-1 truncate text-slate-700">{t}</span>
              <button
                type="button"
                onClick={() => setTasks((p) => p.filter((_, j) => j !== i))}
                className="text-xs font-semibold text-slate-400 hover:text-red-600"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter adds a task rather than submitting the whole form.
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="e.g. Change bed linen"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
        />
        <button
          type="button"
          onClick={add}
          className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
        >
          Add
        </button>
      </div>
    </div>
  );
}
