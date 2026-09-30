"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createDuty,
  updateDuty,
  setDutyAttendance,
  deleteDuty,
} from "./dutyActions";
import { DUTY_KINDS, DUTY_LABELS, type DutyKind } from "@/lib/dutyTypes";
import { Linkify } from "@/components/Linkify";

/**
 * Meetings, supervisions and training for the week on screen.
 *
 * Its own band above the grid rather than a row in it: the grid is organised
 * by participant, and this work has no participant. Workers accept from their
 * own app, the office confirms who turned up, and only then does it reach a
 * pay run.
 */

export type DutyRow = {
  id: string;
  title: string;
  kind: string;
  dateLabel: string;
  timeLabel: string;
  hours: number;
  location: string | null;
  notes: string | null;
  past: boolean;
  /** The values the edit form needs back: yyyy-mm-dd and HH:MM, branch time. */
  dateValue: string;
  startValue: string;
  endValue: string;
  attendees: {
    id: string;
    staffId: string;
    name: string;
    status: string;
    approval: string;
    declineReason: string | null;
    hours: number | null;
  }[];
};

const STATUS_STYLE: Record<string, string> = {
  ACCEPTED: "bg-emerald-50 text-emerald-700",
  DECLINED: "bg-red-50 text-red-700",
  INVITED: "bg-amber-50 text-amber-700",
};

