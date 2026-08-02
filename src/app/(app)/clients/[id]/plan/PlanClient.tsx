"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { DAY_NAMES, AGREEMENT_LABELS, AGREEMENT_BADGE, type AgreementType } from "@/lib/constants";
import { addPlanSlot, updatePlanSlot, deletePlanSlot, generateRoster } from "./actions";

export type RateOption = { id: string; label: string; price: number; unit: string };
export type PlanSlotView = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  priceItemId: string;
  mileageKm: number | null;
  notes: string;
};

const field =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100";

function hoursOf(s: PlanSlotView) {
  const [sh, sm] = s.startTime.split(":").map(Number);
  const [eh, em] = s.endTime.split(":").map(Number);
  const m = eh * 60 + em - (sh * 60 + sm);
  return m > 0 ? m / 60 : 0;
}

export function PlanClient({
  clientId,
  clientName,
  agreementType,
  weeklyHours,
  slots,
  rates,
}: {
  clientId: string;
  clientName: string;
  agreementType: string;
  weeklyHours: number | null;
  slots: PlanSlotView[];
  rates: RateOption[];
}) {
  const [pending, start] = useTransition();
  // editing: a slot (existing) or a new slot seeded with a day; null = closed.
  const [editing, setEditing] = useState<PlanSlotView | null>(null);
  const isNew = editing?.id === "";

  const at = agreementType as AgreementType;
  const totalHours = slots.reduce((sum, s) => sum + hoursOf(s), 0);
  const totalMileage = slots.reduce((sum, s) => sum + (s.mileageKm ?? 0), 0);
  const rateLabel = (id: string) =>
    rates.find((r) => r.id === id)?.label ?? "No rate set";

  function newSlot(day: number): PlanSlotView {
    return {
      id: "",
      dayOfWeek: day,
      startTime: "09:00",
      endTime: "12:00",
      priceItemId: "",
      mileageKm: null,
      notes: "",
    };
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      {/* Breadcrumb + header */}
      <Link
        href="/clients"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <span className="material-symbols-rounded text-[18px]">arrow_back</span>
        Participants
      </Link>

      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              {clientName}
            </h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${AGREEMENT_BADGE[at] ?? "bg-slate-100 text-slate-600"}`}>
              {AGREEMENT_LABELS[at] ?? agreementType}
            </span>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            Weekly schedule template · Monday to Sunday
          </p>
        </div>
        <form action={async (fd) => { await generateRoster(fd); }}>
          <input type="hidden" name="clientId" value={clientId} />
          <button
            disabled={slots.length === 0}
            className="rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
          >
            ⚡ Generate this week&apos;s roster
          </button>
        </form>
      </header>

      {/* Summary chips */}
      <div className="mb-5 flex flex-wrap gap-3">
        <Chip label="Visits / week" value={String(slots.length)} icon="event_repeat" />
        <Chip
          label="Hours / week"
          value={`${totalHours.toFixed(1)}h`}
          icon="schedule"
          warn={weeklyHours != null && totalHours > weeklyHours}
          hint={weeklyHours != null ? `agreed ${weeklyHours}h` : undefined}
        />
        <Chip label="Mileage / week" value={`${totalMileage.toFixed(0)} km`} icon="directions_car" />
      </div>

      {rates.length === 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No {AGREEMENT_LABELS[at] ?? agreementType} rates available for this
          participant yet.
        </div>
      )}

      {/* Days */}
      <div className="space-y-3">
        {DAY_NAMES.map((dayName, day) => {
          const daySlots = slots.filter((s) => s.dayOfWeek === day);
          return (
            <section
              key={day}
              className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm"
            >
              <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
                <h2 className="font-bold text-[var(--text-primary)]">{dayName}</h2>
                <button
                  onClick={() => setEditing(newSlot(day))}
                  className="rounded-lg bg-[var(--background)] px-3 py-1.5 text-xs font-semibold text-[var(--brand)] hover:bg-blue-50"
                >
                  + Add visit
                </button>
              </div>

              {daySlots.length === 0 ? (
                <p className="px-5 py-4 text-sm text-[var(--text-muted)]">No visits scheduled.</p>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {daySlots.map((s) => (
                    <li key={s.id} className="flex items-center gap-4 px-5 py-3">
                      <div className="w-32 shrink-0">
                        <div className="text-sm font-bold text-[var(--text-primary)]">
                          {s.startTime} – {s.endTime}
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">
                          {hoursOf(s).toFixed(1)}h
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-sm text-[var(--text-primary)]">
                          {rateLabel(s.priceItemId)}
                        </div>
                        {(s.mileageKm || s.notes) && (
                          <div className="mt-0.5 flex items-center gap-3 text-xs text-[var(--text-muted)]">
                            {s.mileageKm ? (
                              <span className="inline-flex items-center gap-1">
                                <span className="material-symbols-rounded text-[14px]">directions_car</span>
                                {s.mileageKm} km
                              </span>
                            ) : null}
                            {s.notes ? <span className="truncate">{s.notes}</span> : null}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => setEditing(s)}
                        className="text-[var(--text-muted)] hover:text-[var(--brand)]"
                        title="Edit visit"
                      >
                        <span className="material-symbols-rounded text-[18px] align-middle">edit</span>
                      </button>
                      <button
                        onClick={() => {
                          const fd = new FormData();
                          fd.set("id", s.id);
                          fd.set("clientId", clientId);
                          start(() => deletePlanSlot(fd));
                        }}
                        className="text-[var(--text-muted)] hover:text-red-600"
                        title="Delete visit"
                      >
                        <span className="material-symbols-rounded text-[18px] align-middle">delete</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {pending && <p className="mt-3 text-xs text-[var(--text-muted)]">Saving…</p>}

      {/* Add / edit visit modal */}
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
                {isNew ? "Add visit" : "Edit visit"}
              </h2>
              <button onClick={() => setEditing(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                ✕
              </button>
            </div>

            <form
              action={async (fd) => {
                if (isNew) await addPlanSlot(fd);
                else await updatePlanSlot(fd);
                setEditing(null);
              }}
              className="space-y-3"
            >
              <input type="hidden" name="clientId" value={clientId} />
              {!isNew && <input type="hidden" name="id" value={editing.id} />}

              <label className="block text-sm font-medium text-[var(--text-primary)]">
                Day
                <select name="dayOfWeek" defaultValue={editing.dayOfWeek} className={`mt-1 ${field}`}>
                  {DAY_NAMES.map((d, i) => (
                    <option key={i} value={i}>{d}</option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-medium text-[var(--text-primary)]">
                  Start
                  <input name="startTime" type="time" required defaultValue={editing.startTime} className={`mt-1 ${field}`} />
                </label>
                <label className="text-sm font-medium text-[var(--text-primary)]">
                  End
                  <input name="endTime" type="time" required defaultValue={editing.endTime} className={`mt-1 ${field}`} />
                </label>
              </div>

              <label className="block text-sm font-medium text-[var(--text-primary)]">
                Rate
                <select name="priceItemId" defaultValue={editing.priceItemId} className={`mt-1 ${field}`}>
                  <option value="">No rate</option>
                  {rates.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium text-[var(--text-primary)]">
                Mileage (km)
                <input
                  name="mileageKm"
                  type="number"
                  step="0.1"
                  min="0"
                  defaultValue={editing.mileageKm ?? ""}
                  className={`mt-1 ${field}`}
                  placeholder="e.g. 12"
                />
              </label>

              <label className="block text-sm font-medium text-[var(--text-primary)]">
                Notes
                <input name="notes" defaultValue={editing.notes} className={`mt-1 ${field}`} />
              </label>

              <button className="mt-2 w-full rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white">
                {isNew ? "Add visit" : "Save changes"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({
  label,
  value,
  icon,
  warn,
  hint,
}: {
  label: string;
  value: string;
  icon: string;
  warn?: boolean;
  hint?: string;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${
        warn ? "border-amber-200 bg-amber-50" : "border-[var(--border)] bg-white"
      }`}
    >
      <span className={`material-symbols-rounded text-[22px] ${warn ? "text-amber-500" : "text-[var(--brand)]"}`}>
        {icon}
      </span>
      <div>
        <div className="text-lg font-bold text-[var(--text-primary)]">{value}</div>
        <div className="text-xs text-[var(--text-secondary)]">
          {label}
          {hint ? ` · ${hint}` : ""}
        </div>
      </div>
    </div>
  );
}
