"use client";

import { useState } from "react";

/**
 * Tasks added while creating a shift.
 *
 * Everything the admin needs is here — the task, whether it repeats, and
 * whether to remind the worker — so they never have to go to a second screen
 * to finish setting one up.
 *
 * The list is submitted as one JSON field because it's a dynamic set of rows
 * with nested day selections; repeated form fields can't express that cleanly.
 */

export type DraftTask = {
  title: string;
  /** ONCE = this shift only · EVERY = every shift · DAYS = chosen weekdays */
  recurrence: "ONCE" | "EVERY" | "DAYS";
  days: number[];
  dueTime: string;
  reminder: boolean;
  reminderMinutesBefore: number;
};

const DAYS: { value: number; label: string }[] = [
  { value: 1, label: "M" },
  { value: 2, label: "T" },
  { value: 3, label: "W" },
  { value: 4, label: "T" },
  { value: 5, label: "F" },
  { value: 6, label: "S" },
  { value: 0, label: "S" },
];

const EMPTY: DraftTask = {
  title: "",
  recurrence: "ONCE",
  days: [],
  dueTime: "",
  reminder: false,
  reminderMinutesBefore: 15,
};

function summary(t: DraftTask) {
  const when =
    t.recurrence === "EVERY"
      ? "Every shift"
      : t.recurrence === "DAYS"
        ? DAYS.filter((d) => t.days.includes(d.value))
            .map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.value])
            .join(", ") || "no days picked"
        : "This shift only";
  const bits = [when];
  if (t.dueTime) bits.push(`due ${t.dueTime}`);
  if (t.reminder) {
    bits.push(t.dueTime ? `remind ${t.reminderMinutesBefore}m before` : "remind at start");
  }
  return bits.join(" · ");
}

export function ShiftTaskFields() {
  const [tasks, setTasks] = useState<DraftTask[]>([]);
  const [draft, setDraft] = useState<DraftTask>(EMPTY);

  const update = (patch: Partial<DraftTask>) =>
    setDraft((d) => ({ ...d, ...patch }));

  const toggleDay = (day: number) =>
    setDraft((d) => ({
      ...d,
      days: d.days.includes(day)
        ? d.days.filter((x) => x !== day)
        : [...d.days, day],
    }));

  const add = () => {
    const title = draft.title.trim();
    if (!title) return;
    // "Certain days" with nothing picked would never fire — treat as every shift.
    const recurrence =
      draft.recurrence === "DAYS" && draft.days.length === 0
        ? "EVERY"
        : draft.recurrence;
    setTasks((prev) => [...prev, { ...draft, title, recurrence }]);
    setDraft(EMPTY);
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-sm font-medium text-slate-700">Tasks</div>
      <p className="mt-0.5 text-xs text-slate-500">
        What the worker needs to tick off. Repeating ones are saved to the
        participant and appear on their future shifts too.
      </p>

      {/* Tasks queued for this shift */}
      {tasks.length > 0 && (
        <ul className="mt-2 space-y-1">
          {tasks.map((t, i) => (
            <li
              key={`${t.title}-${i}`}
              className="flex items-start gap-2 rounded-md bg-white px-2.5 py-2 text-sm"
            >
              <span className="material-symbols-rounded mt-0.5 text-[16px] text-slate-400">
                check_box_outline_blank
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-800">
                  {t.title}
                </span>
                <span className="block text-[11px] text-slate-500">
                  {summary(t)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setTasks((p) => p.filter((_, j) => j !== i))}
                className="shrink-0 text-xs font-semibold text-slate-400 hover:text-red-600"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Everything the tasks need travels in one field */}
      <input type="hidden" name="tasksJson" value={JSON.stringify(tasks)} />

      {/* Builder */}
      <div className="mt-2 space-y-2 rounded-md border border-slate-200 bg-white p-2.5">
        <input
          value={draft.title}
          onChange={(e) => update({ title: e.target.value })}
          onKeyDown={(e) => {
            // Enter adds the task rather than submitting the whole shift form.
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="e.g. Change bed linen"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
        />

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={draft.recurrence}
            onChange={(e) =>
              update({ recurrence: e.target.value as DraftTask["recurrence"] })
            }
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-[var(--brand)]"
          >
            <option value="ONCE">This shift only</option>
            <option value="EVERY">Every shift</option>
            <option value="DAYS">Certain days</option>
          </select>

          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            Due
            <input
              type="time"
              value={draft.dueTime}
              onChange={(e) => update({ dueTime: e.target.value })}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-[var(--brand)]"
            />
          </label>
        </div>

        {draft.recurrence === "DAYS" && (
          <div className="flex flex-wrap gap-1">
            {DAYS.map((d, i) => (
              <button
                key={`${d.value}-${i}`}
                type="button"
                onClick={() => toggleDay(d.value)}
                className={`h-7 w-7 rounded-md border text-xs font-bold transition ${
                  draft.days.includes(d.value)
                    ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                    : "border-slate-300 bg-white text-slate-500"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={draft.reminder}
              onChange={(e) => update({ reminder: e.target.checked })}
            />
            Remind the worker
          </label>
          {draft.reminder && draft.dueTime && (
            <span className="flex items-center gap-1 text-xs text-slate-600">
              <input
                type="number"
                min="0"
                max="180"
                value={draft.reminderMinutesBefore}
                onChange={(e) =>
                  update({ reminderMinutesBefore: Number(e.target.value) || 0 })
                }
                className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-xs"
              />
              min before
            </span>
          )}
          {draft.reminder && !draft.dueTime && (
            <span className="text-xs text-slate-500">at the start of the shift</span>
          )}

          <button
            type="button"
            onClick={add}
            className="ml-auto rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-white"
          >
            Add task
          </button>
        </div>
      </div>
    </div>
  );
}
