"use client";

import { useState } from "react";
import { createBranch, renameBranch, deleteBranch } from "./actions";
import { AU_STATES } from "@/lib/constants";
import { STATE_TZ_LABELS, tzForState } from "@/lib/timezone";

export type BranchRow = {
  id: string;
  name: string;
  state: string | null;
  staff: number;
  clients: number;
};

const field =
  "rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100";

/** Human label for the branch's clock, e.g. "Brisbane time (AEST…)". */
function tzLabel(state: string | null) {
  if (!state) return null;
  return STATE_TZ_LABELS[state as keyof typeof STATE_TZ_LABELS] ?? tzForState(state);
}

function StateSelect({
  defaultValue,
  className = "",
}: {
  defaultValue?: string | null;
  className?: string;
}) {
  return (
    <select
      name="state"
      defaultValue={defaultValue ?? ""}
      className={`${field} ${className}`}
    >
      <option value="">State…</option>
      {AU_STATES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}

export function BranchesManager({ branches }: { branches: BranchRow[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const missingState = branches.some((b) => !b.state);

  return (
    <div className="max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-1 font-semibold text-slate-900">Branches / locations</h2>
      <p className="mb-4 text-sm text-slate-500">
        Each branch gets its own Schedule calendar. Assign workers and
        participants to a branch on their profiles. The state sets the branch&apos;s
        <strong> timezone and public holidays</strong> — which decide shift
        penalty rates, so it must be right.
      </p>

      {missingState && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ⚠ A branch has no state set. Until you choose one it falls back to
          Brisbane time (AEST), which will pay the wrong penalty rates for
          branches in other states.
        </p>
      )}

      <ul className="mb-4 divide-y divide-slate-100">
        {branches.map((b) => (
          <li key={b.id} className="flex items-center gap-3 py-2.5">
            {editingId === b.id ? (
              <form
                action={async (fd) => {
                  await renameBranch(fd);
                  setEditingId(null);
                }}
                className="flex flex-1 flex-wrap items-center gap-2"
              >
                <input type="hidden" name="id" value={b.id} />
                <input
                  name="name"
                  defaultValue={b.name}
                  autoFocus
                  className={`${field} flex-1`}
                />
                <StateSelect defaultValue={b.state} className="w-28" />
                <button className="rounded-lg bg-[var(--brand)] px-3 py-2 text-sm font-semibold text-white">
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="text-sm text-slate-400"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <>
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-800">
                    {b.name}
                    {b.state && (
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                        {b.state}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400">
                    {b.staff} staff · {b.clients} participants
                    {tzLabel(b.state) ? ` · ${tzLabel(b.state)}` : " · no state set"}
                  </div>
                </div>
                <button
                  onClick={() => setEditingId(b.id)}
                  className="text-sm font-medium text-slate-500 hover:text-[var(--brand)]"
                >
                  Edit
                </button>
                <form action={deleteBranch}>
                  <input type="hidden" name="id" value={b.id} />
                  <button className="text-sm font-medium text-slate-400 hover:text-red-600">
                    Delete
                  </button>
                </form>
              </>
            )}
          </li>
        ))}
        {branches.length === 0 && (
          <li className="py-4 text-center text-sm text-slate-400">
            No branches yet. Add your first location below.
          </li>
        )}
      </ul>

      <form action={createBranch} className="flex flex-wrap items-center gap-2">
        <input
          name="name"
          required
          placeholder="New branch name (e.g. Joondalup)"
          className={`${field} flex-1`}
        />
        <StateSelect className="w-28" />
        <button className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white">
          + Add branch
        </button>
      </form>
    </div>
  );
}
