"use client";

import { useEffect, useState, useTransition } from "react";
import {
  createShift,
  reassignShift,
  deleteShift,
  publishShifts,
  updateShiftTime,
  publishOneShift,
  unpublishShift,
  copyWeek,
} from "@/app/(app)/schedule/actions";

export type GridShift = {
  id: string;
  staffId: string | null;
  clientId: string;
  dayIso: string; // YYYY-MM-DD
  timeLabel: string;
  startHm: string; // "HH:MM" for the edit form
  endHm: string;
  clientName: string;
  staffName: string | null;
  status: string;
  overAgreement: boolean;
  hours: number;
  publishState: string;
  rejectionReason: string | null;
};

const pubBadge: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Draft", cls: "bg-slate-100 text-slate-500" },
  PUBLISHED: { label: "Sent", cls: "bg-amber-100 text-amber-700" },
  ACCEPTED: { label: "Accepted", cls: "bg-emerald-100 text-emerald-700" },
  REJECTED: { label: "Declined", cls: "bg-rose-100 text-rose-700" },
};

export type GridStaff = { id: string; name: string };
export type GridDay = { iso: string; weekday: string; dayNum: string; isToday: boolean };
export type GridClient = {
  id: string;
  name: string;
  weeklyHours: number | null;
  usedHours: number; // already rostered this week
};

const statusDot: Record<string, string> = {
  SCHEDULED: "bg-sky-500",
  IN_PROGRESS: "bg-violet-500",
  COMPLETED: "bg-emerald-500",
  CANCELLED: "bg-slate-400",
};

// A stable colour per participant so a client's shifts share a colour code.
const CLIENT_PALETTE = [
  { border: "border-sky-400", bg: "bg-sky-50", text: "text-sky-800", dot: "bg-sky-500" },
  { border: "border-violet-400", bg: "bg-violet-50", text: "text-violet-800", dot: "bg-violet-500" },
  { border: "border-emerald-400", bg: "bg-emerald-50", text: "text-emerald-800", dot: "bg-emerald-500" },
  { border: "border-amber-400", bg: "bg-amber-50", text: "text-amber-800", dot: "bg-amber-500" },
  { border: "border-rose-400", bg: "bg-rose-50", text: "text-rose-800", dot: "bg-rose-500" },
  { border: "border-cyan-400", bg: "bg-cyan-50", text: "text-cyan-800", dot: "bg-cyan-500" },
  { border: "border-fuchsia-400", bg: "bg-fuchsia-50", text: "text-fuchsia-800", dot: "bg-fuchsia-500" },
  { border: "border-indigo-400", bg: "bg-indigo-50", text: "text-indigo-800", dot: "bg-indigo-500" },
  { border: "border-orange-400", bg: "bg-orange-50", text: "text-orange-800", dot: "bg-orange-500" },
  { border: "border-teal-400", bg: "bg-teal-50", text: "text-teal-800", dot: "bg-teal-500" },
];

function clientColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return CLIENT_PALETTE[h % CLIENT_PALETTE.length];
}

const field =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100";

