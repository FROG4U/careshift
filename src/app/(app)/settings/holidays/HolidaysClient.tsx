"use client";

import { useState, useActionState } from "react";
import Link from "next/link";
import { AU_STATES } from "@/lib/constants";
import {
  createHoliday,
  updateHoliday,
  deleteHoliday,
  importHolidaysFromUrl,
  type ImportResult,
} from "./actions";

export type HolidayRow = {
  id: string;
  date: string; // YYYY-MM-DD
  dateLabel: string;
  name: string;
  state: string; // "" = national
};

const field =
  "mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100";

const EMPTY: HolidayRow = { id: "", date: "", dateLabel: "", name: "", state: "" };

export function HolidaysClient({
  rows,
  years,
  activeYear,
  activeState,
  total,
}: {
  rows: HolidayRow[];
  years: number[];
  activeYear: number;
  activeState: string;
  total: number;
}) {
  const [editing, setEditing] = useState<HolidayRow | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [result, importAction, importing] = useActionState<
    ImportResult | undefined,
    FormData
  >(importHolidaysFromUrl, undefined);

  const isNew = editing?.id === "";

  return (
    <>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Public Holidays
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Shifts on these dates are paid at the public-holiday rate. Holidays
            differ by state, so tag each one — branches pick up their own state&apos;s
            dates automatically. {total} stored in total.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="rounded-xl border border-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-[var(--brand)] transition hover:bg-blue-50"
          >
            ↓ Import from URL
          </button>
          <button
            onClick={() => setEditing(EMPTY)}
            className="rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
          >
            + Add holiday
          </button>
        </div>
      </header>

      {/* Year + state filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {years.map((y) => (
          <Link
            key={y}
            href={`/settings/holidays?year=${y}${activeState ? `&state=${activeState}` : ""}`}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
              y === activeYear
                ? "bg-[var(--brand)] text-white shadow-sm"
                : "border border-[var(--border)] bg-white text-[var(--text-secondary)] hover:bg-[var(--background)]"
            }`}
          >
            {y}
          </Link>
        ))}
        <span className="mx-1 h-5 w-px bg-[var(--border)]" />
        {[
          ["", "All"],
          ["NATIONAL", "National"],
          ...AU_STATES.map((s) => [s, s] as [string, string]),
        ].map(([val, label]) => (
          <Link
            key={val || "all"}
            href={`/settings/holidays?year=${activeYear}${val ? `&state=${val}` : ""}`}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              activeState === val
                ? "bg-slate-800 text-white"
                : "border border-[var(--border)] bg-white text-[var(--text-secondary)] hover:bg-[var(--background)]"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--background)] text-left text-xs uppercase tracking-wide text-[var(--text-secondary)]">
            <tr>
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-5 py-3 font-medium">Holiday</th>
              <th className="px-5 py-3 font-medium">Applies to</th>
              <th className="px-5 py-3 font-medium text-right">Edit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {rows.map((h) => (
              <tr
                key={h.id}
                className="cursor-pointer hover:bg-[var(--background)]"
                onClick={() => setEditing(h)}
              >
                <td className="px-5 py-3 font-medium text-[var(--text-primary)]">
                  {h.dateLabel}
                </td>
                <td className="px-5 py-3 text-[var(--text-secondary)]">{h.name}</td>
                <td className="px-5 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      h.state
                        ? "bg-[var(--pastel-blue)] text-blue-700"
                        : "bg-[var(--pastel-green)] text-green-700"
                    }`}
                  >
                    {h.state || "National"}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  <span className="material-symbols-rounded text-[18px] text-[var(--text-muted)]">
                    edit
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-[var(--text-muted)]">
                  No holidays for {activeYear}
                  {activeState ? ` · ${activeState}` : ""}. Add one, or import
                  from a URL.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Import from URL */}
      {showImport && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4"
          onClick={() => setShowImport(false)}
        >
          <div
            className="mt-12 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                Import holidays from a URL
              </h2>
              <button
                onClick={() => setShowImport(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                ✕
              </button>
            </div>

            <p className="mb-3 text-xs text-[var(--text-secondary)]">
              Paste a link to a <strong>CSV or JSON</strong> holiday file. It needs
              a date column and a holiday-name column; a state/jurisdiction
              column is used to tag each date. Ordinary web pages won&apos;t work —
              many government sites also block automated requests.
            </p>

            <form action={importAction} className="space-y-3">
              <label className="block text-sm font-medium text-[var(--text-primary)]">
                Feed URL
                <input
                  name="url"
                  required
                  placeholder="https://data.example.gov.au/holidays.csv"
                  className={field}
                />
              </label>
              <label className="block text-sm font-medium text-[var(--text-primary)]">
                Only import this year (optional)
                <input name="year" placeholder="2027" className={field} />
              </label>
              <button
                disabled={importing}
                className="w-full rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {importing ? "Fetching…" : "Fetch & import"}
              </button>
            </form>

            {result && (
              <div
                className={`mt-4 rounded-xl px-4 py-3 text-sm ${
                  result.ok
                    ? "bg-emerald-50 text-emerald-800"
                    : "bg-amber-50 text-amber-800"
                }`}
              >
                <p className="font-medium">{result.message}</p>
                {result.ok && result.skipped ? (
                  <p className="mt-1 text-xs">
                    {result.skipped} already present or duplicated — skipped.
                  </p>
                ) : null}
                {result.sample?.length ? (
                  <ul className="mt-2 space-y-0.5 text-xs">
                    {result.sample.map((s) => (
                      <li key={s}>· {s}</li>
                    ))}
                  </ul>
                ) : null}
                {result.ok && (
                  <p className="mt-2 text-xs">
                    Close this and check the list — delete anything that
                    doesn&apos;t apply to you.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add / edit holiday */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4"
          onClick={() => setEditing(null)}
        >
          <div
            className="mt-12 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                {isNew ? "Add public holiday" : "Edit public holiday"}
              </h2>
              <button
                onClick={() => setEditing(null)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                ✕
              </button>
            </div>

            <form
              action={async (fd) => {
                if (isNew) await createHoliday(fd);
                else await updateHoliday(fd);
                setEditing(null);
              }}
              className="space-y-3"
            >
              {!isNew && <input type="hidden" name="id" value={editing.id} />}
              <label className="block text-sm font-medium text-[var(--text-primary)]">
                Date
                <input
                  name="date"
                  type="date"
                  required
                  defaultValue={editing.date}
                  className={field}
                />
              </label>
              <label className="block text-sm font-medium text-[var(--text-primary)]">
                Holiday name
                <input
                  name="name"
                  required
                  defaultValue={editing.name}
                  placeholder="Australia Day"
                  className={field}
                />
              </label>
              <label className="block text-sm font-medium text-[var(--text-primary)]">
                Applies to
                <select name="state" defaultValue={editing.state} className={field}>
                  <option value="">National (all states)</option>
                  {AU_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s} only
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-center gap-2">
                <button className="mt-1 flex-1 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white">
                  {isNew ? "Add holiday" : "Save changes"}
                </button>
                {!isNew && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm(`Delete “${editing.name}”?`)) return;
                      const fd = new FormData();
                      fd.set("id", editing.id);
                      await deleteHoliday(fd);
                      setEditing(null);
                    }}
                    className="mt-1 rounded-xl px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
