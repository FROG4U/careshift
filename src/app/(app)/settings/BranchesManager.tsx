"use client";

import { useState } from "react";
import { createBranch, renameBranch, deleteBranch } from "./actions";

export type BranchRow = { id: string; name: string; staff: number; clients: number };

const field =
  "rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100";

export function BranchesManager({ branches }: { branches: BranchRow[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-1 font-semibold text-slate-900">Branches / locations</h2>
      <p className="mb-4 text-sm text-slate-500">
        Each branch gets its own Schedule calendar. Assign workers and
        participants to a branch on their profiles.
      </p>

      <ul className="mb-4 divide-y divide-slate-100">
        {branches.map((b) => (
          <li key={b.id} className="flex items-center gap-3 py-2.5">
            {editingId === b.id ? (
              <form
                action={async (fd) => {
                  await renameBranch(fd);
                  setEditingId(null);
                }}
                className="flex flex-1 items-center gap-2"
              >
                <input type="hidden" name="id" value={b.id} />
                <input
                  name="name"
                  defaultValue={b.name}
                  autoFocus
                  className={`${field} flex-1`}
                />
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
                  </div>
                  <div className="text-xs text-slate-400">
                    {b.staff} staff · {b.clients} participants
                  </div>
                </div>
                <button
                  onClick={() => setEditingId(b.id)}
                  className="text-sm font-medium text-slate-500 hover:text-[var(--brand)]"
                >
                  Rename
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

      <form action={createBranch} className="flex items-center gap-2">
        <input
          name="name"
          required
          placeholder="New branch name (e.g. Joondalup)"
          className={`${field} flex-1`}
        />
        <button className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white">
          + Add branch
        </button>
      </form>
    </div>
  );
}