export function ScheduleGrid({
  days,
  staff,
  shifts,
  clients,
  canAuthorise,
  branchId,
  weekIso,
}: {
  days: GridDay[];
  staff: GridStaff[];
  shifts: GridShift[];
  clients: GridClient[];
  canAuthorise: boolean;
  branchId: string; // selected branch to file new shifts under ("" = all)
  weekIso: string; // Monday of the displayed week (YYYY-MM-DD)
}) {
  const [pending, start] = useTransition();
  const [modal, setModal] = useState<{ staffId: string; dayIso: string } | null>(
    null,
  );
  const [editShift, setEditShift] = useState<GridShift | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  // Row grouping: staff rows (tiles show the participant) or participant rows
  // (tiles show the worker).
  const [groupBy, setGroupBy] = useState<"STAFF" | "CLIENT">("STAFF");
  const byClient = groupBy === "CLIENT";

  // Close the shift dialog on Escape. No background-click close — native
  // time/date pickers can emit stray backdrop clicks that would close it.
  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal]);

  // Add-shift modal form state (for the agreed-hours guard).
  const [selClient, setSelClient] = useState("");
  const [startT, setStartT] = useState("09:00");
  const [endT, setEndT] = useState("12:00");
  const [formError, setFormError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [authorise, setAuthorise] = useState(false);

  function openModal(staffId: string, dayIso: string, clientId?: string) {
    // In participant view the row already tells us the client — preselect it.
    setSelClient(clientId ?? "");
    setStartT("09:00");
    setEndT("12:00");
    setFormError(null);
    setNeedsAuth(false);
    setAuthorise(false);
    setModal({ staffId, dayIso });
  }

  const selectedClient = clients.find((c) => c.id === selClient) ?? null;
  const newHours = (() => {
    const [sh, sm] = startT.split(":").map(Number);
    const [eh, em] = endT.split(":").map(Number);
    const mins = eh * 60 + em - (sh * 60 + sm);
    return mins > 0 ? mins / 60 : 0;
  })();
  const remaining =
    selectedClient?.weeklyHours != null
      ? selectedClient.weeklyHours - selectedClient.usedHours
      : null;
  const willExceed =
    selectedClient?.weeklyHours != null &&
    selectedClient.usedHours + newHours > selectedClient.weeklyHours + 1e-6;

  const cell = (staffId: string | null, dayIso: string) =>
    shifts.filter((s) => s.staffId === staffId && s.dayIso === dayIso);

  const weekHours = (staffId: string | null) =>
    shifts
      .filter((s) => s.staffId === staffId)
      .reduce((sum, s) => sum + s.hours, 0);

  /** Shifts in a participant-row cell. */
  const clientCell = (clientId: string, dayIso: string) =>
    shifts.filter((s) => s.clientId === clientId && s.dayIso === dayIso);

  function onDrop(
    e: React.DragEvent,
    staffId: string | null,
    dayIso: string,
  ) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || dragId;
    setDragId(null);
    if (!id) return;
    const fd = new FormData();
    fd.set("shiftId", id);
    fd.set("date", dayIso);
    fd.set("staffId", staffId ?? "");
    start(() => {
      reassignShift(fd);
    });
  }

  /** Drop in participant view — moves the shift to that client and/or day. */
  function onDropClient(e: React.DragEvent, clientId: string, dayIso: string) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || dragId;
    setDragId(null);
    if (!id) return;
    const fd = new FormData();
    fd.set("shiftId", id);
    fd.set("date", dayIso);
    fd.set("clientId", clientId);
    start(() => {
      reassignShift(fd);
    });
  }

  function ShiftBlock({ s }: { s: GridShift }) {
    const c = clientColor(s.clientId);
    return (
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", s.id);
          e.dataTransfer.effectAllowed = "move";
          setDragId(s.id);
        }}
        onDragEnd={() => setDragId(null)}
        onClick={() => setEditShift(s)}
        className={`group/shift relative cursor-pointer rounded-lg border-l-4 ${c.border} ${c.bg} px-2 py-1.5 text-left shadow-sm active:cursor-grabbing`}
      >
        <div className="flex items-center gap-1.5">
          <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot[s.status] ?? "bg-slate-400"}`} />
          <span className="min-w-0 truncate text-xs font-semibold text-slate-800">
            {s.timeLabel}
          </span>
          {s.overAgreement && (
            <span
              className="ml-auto shrink-0 text-amber-500"
              title="Authorised above agreed weekly hours"
            >
              <span className="material-symbols-rounded text-[14px] leading-none align-middle">
                verified_user
              </span>
            </span>
          )}
        </div>
        <div className={`truncate text-xs font-medium ${c.text}`}>
          {byClient ? (
            s.staffName ?? (
              <span className="italic text-amber-700">Unassigned</span>
            )
          ) : (
            s.clientName
          )}
        </div>
        {s.staffId && (
          <span
            className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${pubBadge[s.publishState]?.cls ?? ""}`}
            title={s.rejectionReason ?? undefined}
          >
            {pubBadge[s.publishState]?.label ?? s.publishState}
          </span>
        )}
      </div>
    );
  }

  function Cell({ staffId, dayIso }: { staffId: string | null; dayIso: string }) {
    const items = cell(staffId, dayIso);
    return (
      <td
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => onDrop(e, staffId, dayIso)}
        className="group/cell h-24 border-b border-l border-slate-100 align-top"
      >
        <div className="flex h-full flex-col gap-1 p-1">
          {items.map((s) => (
            <ShiftBlock key={s.id} s={s} />
          ))}
          <button
            onClick={() => openModal(staffId ?? "", dayIso)}
            className="mt-auto hidden rounded-md py-1 text-center text-xs font-medium text-[var(--brand)] hover:bg-slate-50 group-hover/cell:block"
          >
            + Add
          </button>
        </div>
      </td>
    );
  }

  /** A day cell on a participant row. */
  function ClientCell({ clientId, dayIso }: { clientId: string; dayIso: string }) {
    const items = clientCell(clientId, dayIso);
    return (
      <td
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => onDropClient(e, clientId, dayIso)}
        className="group/cell h-24 border-b border-l border-slate-100 align-top"
      >
        <div className="flex h-full flex-col gap-1 p-1">
          {items.map((s) => (
            <ShiftBlock key={s.id} s={s} />
          ))}
          <button
            onClick={() => openModal("", dayIso, clientId)}
            className="mt-auto hidden rounded-md py-1 text-center text-xs font-medium text-[var(--brand)] hover:bg-slate-50 group-hover/cell:block"
          >
            + Add
          </button>
        </div>
      </td>
    );
  }

  // Assigned shifts that still need publishing (new drafts or ones a worker
  // declined and were reassigned).
  const publishable = shifts.filter(
    (s) =>
      s.staffId && (s.publishState === "DRAFT" || s.publishState === "REJECTED"),
  );

  function publishAll() {
    if (publishable.length === 0) return;
    start(() => {
      publishShifts(publishable.map((s) => s.id));
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <div className="flex items-center gap-3">
          {/* Group rows by staff or by participant */}
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
            {(
              [
                ["STAFF", "By staff"],
                ["CLIENT", "By participant"],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setGroupBy(val)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                  groupBy === val
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="text-xs text-slate-400">
            {byClient
              ? "Rows are participants; tiles show the worker."
              : "Click a shift to edit / publish; drag it to reassign."}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCopyOpen(true)}
            className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            <span className="material-symbols-rounded text-[16px]">content_copy</span>
            Copy previous week
          </button>
          {publishable.length > 0 ? (
            <button
              onClick={publishAll}
              disabled={pending}
              className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
            >
              {pending
                ? "Publishing…"
                : `Publish all ${publishable.length} →`}
            </button>
          ) : (
            <span className="text-xs font-medium text-emerald-600">
              All published
            </span>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] table-fixed border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-44 border-b border-slate-200 bg-white p-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              {byClient ? "Participant" : "Staff"}
            </th>
            {days.map((d) => (
              <th
                key={d.iso}
                className="border-b border-l border-slate-100 p-2 text-center"
              >
                <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  {d.weekday}
                </div>
                <div
                  className={`text-sm font-semibold ${
                    d.isToday ? "text-[var(--brand)]" : "text-slate-700"
                  }`}
                >
                  {d.dayNum}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {byClient ? (
            <>
              {clients.map((c) => {
                const used = shifts
                  .filter((s) => s.clientId === c.id)
                  .reduce((sum, s) => sum + s.hours, 0);
                const over = c.weeklyHours != null && used > c.weeklyHours + 1e-6;
                return (
                  <tr key={c.id}>
                    <td className="sticky left-0 z-10 border-b border-slate-100 bg-white p-3">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`h-2.5 w-2.5 shrink-0 rounded-full ${clientColor(c.id).dot}`}
                        />
                        <span className="text-sm font-medium text-slate-800">
                          {c.name}
                        </span>
                      </div>
                      <div
                        className={`text-xs ${over ? "text-amber-600" : "text-slate-400"}`}
                      >
                        {used.toFixed(1)}h
                        {c.weeklyHours != null ? ` / ${c.weeklyHours}h` : ""} this
                        week
                      </div>
                    </td>
                    {days.map((d) => (
                      <ClientCell key={d.iso} clientId={c.id} dayIso={d.iso} />
                    ))}
                  </tr>
                );
              })}

              {clients.length === 0 && (
                <tr>
                  <td
                    colSpan={days.length + 1}
                    className="p-10 text-center text-sm text-slate-400"
                  >
                    No participants yet. Add a participant to start rostering.
                  </td>
                </tr>
              )}
            </>
          ) : (
            <>
              {/* Open / unassigned shifts row */}
              <tr className="bg-amber-50/40">
                <td className="sticky left-0 z-10 border-b border-slate-100 bg-amber-50/40 p-3">
                  <div className="text-sm font-semibold text-amber-800">
                    Open shifts
                  </div>
                  <div className="text-xs text-amber-600">Unassigned</div>
                </td>
                {days.map((d) => (
                  <Cell key={d.iso} staffId={null} dayIso={d.iso} />
                ))}
              </tr>

              {staff.map((st) => (
                <tr key={st.id}>
                  <td className="sticky left-0 z-10 border-b border-slate-100 bg-white p-3">
                    <div className="text-sm font-medium text-slate-800">
                      {st.name}
                    </div>
                    <div className="text-xs text-slate-400">
                      {weekHours(st.id).toFixed(1)}h this week
                    </div>
                  </td>
                  {days.map((d) => (
                    <Cell key={d.iso} staffId={st.id} dayIso={d.iso} />
                  ))}
                </tr>
              ))}

              {staff.length === 0 && (
                <tr>
                  <td
                    colSpan={days.length + 1}
                    className="p-10 text-center text-sm text-slate-400"
                  >
                    No staff yet. Add staff to start rostering.
                  </td>
                </tr>
              )}
            </>
          )}
        </tbody>
      </table>
      </div>

      {/* Colour legend: one colour per participant */}
      {(() => {
        const seen = new Map<string, { name: string; dot: string }>();
        shifts.forEach((s) => {
          if (!seen.has(s.clientId))
            seen.set(s.clientId, {
              name: s.clientName,
              dot: clientColor(s.clientId).dot,
            });
        });
        const items = [...seen.values()];
        if (items.length === 0) return null;
        return (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 px-3 py-2.5">
            <span className="text-xs font-medium text-slate-400">
              Participants:
            </span>
            {items.map((l, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 text-xs text-slate-600"
              >
                <span className={`h-2.5 w-2.5 rounded-sm ${l.dot}`} />
                {l.name}
              </span>
            ))}
          </div>
        );
      })()}

      {pending && (
        <div className="px-3 py-1 text-xs text-slate-400">Saving…</div>
      )}

      {/* Add-shift modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4">
          <div className="mt-12 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                New shift
              </h2>
              <button
                onClick={() => setModal(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <form
              action={async (fd) => {
                fd.set("authorise", authorise ? "on" : "");
                const res = await createShift(fd);
                if (res.ok) {
                  setModal(null);
                } else {
                  setFormError(res.error);
                  setNeedsAuth(Boolean(res.needsAuth));
                }
              }}
              className="space-y-3"
            >
              <input type="hidden" name="staffId" value={modal.staffId} />
              <input type="hidden" name="date" value={modal.dayIso} />
              <input type="hidden" name="branchId" value={branchId} />
              <label className="block text-sm font-medium text-slate-700">
                Participant
                <select
                  name="clientId"
                  required
                  value={selClient}
                  onChange={(e) => {
                    setSelClient(e.target.value);
                    setFormError(null);
                    setNeedsAuth(false);
                    setAuthorise(false);
                  }}
                  className={field}
                >
                  <option value="">Select participant…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-medium text-slate-700">
                  Start
                  <input
                    name="startTime"
                    type="time"
                    required
                    value={startT}
                    onChange={(e) => setStartT(e.target.value)}
                    className={field}
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  End
                  <input
                    name="endTime"
                    type="time"
                    required
                    value={endT}
                    onChange={(e) => setEndT(e.target.value)}
                    className={field}
                  />
                </label>
              </div>

              {/* Agreed-hours meter */}
              {selectedClient &&
                (selectedClient.weeklyHours == null ? (
                  <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    No agreed weekly hours set for this participant. Set them on
                    the Participants page to enforce the service agreement.
                  </p>
                ) : (
                  <div
                    className={`rounded-lg px-3 py-2 text-xs ${
                      willExceed
                        ? "bg-amber-50 text-amber-800"
                        : "bg-emerald-50 text-emerald-800"
                    }`}
                  >
                    <div className="flex justify-between font-medium">
                      <span>Agreed: {selectedClient.weeklyHours}h/week</span>
                      <span>
                        Used {selectedClient.usedHours.toFixed(1)}h ·{" "}
                        {(remaining ?? 0).toFixed(1)}h left
                      </span>
                    </div>
                    <div className="mt-1">
                      This shift: {newHours.toFixed(1)}h →{" "}
                      {(selectedClient.usedHours + newHours).toFixed(1)}h total
                      {willExceed ? " (over agreement)" : ""}
                    </div>
                  </div>
                ))}

              {formError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                  {formError}
                </div>
              )}

              {/* Manager authorisation */}
              {needsAuth && canAuthorise && (
                <label className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                  <input
                    type="checkbox"
                    checked={authorise}
                    onChange={(e) => setAuthorise(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    I authorise rostering beyond the agreed weekly hours. This
                    will be recorded against my name.
                  </span>
                </label>
              )}
              {needsAuth && !canAuthorise && (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  Ask an Admin or Coordinator to authorise the extra hours.
                </p>
              )}

              <p className="text-xs text-slate-400">
                {modal.staffId
                  ? "Assigned to the selected staff member."
                  : "Left unassigned — appears as an open shift."}
              </p>
              <button
                disabled={needsAuth && (!canAuthorise || !authorise)}
                className="mt-2 w-full rounded-lg bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {needsAuth ? "Authorise & create shift" : "Create shift"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit / publish a single shift */}
      {editShift && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4"
          onClick={() => setEditShift(null)}
        >
          <div
            className="mt-16 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Edit shift</h2>
              <button
                onClick={() => setEditShift(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <p className="mb-4 text-sm text-slate-500">
              {editShift.clientName}
              {editShift.staffName ? ` · ${editShift.staffName}` : " · Unassigned"}
              {" · "}
              <span
                className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${pubBadge[editShift.publishState]?.cls ?? ""}`}
              >
                {pubBadge[editShift.publishState]?.label ?? editShift.publishState}
              </span>
            </p>

            {/* Time editor */}
            <form
              action={async (fd) => {
                await updateShiftTime(fd);
                setEditShift(null);
              }}
              className="space-y-3"
            >
              <input type="hidden" name="shiftId" value={editShift.id} />
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-medium text-slate-700">
                  Start
                  <input
                    name="startTime"
                    type="time"
                    required
                    defaultValue={editShift.startHm}
                    className={field}
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  End
                  <input
                    name="endTime"
                    type="time"
                    required
                    defaultValue={editShift.endHm}
                    className={field}
                  />
                </label>
              </div>
              <button className="w-full rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white">
                Save time
              </button>
            </form>

            {/* Publish / unpublish + delete */}
            <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3">
              {editShift.staffId &&
                (editShift.publishState === "DRAFT" ||
                editShift.publishState === "REJECTED" ? (
                  <button
                    onClick={() => {
                      const fd = new FormData();
                      fd.set("shiftId", editShift.id);
                      start(() => publishOneShift(fd));
                      setEditShift(null);
                    }}
                    className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                  >
                    <span className="material-symbols-rounded text-[18px]">send</span>
                    Publish to {editShift.staffName?.split(" ")[0] ?? "worker"}
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      const fd = new FormData();
                      fd.set("shiftId", editShift.id);
                      start(() => unpublishShift(fd));
                      setEditShift(null);
                    }}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100"
                  >
                    <span className="material-symbols-rounded text-[18px]">undo</span>
                    Unpublish (back to draft)
                  </button>
                ))}
              {!editShift.staffId && (
                <p className="text-center text-xs text-slate-400">
                  Assign a worker (drag it onto their row) before publishing.
                </p>
              )}
              <button
                onClick={() => {
                  if (!confirm("Delete this shift?")) return;
                  const fd = new FormData();
                  fd.set("shiftId", editShift.id);
                  start(() => deleteShift(fd));
                  setEditShift(null);
                }}
                className="rounded-lg px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Delete shift
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Copy previous week */}
      {copyOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4"
          onClick={() => setCopyOpen(false)}
        >
          <div
            className="mt-16 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Copy previous week</h2>
              <button
                onClick={() => setCopyOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <p className="mb-4 text-sm text-slate-500">
              Copies last week&apos;s shifts into this week as{" "}
              <span className="font-medium">drafts</span> (same worker &amp; time).
              Nothing is published until you publish it. Existing shifts are kept.
            </p>
            <form
              action={async (fd) => {
                await copyWeek(fd);
                setCopyOpen(false);
              }}
              className="space-y-3"
            >
              {/* Source week = the Monday BEFORE the displayed week. */}
              <input
                type="hidden"
                name="sourceWeek"
                value={(() => {
                  const d = new Date(`${weekIso}T00:00:00`);
                  d.setDate(d.getDate() - 7);
                  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                })()}
              />
              <label className="block text-sm font-medium text-slate-700">
                Which participants
                <select name="clientId" defaultValue="" className={field}>
                  <option value="">Everyone (whole week)</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} only
                    </option>
                  ))}
                </select>
              </label>
              <button className="w-full rounded-lg bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white">
                Copy into this week
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
