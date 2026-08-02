"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { daysUntil, initials } from "@/lib/format";
import {
  STAFF_STREAMS,
  STREAM_LABELS,
  DAY_TYPES,
  DAY_TYPE_LABELS,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_LABELS,
  CASUAL_LOADING,
  type StaffStream,
  type DayType,
  type EmploymentType,
} from "@/lib/constants";
import { createStaff, updateStaff, setStaffArchived } from "./actions";

export type LevelOption = {
  id: string;
  name: string;
  mileageRate: number;
  grid: Record<string, number>; // `${stream}_${dayType}`
};

export type BranchOption = { id: string; name: string };

export type StaffRow = {
  id: string;
  firstName: string;
  lastName: string;
  active: boolean;
  title: string;
  phone: string;
  email: string;
  branchId: string;
  branchName: string;
  clearanceType: string;
  clearanceExpiry: string;
  employmentType: string;
  payLevelId: string;
  payLevelName: string;
  mileageRate: number | null;
  wkNdis: number | null;
  wkAgedCare: number | null;
  wkDva: number | null;
  wkCleaning: number | null;
};

const field =
  "mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100";

const EMPTY: StaffRow = {
  id: "", firstName: "", lastName: "", active: true, title: "", phone: "", email: "",
  branchId: "", branchName: "",
  employmentType: "PERMANENT",
  clearanceType: "", clearanceExpiry: "", payLevelId: "", payLevelName: "",
  mileageRate: null, wkNdis: null, wkAgedCare: null, wkDva: null, wkCleaning: null,
};

function ClearanceBadge({ expiry }: { expiry: string }) {
  const days = daysUntil(expiry || null);
  if (days === null) return <span className="text-xs text-[var(--text-muted)]">No clearance</span>;
  if (days < 0) return <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Expired</span>;
  if (days <= 30) return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">{days}d left</span>;
  return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Current</span>;
}

const money = (n: number | null | undefined) => (n != null && n > 0 ? `$${n.toFixed(2)}` : "—");

