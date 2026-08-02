"use client";

import { useState } from "react";

export type CalShift = {
  id: string;
  startIso: string;
  endIso: string;
  client: string;
  address: string | null;
  publishState: string;
  status: string;
};

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-AU", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function WorkerCalendar({ shifts }: { shifts: CalShift[] }) {
  const today = new Date();
  const [view, setView] = useState({
    year: today.getFullYear(),
    month: today.getMonth(),
  });
  const [selected, setSelected] = useState(today);

  // Index shifts by local day.
  const byDay = new Map<string, CalShift[]>();
  for (const s of shifts) {
    const k = dayKey(new Date(s.startIso));
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(s);
  }

  const first = new Date(view.year, view.month, 1);
  const lead = (first.getDay() + 6) % 7; // Monday-first offset
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++)
    cells.push(new Date(view.year, view.month, d));

  const step = (dir: number) => {
    const m = view.month + dir;
    setView({
      year: view.year + Math.floor(m / 12),
      month: ((m % 12) + 12) % 12,
    });
  };

  const selectedShifts = (byDay.get(dayKey(selected)) ?? []).sort(
    (a, b) => +new Date(a.startIso) - +new Date(b.startIso),
  );

  const sameDay = (a: Date, b: Date) => dayKey(a) === dayKey(b);

  return (
    <div className="space-y-4 p-4">
      {/* Month grid */}
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <button
            onClick={() => step(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100"
          >
            <span className="material-symbols-rounded text-[22px]">chevron_left</span>
          </button>
          <div className="text-sm font-bold text-slate-900">
            {MONTHS[view.month]} {view.year}
          </div>
          <button
            onClick={() => step(1)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100"
          >
            <span className="material-symbols-rounded text-[22px]">chevron_right</span>
          </button>
        </div>

        <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-semibold text-slate-400">
          {WEEKDAYS.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const isToday = sameDay(d, today);
            const isSel = sameDay(d, selected);
            const has = byDay.has(dayKey(d));
            return (
              <button
                key={i}
                onClick={() => setSelected(d)}
                className="flex flex-col items-center py-0.5"
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-sm transition ${
                    isSel
                      ? "font-bold text-white"
                      : isToday
                        ? "font-bold text-[var(--brand)]"
                        : "text-slate-700"
                  }`}
                  style={
                    isSel
                      ? { background: "var(--brand)" }
                      : isToday
                        ? { boxShadow: "inset 0 0 0 1.5px var(--brand)" }
                        : undefined
                  }
                >
                  {d.getDate()}
                </span>
                <span
                  className={`mt-0.5 h-1.5 w-1.5 rounded-full ${
                    has && !isSel ? "" : "opacity-0"
                  }`}
                  style={{ background: "var(--brand)" }}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Agenda for the selected day */}
      <div>
        <h2 className="mb-2 px-1 text-sm font-semibold text-slate-700">
          {selected.toLocaleDateString("en-AU", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </h2>
        {selectedShifts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
            No shifts on this day.
          </div>
        ) : (
          <div className="space-y-3">
            {selectedShifts.map((s) => (
              <div
                key={s.id}
                className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div
                  className="w-1 shrink-0 rounded-full"
                  style={{ background: "var(--brand)" }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      {fmtTime(s.startIso)} – {fmtTime(s.endIso)}
                    </span>
                    <Badge publishState={s.publishState} status={s.status} />
                  </div>
                  <div className="text-sm font-medium text-slate-800">
                    {s.client}
                  </div>
                  {s.address && (
                    <div className="mt-0.5 truncate text-xs text-slate-400">
                      📍 {s.address}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Badge({
  publishState,
  status,
}: {
  publishState: string;
  status: string;
}) {
  if (status === "COMPLETED")
    return <Pill className="bg-slate-100 text-slate-500">Done</Pill>;
  if (status === "IN_PROGRESS")
    return <Pill className="bg-blue-50 text-blue-700">On shift</Pill>;
  if (publishState === "PUBLISHED")
    return <Pill className="bg-amber-50 text-amber-700">Offer</Pill>;
  return <Pill className="bg-emerald-50 text-emerald-700">Accepted</Pill>;
}

function Pill({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${className}`}
    >
      {children}
    </span>
  );
}
