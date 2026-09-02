"use client";

import { useState, useEffect } from "react";
import { ShiftMap, type LatLng, type Trip } from "@/components/ShiftMap";
import { updateShiftDetail, setApproval } from "./actions";

export type ShiftDetailData = {
  id: string;
  worker: string;
  client: string;
  dateLabel: string;
  scheduledLabel: string;
  clockInTime: string;
  clockOutTime: string;
  clockInLabel: string;
  clockOutLabel: string;
  netHours: number;
  breakHours: number;
  breaks: string[];
  totalKm: number;
  note: string;
  /** Passed to the next worker at clock-out, with who read it and when. */
  handover: { body: string; ackBy: string | null; ackAt: string | null } | null;
  /** Set only when they finished outside the participant's radius. */
  finishedAway: { reason: string; distanceFt: number } | null;
  /** Set only when they clocked in outside the radius and confirmed on site. */
  startedAway: { distanceFt: number } | null;
  /** Set when the office entered this shift by hand rather than it being clocked. */
  manualEntry: { by: string; at: string; reason: string } | null;
  /** Set when the office clocked the worker in on their behalf. */
  clockedInByOffice: string | null;
  approval: string;
  needsNotes: boolean;
  hasMap: boolean;
  center: LatLng | null;
  radiusM: number;
  clockIn: LatLng | null;
  clockOut: LatLng | null;
  trips: Trip[];
  transports: { id: string; purpose: string | null; km: number }[];
  driving: {
    /** False when the GPS trail is too sparse to judge speed at all. */
    reliable: boolean;
    unreliableReason: string | null;
    maxKmh: number;
    avgKmh: number;
    events: {
      at: string;
      speedKmh: number;
      limitKmh: number;
      overByKmh: number;
      roadName: string | null;
    }[];
  } | null;
};

const box =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100";

const approvalStyle: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-red-50 text-red-700",
};

function Icon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span
      className={`material-symbols-rounded leading-none ${className}`}
      style={{ fontVariationSettings: "'FILL' 0, 'wght' 400" }}
    >
      {name}
    </span>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function Stat({
  icon,
  label,
  value,
  accent,
}: {
  icon: string;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/60 px-3.5 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        <Icon name={icon} className={`text-[15px] ${accent}`} />
        {label}
      </div>
      <div className="mt-1 text-base font-bold text-slate-800">{value}</div>
    </div>
  );
}