export function StaffClient({
  rows,
  levels,
  branches,
}: {
  rows: StaffRow[];
  levels: LevelOption[];
  branches: BranchOption[];
}) {
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [status, setStatus] = useState<"ACTIVE" | "ARCHIVED">("ACTIVE");
  const [selLevel, setSelLevel] = useState("");
  const [selEmp, setSelEmp] = useState<EmploymentType>("PERMANENT");
  const isNew = editing?.id === "";

  const activeCount = rows.filter((r) => r.active).length;
  const archivedCount = rows.length - activeCount;
  const visible = rows.filter((r) => (status === "ACTIVE" ? r.active : !r.active));

  // Close on Escape. No background-click close — native date/select pickers can
  // emit stray backdrop clicks that would close the dialog mid-edit.
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditing(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);

  function open(row: StaffRow) {
    setSelLevel(row.payLevelId);
    setSelEmp(row.employmentType === "CASUAL" ? "CASUAL" : "PERMANENT");
    setEditing(row);
  }
  const preview = levels.find((l) => l.id === selLevel) ?? null;
  // Casual uses the SCHADS additive method: casual = base × (multiplier + loading)
  // = permanent cell + loading × weekday base (NOT permanent cell × 1.25).
  const cellRate = (stream: string, dayType: string): number | undefined => {
    if (!preview) return undefined;
    const cell = preview.grid[`${stream}_${dayType}`];
    if (cell == null) return undefined;
    if (selEmp !== "CASUAL") return cell;
    const base = preview.grid[`${stream}_WEEKDAY_DAY`] ?? 0;
    return cell + CASUAL_LOADING * base;
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">Staff</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Support workers, pay level and compliance status.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/staff/pay-levels"
            className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--background)]"
          >
            Pay levels
          </Link>
          <button
            onClick={() => open(EMPTY)}
            className="rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
          >
            + Add staff
          </button>
        </div>
      </header>

      {/* Active / Archived tabs */}
      <div className="mb-4 inline-flex rounded-xl border border-[var(--border)] bg-white p-1">
        {(
          [
            ["ACTIVE", "Active", activeCount],
            ["ARCHIVED", "Archived", archivedCount],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setStatus(key)}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
              status === key
                ? "bg-[var(--brand)] text-white shadow-sm"
                : "text-[var(--text-secondary)] hover:bg-[var(--background)]"
            }`}
          >
            {label}{" "}
            <span className={status === key ? "opacity-80" : "text-[var(--text-muted)]"}>
              {count}
            </span>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--background)] text-left text-xs uppercase tracking-wide text-[var(--text-secondary)]">
            <tr>
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Level</th>
              <th className="px-3 py-3 font-medium text-right">NDIS*</th>
              <th className="px-3 py-3 font-medium text-right">Aged Care*</th>
              <th className="px-3 py-3 font-medium text-right">DVA*</th>
              <th className="px-3 py-3 font-medium text-right">Cleaning*</th>
              <th className="px-3 py-3 font-medium text-right">Mileage</th>
              <th className="px-5 py-3 font-medium">Clearance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {visible.map((s) => (
              <tr key={s.id} className="cursor-pointer hover:bg-[var(--background)]" onClick={() => open(s)}>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                      {initials(s.firstName, s.lastName)}
                    </span>
                    <div>
                      <div className="font-medium text-[var(--text-primary)]">{s.firstName} {s.lastName}</div>
                      <div className="text-xs text-[var(--text-muted)]">
                        {s.title}
                        {s.title && s.branchName ? " · " : ""}
                        {s.branchName && (
                          <span className="text-[var(--brand)]">{s.branchName}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3">
                  <div className="flex flex-col items-start gap-1">
                    {s.payLevelName ? (
                      <span className="rounded-full bg-[var(--pastel-blue)] px-2.5 py-0.5 text-xs font-semibold text-blue-700">{s.payLevelName}</span>
                    ) : (
                      <span className="text-xs text-amber-600">Not set</span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        s.employmentType === "CASUAL"
                          ? "bg-orange-50 text-orange-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {s.employmentType === "CASUAL" ? "Casual +25%" : "Permanent"}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{money(s.wkNdis)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{money(s.wkAgedCare)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{money(s.wkDva)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{money(s.wkCleaning)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-[var(--text-secondary)]">
                  {s.mileageRate ? `$${s.mileageRate.toFixed(2)}/km` : "—"}
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <ClearanceBadge expiry={s.clearanceExpiry} />
                    <div className="flex items-center gap-1.5">
                      {s.phone && (
                        <a
                          href={`tel:${s.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[var(--text-muted)] hover:text-[var(--brand)]"
                          title={`Call ${s.firstName}`}
                          aria-label={`Call ${s.firstName}`}
                        >
                          <span className="material-symbols-rounded text-[18px] align-middle">
                            call
                          </span>
                        </a>
                      )}
                      <form action={setStaffArchived} onClick={(e) => e.stopPropagation()}>
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="archive" value={s.active ? "true" : "false"} />
                        <button
                          className="text-[var(--text-muted)] hover:text-amber-600"
                          title={s.active ? "Archive staff" : "Restore staff"}
                        >
                          <span className="material-symbols-rounded text-[18px] align-middle">
                            {s.active ? "archive" : "unarchive"}
                          </span>
                        </button>
                      </form>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={8} className="px-5 py-10 text-center text-[var(--text-muted)]">
                {status === "ARCHIVED" ? "No archived staff." : "No staff yet. Add your first team member."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        * Weekday base rate shown. Evening / weekend / public-holiday rates apply automatically by shift day.
      </p>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4">
          <div className="mt-12 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">{isNew ? "New staff member" : "Edit staff member"}</h2>
              <button onClick={() => setEditing(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">✕</button>
            </div>

            <form
              action={async (fd) => {
                if (isNew) await createStaff(fd);
                else await updateStaff(fd);
                setEditing(null);
              }}
              onKeyDown={(e) => {
                const el = e.target as HTMLElement;
                if (
                  e.key === "Enter" &&
                  el.tagName !== "TEXTAREA" &&
                  el.tagName !== "BUTTON"
                ) {
                  e.preventDefault();
                }
              }}
              className="space-y-3"
            >
              {!isNew && <input type="hidden" name="id" value={editing.id} />}
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-medium text-[var(--text-primary)]">First name
                  <input name="firstName" required defaultValue={editing.firstName} className={field} /></label>
                <label className="text-sm font-medium text-[var(--text-primary)]">Last name
                  <input name="lastName" required defaultValue={editing.lastName} className={field} /></label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-medium text-[var(--text-primary)]">Title / role
                  <input name="title" defaultValue={editing.title} className={field} placeholder="Support Worker" /></label>
                <label className="text-sm font-medium text-[var(--text-primary)]">Branch / location
                  <select name="branchId" defaultValue={editing.branchId} className={field}>
                    <option value="">Unassigned</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-medium text-[var(--text-primary)]">Phone
                  <input name="phone" defaultValue={editing.phone} className={field} /></label>
                <label className="text-sm font-medium text-[var(--text-primary)]">Email
                  <input name="email" type="email" defaultValue={editing.email} className={field} /></label>
              </div>

              {/* Employment basis + pay level + live rate grid preview */}
              <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm font-medium text-[var(--text-primary)]">Employment
                    <select
                      name="employmentType"
                      defaultValue={editing.employmentType}
                      onChange={(e) => setSelEmp(e.target.value as EmploymentType)}
                      className={field}
                    >
                      {EMPLOYMENT_TYPES.map((t) => (
                        <option key={t} value={t}>{EMPLOYMENT_LABELS[t]}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-[var(--text-primary)]">Pay level
                    <select name="payLevelId" defaultValue={editing.payLevelId} onChange={(e) => setSelLevel(e.target.value)} className={field}>
                      <option value="">No level selected</option>
                      {levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </label>
                </div>
                {selEmp === "CASUAL" && (
                  <p className="mt-2 text-xs font-medium text-orange-700">
                    Casual loading +{Math.round(CASUAL_LOADING * 100)}% applied to all rates below.
                  </p>
                )}

                {levels.length === 0 ? (
                  <p className="mt-2 text-xs text-amber-600">
                    No pay levels yet.{" "}
                    <Link href="/staff/pay-levels" className="font-semibold underline">Set up pay levels</Link>{" "}
                    to pull rates automatically.
                  </p>
                ) : preview ? (
                  <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--border)] bg-white">
                    <table className="w-full text-xs">
                      <thead className="bg-[var(--background)] text-[var(--text-muted)]">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium">Stream</th>
                          {DAY_TYPES.map((d) => (
                            <th key={d} className="px-2 py-1.5 text-right font-medium">{DAY_TYPE_LABELS[d as DayType]}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {STAFF_STREAMS.map((s) => (
                          <tr key={s} className="border-t border-[var(--border)]">
                            <td className="px-2 py-1.5 font-medium text-[var(--text-primary)]">{STREAM_LABELS[s as StaffStream]}</td>
                            {DAY_TYPES.map((d) => (
                              <td key={d} className="px-2 py-1.5 text-right tabular-nums text-[var(--text-secondary)]">
                                {money(cellRate(s, d))}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="border-t border-[var(--border)] px-2 py-1.5 text-right text-xs text-[var(--text-secondary)]">
                      Mileage: <span className="font-semibold text-[var(--text-primary)]">{money(preview.mileageRate)}/km</span>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-[var(--text-muted)]">
                    Select a level and the full rate grid (weekday → public holiday) + mileage fills in automatically.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-medium text-[var(--text-primary)]">Clearance type
                  <input name="clearanceType" defaultValue={editing.clearanceType} className={field} placeholder="NDIS Worker Screening" /></label>
                <label className="text-sm font-medium text-[var(--text-primary)]">Clearance expiry
                  <input name="clearanceExpiry" type="date" defaultValue={editing.clearanceExpiry} className={field} /></label>
              </div>

              <button className="mt-2 w-full rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white">
                {isNew ? "Save staff member" : "Save changes"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