export function DutyBar({
  duties,
  staff,
  branchId,
  weekLabel,
  canManage,
}: {
  duties: DutyRow[];
  staff: { id: string; name: string }[];
  branchId: string;
  weekLabel: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  /** The duty being edited, if any. */
  const [editing, setEditing] = useState<DutyRow | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(fd: FormData) {
    setError(null);
    fd.set("branchId", branchId);
    start(async () => {
      const res = await createDuty(fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  function saveEdit(fd: FormData) {
    if (!editing) return;
    setError(null);
    fd.set("dutyId", editing.id);
    start(async () => {
      const res = await updateDuty(fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setEditing(null);
      router.refresh();
    });
  }

  function attendance(attendeeId: string, approval: string, hours?: string) {
    const fd = new FormData();
    fd.set("attendeeId", attendeeId);
    fd.set("approval", approval);
    if (hours) fd.set("hours", hours);
    start(async () => {
      const res = await setDutyAttendance(fd);
      if (res?.error) setError(res.error);
      router.refresh();
    });
  }

  function remove(dutyId: string) {
    if (!confirm("Delete this and withdraw the invitations?")) return;
    const fd = new FormData();
    fd.set("dutyId", dutyId);
    start(async () => {
      const res = await deleteDuty(fd);
      if (res?.error) setError(res.error);
      router.refresh();
    });
  }

  return (
    <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-900">
            Meetings, supervision &amp; training
          </h2>
          <p className="text-xs text-slate-500">
            Paid work that is not a participant visit. {weekLabel}
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg bg-[var(--brand)] px-3 py-2 text-xs font-semibold text-white"
          >
            {open ? "Close" : "+ Add"}
          </button>
        )}
      </header>

      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}

      {open && (
        <form action={submit} className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-medium text-slate-600">
              What is it
              <input
                name="title"
                required
                placeholder="e.g. Monthly team meeting"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Type
              <select
                name="kind"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {DUTY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {DUTY_LABELS[k as DutyKind]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600">
              Date
              <input
                name="date"
                type="date"
                required
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Where (optional)
              <input
                name="location"
                placeholder="Office, Zoom, participant's home"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Start
              <input
                name="start"
                type="time"
                required
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Finish
              <input
                name="end"
                type="time"
                required
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-slate-600 sm:col-span-2">
              Notes for the workers (optional)
              <input
                name="notes"
                placeholder="Agenda, what to bring"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <fieldset className="mt-3">
            <legend className="text-xs font-semibold text-slate-600">
              Who has to be there
            </legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {staff.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                >
                  <input type="checkbox" name="staffIds" value={s.id} />
                  {s.name}
                </label>
              ))}
            </div>
          </fieldset>

          <button
            disabled={pending}
            className="mt-3 rounded-lg bg-[var(--brand)] px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
          >
            {pending ? "Sending…" : "Schedule and ask them"}
          </button>
          <p className="mt-1.5 text-[11px] text-slate-500">
            They are asked to accept in their own app. After it happens, tick
            who attended and it goes into the pay run at their normal rate.
          </p>
        </form>
      )}

      {editing && (
        <form action={saveEdit} className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-medium text-slate-600">
              What is it
              <input
                name="title"
                required
                defaultValue={editing.title}
                placeholder="e.g. Monthly team meeting"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Type
              <select
                name="kind"
                defaultValue={editing.kind}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {DUTY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {DUTY_LABELS[k as DutyKind]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600">
              Date
              <input
                name="date"
                type="date"
                required
                defaultValue={editing.dateValue}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Where (optional)
              <input
                name="location"
                defaultValue={editing.location ?? ""}
                placeholder="Office, Zoom, participant's home"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Start
              <input
                name="start"
                type="time"
                required
                defaultValue={editing.startValue}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Finish
              <input
                name="end"
                type="time"
                required
                defaultValue={editing.endValue}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-slate-600 sm:col-span-2">
              Notes for the workers (optional)
              <input
                name="notes"
                defaultValue={editing.notes ?? ""}
                placeholder="Agenda, what to bring"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <fieldset className="mt-3">
            <legend className="text-xs font-semibold text-slate-600">
              Who has to be there
            </legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {staff.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                >
                  <input
                    type="checkbox"
                    name="staffIds"
                    value={s.id}
                    defaultChecked={editing.attendees.some((a) => a.staffId === s.id)}
                  />
                  {s.name}
                </label>
              ))}
            </div>
          </fieldset>

          <button
            disabled={pending}
            className="mt-3 rounded-lg bg-[var(--brand)] px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="mt-3 ml-2 rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600"
          >
            Cancel
          </button>
          <p className="mt-1.5 text-[11px] text-slate-500">
            Changing the date or time asks everyone to accept again, because a
            yes to one time is not a yes to another. Anyone already approved
            for pay cannot be removed here.
          </p>
        </form>
      )}

      {duties.length === 0 ? (
        <p className="py-3 text-center text-xs text-slate-400">
          Nothing scheduled this week.
        </p>
      ) : (
        <ul className="space-y-2">
          {duties.map((d) => (
            <li key={d.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                    {DUTY_LABELS[d.kind as DutyKind] ?? d.kind}
                  </span>
                  <span className="ml-2 text-sm font-bold text-slate-900">
                    {d.title}
                  </span>
                  <div className="text-xs text-slate-500">
                    {d.dateLabel} · {d.timeLabel} · {d.hours.toFixed(2)} h
                    {d.location ? (
                      <>
                        {" · "}
                        <Linkify text={d.location} />
                      </>
                    ) : null}
                  </div>
                  {d.notes && (
                    <div className="mt-0.5 text-xs italic text-slate-500">
                      <Linkify text={d.notes} />
                    </div>
                  )}
                </div>
                {canManage && (
                  <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      setOpen(false);
                      setEditing(d);
                    }}
                    disabled={pending}
                    className="text-xs font-semibold text-[var(--brand)] hover:underline disabled:opacity-60"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(d.id)}
                    disabled={pending}
                    className="text-xs font-medium text-red-600 hover:underline disabled:opacity-60"
                  >
                    Delete
                  </button>
                  </div>
                )}
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                {d.attendees.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5"
                  >
                    <span className="text-xs font-medium text-slate-700">
                      {a.name}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        STATUS_STYLE[a.status] ?? "bg-slate-100 text-slate-600"
                      }`}
                      title={a.declineReason ?? undefined}
                    >
                      {a.status.toLowerCase()}
                    </span>

                    {/* Attendance is only a question once it has happened. */}
                    {d.past && canManage && (
                      a.approval === "APPROVED" ? (
                        <button
                          onClick={() => attendance(a.id, "PENDING")}
                          disabled={pending}
                          className="rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white disabled:opacity-60"
                          title="Approved for pay - click to undo"
                        >
                          paid {a.hours ? `${a.hours} h` : `${d.hours.toFixed(2)} h`}
                        </button>
                      ) : (
                        <button
                          onClick={() => attendance(a.id, "APPROVED")}
                          disabled={pending}
                          className="rounded-md border border-slate-300 px-2 py-0.5 text-[10px] font-semibold text-slate-600 disabled:opacity-60"
                        >
                          attended
                        </button>
                      )
                    )}
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
