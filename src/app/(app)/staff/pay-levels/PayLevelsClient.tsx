"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  STAFF_STREAMS,
  STREAM_LABELS,
  DAY_TYPES,
  DAY_TYPE_LABELS,
  type StaffStream,
  type DayType,
} from "@/lib/constants";
import {
  importAwardLevels,
  createPayLevel,
  updatePayLevel,
  deletePayLevel,
} from "./actions";

export type PayLevelRow = {
  id: string;
  name: string;
  award: string;
  mileageRate: number;
  seeded: boolean;
  grid: Record<string, number>; // key: `${stream}_${dayType}`
};

const field =
  "mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100";
const cellInput =
  "w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:border-[var(--brand)] focus:ring-1 focus:ring-blue-100";

const EMPTY: PayLevelRow = {
  id: "",
  name: "",
  award: "SCHADS",
  mileageRate: 0,
  seeded: false,
  grid: {},
};

const money = (n: number | undefined) => (n && n > 0 ? `$${n.toFixed(2)}` : "—");

export function PayLevelsClient({ rows }: { rows: PayLevelRow[] }) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<PayLevelRow | null>(null);
  const isNew = editing?.id === "";

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <Link
        href="/staff"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <span className="material-symbols-rounded text-[18px]">arrow_back</span>
        Staff
      </Link>

      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Pay Levels
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Award rates by level — each stream has weekday, evening, weekend,
            public-holiday and mileage rates. Set once; pick the level per worker.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {rows.length === 0 && (
            <button
              onClick={() => start(() => importAwardLevels())}
              className="rounded-xl border border-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-[var(--brand)] transition hover:bg-blue-50"
            >
              ↓ Import SCHADS levels
            </button>
          )}
          <button
            onClick={() => setEditing(EMPTY)}
            className="rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
          >
            + New level
          </button>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-white p-12 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--pastel-green)]">
            <span className="material-symbols-rounded text-[28px] text-green-600">stairs</span>
          </div>
          <p className="font-medium text-[var(--text-primary)]">No pay levels yet</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Import the SCHADS starter levels, or create your own.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((l) => (
            <button
              key={l.id}
              onClick={() => setEditing(l)}
              className="block w-full rounded-2xl border border-[var(--border)] bg-white p-5 text-left shadow-sm transition hover:border-[var(--brand)]"
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-[var(--text-primary)]">{l.name}</span>
                  {l.award && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {l.award}
                    </span>
                  )}
                  {l.seeded && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                      Seeded · verify
                    </span>
                  )}
                </div>
                <span className="text-sm text-[var(--text-secondary)]">
                  Mileage {money(l.mileageRate)}/km · click to edit
                </span>
              </div>
              {/* Compact rate grid preview */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[var(--text-muted)]">
                      <th className="py-1 pr-3 text-left font-medium">Stream</th>
                      {DAY_TYPES.map((d) => (
                        <th key={d} className="px-2 py-1 text-right font-medium">
                          {DAY_TYPE_LABELS[d as DayType]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {STAFF_STREAMS.map((s) => (
                      <tr key={s} className="border-t border-[var(--border)]">
                        <td className="py-1 pr-3 font-medium text-[var(--text-primary)]">
                          {STREAM_LABELS[s as StaffStream]}
                        </td>
                        {DAY_TYPES.map((d) => (
                          <td key={d} className="px-2 py-1 text-right tabular-nums text-[var(--text-secondary)]">
                            {money(l.grid[`${s}_${d}`])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </button>
          ))}
        </div>
      )}

      {rows.some((r) => r.seeded) && (
        <p className="mt-3 text-xs text-amber-600">
          Seeded penalty rates are derived from representative SCHADS bases
          (Sat ×1.5, Sun ×2, Public Holiday ×2.5, evening ×1.15) — verify against
          the current Fair Work pay guide before payroll.
        </p>
      )}

      {pending && <p className="mt-3 text-xs text-[var(--text-muted)]">Saving…</p>}

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4"
          onClick={() => setEditing(null)}
        >
          <div
            className="mt-12 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                {isNew ? "New pay level" : `Edit ${editing.name}`}
              </h2>
              <button onClick={() => setEditing(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                ✕
              </button>
            </div>

            <form
              action={async (fd) => {
                if (isNew) await createPayLevel(fd);
                else await updatePayLevel(fd);
                setEditing(null);
              }}
              className="space-y-4"
            >
              {!isNew && <input type="hidden" name="id" value={editing.id} />}
              <div className="grid grid-cols-3 gap-3">
                <label className="text-sm font-medium text-[var(--text-primary)]">
                  Level name
                  <input name="name" required defaultValue={editing.name} className={field} placeholder="SCHADS L2.3" />
                </label>
                <label className="text-sm font-medium text-[var(--text-primary)]">
                  Award
                  <input name="award" defaultValue={editing.award} className={field} placeholder="SCHADS" />
                </label>
                <label className="text-sm font-medium text-[var(--text-primary)]">
                  Mileage ($/km)
                  <input name="mileageRate" type="number" step="0.01" min="0" defaultValue={editing.mileageRate || ""} className={field} />
                </label>
              </div>

              {/* Rate grid: stream rows × day-type columns */}
              <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--background)] text-xs uppercase tracking-wide text-[var(--text-secondary)]">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Stream \ Day</th>
                      {DAY_TYPES.map((d) => (
                        <th key={d} className="px-2 py-2 text-right font-medium">
                          {DAY_TYPE_LABELS[d as DayType]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {STAFF_STREAMS.map((s) => (
                      <tr key={s} className="border-t border-[var(--border)]">
                        <td className="px-3 py-2 font-medium text-[var(--text-primary)] whitespace-nowrap">
                          {STREAM_LABELS[s as StaffStream]}
                        </td>
                        {DAY_TYPES.map((d) => (
                          <td key={d} className="px-1.5 py-1.5">
                            <input
                              name={`rate_${s}_${d}`}
                              type="number"
                              step="0.01"
                              min="0"
                              defaultValue={editing.grid[`${s}_${d}`] || ""}
                              className={cellInput}
                              placeholder="0.00"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-2">
                <button className="flex-1 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white">
                  {isNew ? "Create level" : "Save changes"}
                </button>
                {!isNew && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Delete level "${editing.name}"?`)) {
                        const fd = new FormData();
                        fd.set("id", editing.id);
                        start(() => deletePayLevel(fd));
                        setEditing(null);
                      }
                    }}
                    className="rounded-xl px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
