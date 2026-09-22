"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setBranchAccess } from "./actions";

/** One line of ticks: the whole of HQ, or one branch run separately. */
export type AccessGroup = {
  key: string;
  label: string;
  detail: string;
  /** An HQ branch: "Whole of HQ" already covers it. */
  hq: boolean;
  /** The "Whole of HQ" row itself. */
  isGroup: boolean;
};
export type GroupTicks = { key: string; ops: boolean; finance: boolean; message: boolean };
type Kind = "ops" | "finance" | "message";

const KINDS: { key: Kind; label: string; hint: string }[] = [
  { key: "ops", label: "Shifts & people", hint: "Schedule, participants, staff, timesheets, live shifts, incidents, leave" },
  { key: "finance", label: "Finances", hint: "Wages, pay runs, participant charges, sales and profit" },
  { key: "message", label: "Messaging", hint: "Chat with, and announcements to, that group's staff" },
];

/**
 * What one admin or super admin may see, ticked group by group:
 * "Whole of HQ", "Whole of HQ finances", "Whole of Perth", and so on.
 *
 * Someone never set up sees everything, so they show as fully ticked; saving
 * turns their ticks into exactly what's shown. Enforced on the server for
 * every screen and action, not just hidden in the menu.
 */
export function BranchPermissions({
  userId,
  name,
  groups,
  initial,
  isMe,
}: {
  userId: string;
  name: string;
  groups: AccessGroup[];
  initial: GroupTicks[];
  isMe: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ticks, setTicks] = useState<Record<string, GroupTicks>>(() => {
    const map: Record<string, GroupTicks> = {};
    for (const g of groups) {
      map[g.key] = initial.find((t) => t.key === g.key) ?? {
        key: g.key,
        ops: false,
        finance: false,
        message: false,
      };
    }
    return map;
  });
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (key: string, kind: Kind) => {
    setDirty(true);
    setSaved(false);
    setTicks((prev) => ({ ...prev, [key]: { ...prev[key], [kind]: !prev[key][kind] } }));
  };

  const nothing = Object.values(ticks).every((t) => !t.ops && !t.finance && !t.message);
  // An HQ branch's box is already covered when "Whole of HQ" has that tick.
  const coveredByHq = (g: AccessGroup, kind: Kind) => g.hq && Boolean(ticks.HQ?.[kind]);
  const losesHq = isMe && groups.some((g) => g.key === "HQ") && !ticks.HQ?.ops;

  function save() {
    setError(null);
    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("groups", JSON.stringify(Object.values(ticks)));
    start(async () => {
      const res = await setBranchAccess(fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setDirty(false);
      setSaved(true);
      router.refresh();
    });
  }

  if (groups.length === 0) {
    return (
      <p className="mt-2 w-full text-xs text-slate-400">
        No branches yet. Add them in Settings, then tick access here.
      </p>
    );
  }

  return (
    <div className="mt-3 w-full overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/60">
      <table className="w-full min-w-[30rem] text-sm">
        <thead>
          <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <th className="px-3 py-2 font-semibold">{name} can see</th>
            {KINDS.map((k) => (
              <th key={k.key} className="px-3 py-2 text-center font-semibold" title={k.hint}>
                {k.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200/70">
          {groups.map((g) => (
            <tr key={g.key} className={g.isGroup ? "bg-white" : ""}>
              <td className={`px-3 py-2 ${g.hq ? "pl-7" : ""}`}>
                <div className={`text-slate-800 ${g.isGroup ? "font-semibold" : "font-medium"}`}>
                  {g.label}
                </div>
                <div className="text-[11px] text-slate-400">{g.detail}</div>
              </td>
              {KINDS.map((k) => {
                const covered = coveredByHq(g, k.key);
                return (
                  <td key={k.key} className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${g.label}: ${k.label}`}
                      title={covered ? "Included in Whole of HQ" : undefined}
                      checked={covered || (ticks[g.key]?.[k.key] ?? false)}
                      disabled={covered}
                      onChange={() => toggle(g.key, k.key)}
                      className="h-4 w-4 rounded border-slate-300 disabled:opacity-40"
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-200/70 px-3 py-2.5">
        <button
          onClick={save}
          disabled={pending}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          style={{ background: "var(--brand)" }}
        >
          {pending ? "Saving…" : "Save access"}
        </button>
        {saved && <span className="text-xs font-medium text-emerald-600">Saved</span>}
        {dirty && !saved && !nothing && (
          <span className="text-xs text-slate-500">Unsaved changes</span>
        )}
        {dirty && nothing && (
          <span className="text-xs text-amber-700">
            Nothing ticked: {name} will see no shifts, people or money.
          </span>
        )}
        {dirty && losesHq && (
          <span className="text-xs text-amber-700">
            Without Whole of HQ you lose Settings and branch management.
          </span>
        )}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}
