"use client";

import { useState } from "react";
import {
  createTaskTemplate,
  updateTaskTemplate,
  deleteTaskTemplate,
} from "./actions";

export type TemplateRow = {
  id: string;
  title: string;
  notes: string;
  recurrence: string;
  days: number[];
  dueTime: string;
  reminder: boolean;
  reminderMinutesBefore: number;
};

// 0 = Sunday, matching Date#getDay(), but shown Monday-first like the roster.
const DAYS: { value: number; label: string }[] = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

const field =
  "mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15";

function describe(t: TemplateRow) {
  const when =
    t.recurrence === "DAYS"
      ? DAYS.filter((d) => t.days.includes(d.value))
          .map((d) => d.label)
          .join(", ") || "no days chosen"
      : "Every shift";
  return t.dueTime ? `${when} · due ${t.dueTime}` : when;
}

function TaskForm({
  clientId,
  template,
  onDone,
}: {
  clientId: string;
  template?: TemplateRow;
  onDone: () => void;
}) {
  const editing = Boolean(template);
  const [recurrence, setRecurrence] = useState(template?.recurrence ?? "EVERY");
  const [reminder, setReminder] = useState(template?.reminder ?? false);

  return (
    <form
      action={async (fd) => {
        if (editing) await updateTaskTemplate(fd);
        else await createTaskTemplate(fd);
        onDone();
      }}
      className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"
    >
      <input type="hidden" name="clientId" value={clientId} />
      {template && <input type="hidden" name="id" value={template.id} />}

      <label className="block text-sm font-medium text-[var(--text-primary)]">
        Task
        <input
          name="title"
          required
          defaultValue={template?.title}
          placeholder="e.g. Give 10am medication"
          className={field}
        />
      </label>

      <label className="block text-sm font-medium text-[var(--text-primary)]">
        Extra detail (optional)
        <textarea
          name="notes"
          rows={2}
          defaultValue={template?.notes}
          placeholder="Anything the worker needs to know"
          className={field}
        />
      </label>

      <div>
        <span className="text-sm font-medium text-[var(--text-primary)]">
          When
        </span>
        <div className="mt-1 flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="recurrence"
              value="EVERY"
              checked={recurrence === "EVERY"}
              onChange={() => setRecurrence("EVERY")}
            />
            Every shift
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="recurrence"
              value="DAYS"
              checked={recurrence === "DAYS"}
              onChange={() => setRecurrence("DAYS")}
            />
            Certain days only
          </label>
        </div>

        {recurrence === "DAYS" && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {DAYS.map((d) => (
              <label
                key={d.value}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs font-medium"
              >
                <input
                  type="checkbox"
                  name="days"
                  value={d.value}
                  defaultChecked={template?.days.includes(d.value)}
                />
                {d.label}
              </label>
            ))}
          </div>
        )}
      </div>

      <label className="block max-w-[12rem] text-sm font-medium text-[var(--text-primary)]">
        Due at (optional)
        <input
          name="dueTime"
          type="time"
          defaultValue={template?.dueTime}
          className={field}
        />
      </label>
      <p className="-mt-1 text-xs text-[var(--text-secondary)]">
        Leave blank if it just needs doing sometime during the shift.
      </p>

      <div className="rounded-lg border border-[var(--border)] bg-white p-3">
        <label className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
          <input
            type="checkbox"
            name="reminder"
            checked={reminder}
            onChange={(e) => setReminder(e.target.checked)}
            className="h-4 w-4"
          />
          Send the worker a reminder
        </label>
        {reminder && (
          <div className="mt-2 flex items-center gap-2 text-sm">
            <input
              name="reminderMinutesBefore"
              type="number"
              min="0"
              max="180"
              defaultValue={template?.reminderMinutesBefore ?? 15}
              className="w-20 rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
            />
            <span className="text-[var(--text-secondary)]">
              minutes before the due time
            </span>
          </div>
        )}
        <p className="mt-2 text-xs text-[var(--text-secondary)]">
          Timed tasks are pushed ahead of their due time. Untimed ones are
          included in a single nudge when the shift starts. The worker needs
          notifications turned on for these to reach their phone.
        </p>
      </div>

      <div className="flex gap-2 pt-1">
        <button className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white">
          {editing ? "Save task" : "Add task"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-[var(--text-secondary)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function TaskTemplates({
  clientId,
  templates,
  upcomingShifts,
}: {
  clientId: string;
  templates: TemplateRow[];
  upcomingShifts: number;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {templates.length > 0 && (
        <p className="text-xs text-[var(--text-secondary)]">
          Applies to {upcomingShifts} upcoming shift
          {upcomingShifts === 1 ? "" : "s"}. Changes never alter shifts already
          worked.
        </p>
      )}

      <ul className="space-y-2">
        {templates.map((t) =>
          editingId === t.id ? (
            <li key={t.id}>
              <TaskForm
                clientId={clientId}
                template={t}
                onDone={() => setEditingId(null)}
              />
            </li>
          ) : (
            <li
              key={t.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[var(--border)] bg-white p-4 shadow-sm"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[var(--text-primary)]">
                    {t.title}
                  </span>
                  {t.reminder && (
                    <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                      <span className="material-symbols-rounded text-[13px]">
                        notifications_active
                      </span>
                      {t.dueTime
                        ? `${t.reminderMinutesBefore} min before`
                        : "at shift start"}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-[var(--text-secondary)]">
                  {describe(t)}
                </div>
                {t.notes && (
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    {t.notes}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => setEditingId(t.id)}
                  className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--brand)]"
                >
                  Edit
                </button>
                <form action={deleteTaskTemplate}>
                  <input type="hidden" name="id" value={t.id} />
                  <button className="text-sm font-medium text-[var(--text-muted)] hover:text-red-600">
                    Remove
                  </button>
                </form>
              </div>
            </li>
          ),
        )}
      </ul>

      {templates.length === 0 && !adding && (
        <div className="rounded-xl border border-[var(--border)] bg-white p-8 text-center text-sm text-[var(--text-secondary)]">
          No tasks set yet. Add one and it appears on this participant&apos;s
          shifts for workers to tick off.
        </div>
      )}

      {adding ? (
        <TaskForm clientId={clientId} onDone={() => setAdding(false)} />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm"
        >
          + Add task
        </button>
      )}
    </div>
  );
}