export function ShiftDetail({ data }: { data: ShiftDetailData }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
      >
        <Icon name="visibility" className="text-[15px]" />
        View
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="my-8 w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-900/5">
            {/* Header */}
            <div className="bg-gradient-to-br from-slate-50 to-white px-6 pb-5 pt-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {data.dateLabel}
                  </div>
                  <h2 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900">
                    {data.client}
                  </h2>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="-mr-1.5 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                >
                  <Icon name="close" className="text-[18px]" />
                </button>
              </div>

              {/* Worker */}
              <div className="mt-3 flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm"
                  style={{ background: "var(--brand)" }}
                >
                  {initials(data.worker)}
                </div>
                <div className="leading-tight">
                  <div className="text-sm font-semibold text-slate-900">
                    {data.worker}
                  </div>
                  <div className="text-xs text-slate-400">
                    Support worker · scheduled {data.scheduledLabel}
                  </div>
                </div>
                <span
                  className={`ml-auto rounded-full px-2.5 py-1 text-xs font-semibold ${
                    data.needsNotes
                      ? "bg-amber-50 text-amber-700"
                      : approvalStyle[data.approval]
                  }`}
                >
                  {data.needsNotes
                    ? "notes pending"
                    : data.approval.toLowerCase()}
                </span>
              </div>
            </div>

            <div className="space-y-5 px-6 pb-6">
              {/* Map */}
              {data.hasMap ? (
                <div>
                  <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                    <Icon name="map" className="text-[18px] text-[var(--brand)]" />
                    Location &amp; travel
                  </div>
                  <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
                    <ShiftMap
                      center={data.center}
                      radiusM={data.radiusM}
                      clockIn={data.clockIn}
                      clockOut={data.clockOut}
                      trips={data.trips}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
                      Clock in
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-red-600" />
                      Clock out
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-1 w-3.5 rounded bg-violet-600" />
                      Travel route
                    </span>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl bg-slate-50 px-4 py-4 text-center text-xs text-slate-400">
                  No GPS location captured for this shift.
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <Stat
                  icon="schedule"
                  label="Worked"
                  value={`${data.netHours.toFixed(2)} h`}
                  accent="text-emerald-600"
                />
                <Stat
                  icon="pause_circle"
                  label="Break"
                  value={
                    data.breakHours > 0 ? `${data.breakHours.toFixed(2)} h` : "-"
                  }
                  accent="text-amber-600"
                />
                <Stat
                  icon="directions_car"
                  label="Mileage"
                  value={data.totalKm > 0 ? `${data.totalKm.toFixed(1)} km` : "-"}
                  accent="text-violet-600"
                />
                <Stat
                  icon="timer"
                  label="Clocked"
                  value={`${data.clockInLabel}-${data.clockOutLabel}`}
                  accent="text-sky-600"
                />
              </div>

              {data.breaks.length > 0 && (
                <div className="text-xs text-slate-500">
                  <span className="font-medium text-slate-600">Breaks:</span>{" "}
                  {data.breaks.join(", ")}
                </div>
              )}

              {/* Driving overview */}
              {data.driving && (
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                    <Icon name="speed" className="text-[18px] text-[var(--brand)]" />
                    Driving overview
                  </div>
                  {!data.driving.reliable && (
                    <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
                        <Icon name="gps_off" className="text-[16px] text-amber-600" />
                        Speed can&apos;t be assessed for this trip
                      </div>
                      <p className="mt-1 text-xs text-amber-900">
                        {data.driving.unreliableReason}
                      </p>
                      <p className="mt-1 text-xs text-amber-800">
                        This is not a finding either way. Treat the figures
                        below as incomplete rather than as a clean record.
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="rounded-xl bg-slate-50 p-3 text-center">
                      <div className="text-lg font-bold text-slate-900">
                        {data.driving.maxKmh || "-"}
                        <span className="text-xs font-medium text-slate-400"> km/h</span>
                      </div>
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">
                        Top speed
                      </div>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3 text-center">
                      <div className="text-lg font-bold text-slate-900">
                        {data.driving.avgKmh || "-"}
                        <span className="text-xs font-medium text-slate-400"> km/h</span>
                      </div>
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">
                        Avg speed
                      </div>
                    </div>
                    <div
                      className={`rounded-xl p-3 text-center ${
                        data.driving.events.length ? "bg-red-50" : "bg-emerald-50"
                      }`}
                    >
                      <div
                        className={`text-lg font-bold ${
                          data.driving.events.length ? "text-red-700" : "text-emerald-700"
                        }`}
                      >
                        {data.driving.events.length}
                      </div>
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">
                        Over limit
                      </div>
                    </div>
                  </div>

                  {data.driving.events.length > 0 ? (
                    <ul className="mt-3 space-y-1.5">
                      {data.driving.events.map((e, i) => (
                        <li
                          key={i}
                          className="flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 text-xs"
                        >
                          <span className="text-slate-600">
                            {e.at}
                            {e.roadName ? ` · ${e.roadName}` : ""}
                          </span>
                          <span className="font-semibold text-red-700">
                            {e.speedKmh} in a {e.limitKmh} zone (+{e.overByKmh})
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : data.driving.reliable ? (
                    <p className="mt-3 text-xs text-emerald-700">
                      No speeding recorded against known street limits. 👍
                    </p>
                  ) : (
                    <p className="mt-3 text-xs text-slate-500">
                      No speeding was detected, but with this little GPS data
                      that is not evidence of careful driving.
                    </p>
                  )}
                  <p className="mt-2 text-[10px] text-slate-400">
                    Limits from OpenStreetMap (best-effort); roads without limit
                    data aren&apos;t assessed.
                  </p>
                </div>
              )}

              {/* Edit form */}
              <form
                action={updateShiftDetail}
                className="space-y-4 rounded-2xl border border-slate-200 p-4"
              >
                <input type="hidden" name="shiftId" value={data.id} />
                <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                  <Icon name="edit" className="text-[16px] text-slate-400" />
                  Edit shift
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm font-medium text-slate-700">
                    <span className="flex items-center gap-1">
                      <Icon name="login" className="text-[14px] text-emerald-600" />
                      Clock in
                    </span>
                    <input
                      type="time"
                      name="clockInTime"
                      defaultValue={data.clockInTime}
                      className={box}
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    <span className="flex items-center gap-1">
                      <Icon name="logout" className="text-[14px] text-red-600" />
                      Clock out
                    </span>
                    <input
                      type="time"
                      name="clockOutTime"
                      defaultValue={data.clockOutTime}
                      className={box}
                    />
                  </label>
                </div>

                {data.transports.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Trip mileage
                    </div>
                    {data.transports.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2"
                      >
                        <Icon
                          name="directions_car"
                          className="text-[18px] text-violet-600"
                        />
                        <span className="flex-1 text-sm font-medium text-slate-700">
                          {t.purpose ?? "Trip"}
                        </span>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          name={`km_${t.id}`}
                          defaultValue={t.km.toFixed(1)}
                          className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm outline-none focus:border-[var(--brand)]"
                        />
                        <span className="text-xs text-slate-400">km</span>
                      </div>
                    ))}
                  </div>
                )}

                {data.manualEntry && (
                  <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
                    <div className="flex items-center gap-1 text-sm font-medium text-slate-700">
                      <Icon name="post_add" className="text-[16px] text-violet-600" />
                      Entered by hand, not clocked
                    </div>
                    <p className="mt-1 text-sm text-slate-800">
                      {data.manualEntry.reason}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Added by {data.manualEntry.by} on {data.manualEntry.at}.
                      These hours were stated, not measured.
                    </p>
                  </div>
                )}

                {data.clockedInByOffice && (
                  <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
                    <div className="flex items-center gap-1 text-sm font-medium text-slate-700">
                      <Icon name="pan_tool_alt" className="text-[16px] text-violet-600" />
                      Clocked in by the office
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {data.clockedInByOffice} started this shift on the
                      worker&apos;s behalf, so the start time was stated rather
                      than measured and no clock-in location was recorded.
                    </p>
                  </div>
                )}

                {data.startedAway && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <div className="flex items-center gap-1 text-sm font-medium text-slate-700">
                      <Icon name="my_location" className="text-[16px] text-amber-600" />
                      Clocked in {data.startedAway.distanceFt} ft away
                    </div>
                    <p className="mt-1 text-sm text-slate-800">
                      The worker confirmed they were on site. Phones read badly
                      indoors, so this is usually genuine - worth a look if it
                      keeps happening.
                    </p>
                  </div>
                )}

                {data.finishedAway && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <div className="flex items-center gap-1 text-sm font-medium text-slate-700">
                      <Icon name="wrong_location" className="text-[16px] text-amber-600" />
                      Clocked out {data.finishedAway.distanceFt} ft away
                    </div>
                    <p className="mt-1 text-sm text-slate-800">
                      {data.finishedAway.reason}
                    </p>
                  </div>
                )}

                {data.handover && (
                  <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
                    <div className="flex items-center gap-1 text-sm font-medium text-slate-700">
                      <Icon name="swap_horiz" className="text-[16px] text-sky-600" />
                      Handover to the next worker
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-800">
                      {data.handover.body}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      {data.handover.ackAt
                        ? `Read by ${data.handover.ackBy ?? "the next worker"} · ${data.handover.ackAt}`
                        : "Not yet read - the next worker sees this when they clock in."}
                    </p>
                  </div>
                )}

                <label className="block text-sm font-medium text-slate-700">
                  <span className="flex items-center gap-1">
                    <Icon name="edit_note" className="text-[16px] text-slate-400" />
                    Shift notes
                    {data.needsNotes && (
                      <span className="ml-1 text-xs font-normal text-amber-600">
                        ⚠ required before this shift is payable
                      </span>
                    )}
                  </span>
                  <textarea
                    name="note"
                    rows={3}
                    defaultValue={data.note}
                    placeholder="Shift notes…"
                    className={box}
                  />
                </label>

                <button className="w-full rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-[0.99]">
                  Save changes
                </button>
              </form>

              {/* Approve / reject */}
              {!data.needsNotes && (
                <div className="flex gap-2.5">
                  <form action={setApproval} className="flex-1">
                    <input type="hidden" name="shiftId" value={data.id} />
                    <input type="hidden" name="approval" value="APPROVED" />
                    <button className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700">
                      <Icon name="check_circle" className="text-[18px]" />
                      Approve shift
                    </button>
                  </form>
                  <form action={setApproval} className="flex-1">
                    <input type="hidden" name="shiftId" value={data.id} />
                    <input type="hidden" name="approval" value="REJECTED" />
                    <button className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
                      Reject
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
