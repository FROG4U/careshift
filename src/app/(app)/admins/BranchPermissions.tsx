"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setBranchAccess } from "./actions";

export type BranchRow = { id: string; name: string; state: string | null; hq: boolean };
export type AccessRow = { branchId: string; ops: boolean; finance: boolean; message: boolean };
type Kind = "ops" | "finance" | "message";

const KINDS: { key: Kind; label: string; hint: string }[] = [
  { key: "ops", label: "Shifts & people", hint: "Roster, participants, workers, timesheets, incidents" },
  { key: "finance", label: "Finances", hint: "Wages, pay runs, participant charges, money figures" },
  { key: "message", label: "Messaging", hint: "Chat with, and announce to, this branch's people" },
];

/**
 * What one admin may see, branch by branch.
 *
 * "All branches" is the default and how head office works. Turn it off and
 * the ticks decide: a branch manager gets their own branch only, and cannot
 * reach another branch's shifts, people or money even by typing the URL.
 */
export function BranchPermissions({
  userId,
  name,
  allBranches,
  branches,
  access,
}: {
  userId: string;
  name: string;
  allBranches: boolean;
  branches: BranchRow[];
  access: AccessRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [all, setAll] = useState(allBranches);
  const [rows, setRows] = useState<Record<string, AccessRow>>(() => {
    const map: Record<string, AccessRow> = {};
    for (const b of branches) {
      const found = access.find((a) => a.branchId === b.id);
      map[b.id] = found ?? { branchId: b.id, ops: false, finance: false, message: false };
    }
    return map;
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hq = branches.filter((b) => b.hq);
  const own = branches.filter((b) => !b.hq);

  const toggle = (branchId: string, kind: Kind) => {
    setSaved(false);
    setRows((prev) => ({
      ...prev,
      [branchId]: { ...prev[branchId], [kind]: !prev[branchId][kind] },
    }));
  };

  const tickGroup = (group: BranchRow[], kind: Kind, value: boolean) => {
    setSaved(false);
    setRows((prev) => {
      const next = { ...prev };
      for (const b of group) next[b.id] = { ...next[b.id], [kind]: value };
      return next;
    });
  };

  function save() {
    setError(null);
    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("allBranches", all ? "1" : "");
    fd.set("access", JSON.stringify(Object.values(rows)));
    start(async () => {
      const res = await setBranchAccess(fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  // What their current setting amounts to, for the collapsed row.
  const summary = all
    ? "All branches"
    : branches
        .filter((b) => rows[b.id]?.ops || rows[b.id]?.finance || rows[b.id]?.message)
        .map((b) => {
          const r = rows[b.id];
          const bits = [r.ops && "shifts", r.finance && "finances", r.message && "messaging"]
            .filter(Boolean)
            .join(", ");
          return `${b.name} (${bits})`;
        })
        .join(" · ") || "No branches yet";

  const groupRow = (label: string, group: BranchRow[]) =>
    group.length === 0 ? null : (
      <div className="mt-3">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
            {label}
          </span>
          {group.length > 1 && (
            <span className="text-[11px] text-slate-400">
              tick all:
              {KINDS.map((k) => (
                <button
                  key={k.key}
                  type="button"
                  onClick={() => tickGroup(group, k.key, !group.every((b) => rows[b.id]?.[k.key]))}
                  className="ml-1.5 font-semibold text-[var(--brand)] hover:underline"
                >
                  {k.label.toLowerCase()}
                </button>
              ))}
            </span>
          )}
        </div>
        {group.map((b) => (
          <div key={b.id} className="flex flex-wrap items-center gap-x-5 gap-y-1 py-2">
            <span className="w-32 shrink-0 text-sm font-medium text-slate-800">
              {b.name}
              {b.state ? <span className="text-slate-400"> · {b.state}</span> : null}
            </span>
            {KINDS.map((k) => (
              <label key={k.key} className="flex items-center gap-1.5 text-xs text-slate-600" title={k.hint}>
                <input
                  type="checkbox"
                  checked={rows[b.id]?.[k.key] ?? false}
                  onChange={() => toggle(b.id, k.key)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                {k.label}
              </label>
            ))}
          </div>
        ))}
      </div>
    );

  return (
    <div className="mt-2 w-full">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-semibold text-[var(--brand)] hover:underline"
      >
        <span className="material-symbols-rounded text-[16px]">
          {open ? "expand_less" : "expand_more"}
        </span>
        Branch access: <span className="font-normal text-slate-500">{summary}</span>
      </button>

      {open && (
        <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <label className="flex items-start gap-2 text-sm font-medium text-slate-800">
            <input
              type="checkbox"
              checked={all}
              onChange={() => {
                setAll((v) => !v);
                setSaved(false);
              }}
              className="mt-0.5 h-4 w-4 rounded border-slate-300"
            />
            <span>
              All branches
              <span className="block text-xs font-normal text-slate-500">
                {name} sees every branch, including anything not yet assigned to
                one. Turn this off to limit them to the branches below.
              </span>
            </span>
          </label>

          {!all && (
            <>
              {groupRow("Head office (HQ)", hq)}
              {own.map((b) => groupRow(b.name, [b]))}
              {branches.length === 0 && (
                <p className="mt-3 text-xs text-slate-500">
                  No branches exist yet. Add one in Settings first.
                </p>
              )}
            </>
          )}

          {error && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
          )}

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={save}
              disabled={pending}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--brand)" }}
            >
              {pending ? "Saving…" : "Save access"}
            </button>
            {saved && <span className="text-xs font-medium text-emerald-600">Saved</span>}
          </div>
          <p className="mt-3 text-[11px] text-slate-400">
            Takes effect immediately, on their next page load. Super admins
            always see every branch.
          </p>
        </div>
      )}
    </div>
  );
}
