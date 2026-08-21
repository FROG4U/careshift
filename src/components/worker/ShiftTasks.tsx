"use client";

import { useOptimistic, useTransition } from "react";
import { toggleShiftTask } from "@/app/my-shifts/actions";

export type TaskRow = {
  id: string;
  title: string;
  notes: string | null;
  dueTime: string | null;
  completed: boolean;
};

/**
 * The worker's checklist for a shift. Ticks apply optimistically so it feels
 * instant on a phone with poor reception, then reconcile with the server.
 */
export function ShiftTasks({
  tasks,
  disabled,
}: {
  tasks: TaskRow[];
  disabled?: boolean;
}) {
  const [optimistic, setOptimistic] = useOptimistic(
    tasks,
    (state: TaskRow[], id: string) =>
      state.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
  );
  const [, startTransition] = useTransition();

  if (tasks.length === 0) return null;

  const done = optimistic.filter((t) => t.completed).length;
  const allDone = done === optimistic.length;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold text-slate-900">Tasks for this shift</h2>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-bold ${
            allDone
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {done} of {optimistic.length} done
        </span>
      </div>

      <ul className="space-y-2">
        {optimistic.map((t) => (
          <li key={t.id}>
            <button
              disabled={disabled}
              onClick={() =>
                startTransition(async () => {
                  setOptimistic(t.id);
                  await toggleShiftTask(t.id);
                })
              }
              className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition active:scale-[0.99] disabled:opacity-60 ${
                t.completed
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-slate-200 bg-white"
              }`}
            >
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${
                  t.completed
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-slate-300"
                }`}
              >
                {t.completed && (
                  <span className="material-symbols-rounded text-[16px]">
                    check
                  </span>
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span
                  className={`block font-semibold ${
                    t.completed
                      ? "text-emerald-800 line-through"
                      : "text-slate-900"
                  }`}
                >
                  {t.title}
                </span>
                {t.dueTime && (
                  <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-slate-500">
                    <span className="material-symbols-rounded text-[14px]">
                      schedule
                    </span>
                    Due {t.dueTime}
                  </span>
                )}
                {t.notes && (
                  <span className="mt-1 block text-sm text-slate-500">
                    {t.notes}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {disabled && (
        <p className="mt-3 text-xs text-slate-400">
          Start the shift to tick tasks off.
        </p>
      )}
    </section>
  );
}
