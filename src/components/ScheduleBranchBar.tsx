"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addScheduleBranch } from "@/app/(app)/schedule/actions";

export type BranchTab = { id: string; name: string };

export function ScheduleBranchBar({
  branches,
  selected,
  week,
  isAdmin,
}: {
  branches: BranchTab[];
  selected: string;
  week?: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const href = (id: string) =>
    `/schedule?branch=${id}${week ? `&week=${week}` : ""}`;

  function create() {
    setErr(null);
    start(async () => {
      const res = await addScheduleBranch(name);
      if ("error" in res) {
        setErr(res.error);
        return;
      }
      setOpen(false);
      setName("");
      router.push(href(res.id));
    });
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {branches.map((b) => (
        <button
          key={b.id}
          onClick={() => router.push(href(b.id))}
          className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
            selected === b.id
              ? "bg-[var(--brand)] text-white shadow-sm"
              : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          {b.name}
        </button>
      ))}

      {isAdmin && (
        <button
          onClick={() => setOpen(true)}
          className="rounded-full border border-dashed border-[var(--brand)] px-3.5 py-1.5 text-sm font-semibold text-[var(--brand)] transition hover:bg-teal-50"
        >
          + Add schedule
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="mt-24 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Add schedule
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <label className="block text-sm font-medium text-slate-700">
              Branch / location name
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && create()}
                placeholder="e.g. Perth CBD"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              />
            </label>
            {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
            <button
              onClick={create}
              disabled={pending || !name.trim()}
              className="mt-4 w-full rounded-lg bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save & open schedule"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
