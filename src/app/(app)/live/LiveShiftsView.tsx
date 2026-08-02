"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { LiveShift, LiveStatus } from "@/lib/liveShifts";
import { TrackMap } from "@/components/TrackMap";

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function ago(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return `${Math.round(mins / 60)}h ago`;
}

const STYLE: Record<
  LiveStatus,
  { label: string; chip: string; dot: string }
> = {
  UPCOMING: { label: "Upcoming", chip: "bg-blue-50 text-blue-700", dot: "bg-blue-400" },
  AWAITING: { label: "Awaiting clock-in", chip: "bg-amber-50 text-amber-700", dot: "bg-amber-400" },
  LATE: { label: "Late — not clocked in", chip: "bg-red-100 text-red-700", dot: "bg-red-500" },
  ON_SHIFT: { label: "On shift", chip: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  OVERRUN: { label: "Overrunning", chip: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
};

function time(iso: string) {
  return new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
}

function rel(iso: string) {
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (mins > 0) return `in ${mins}m`;
  if (mins === 0) return "now";
  return `${-mins}m ago`;
}

export function LiveShiftsView({ shifts }: { shifts: LiveShift[] }) {
  const router = useRouter();
  const [, tick] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  // Re-check with the server every 30s, and re-render every 20s for the timers.
  useEffect(() => {
    const poll = setInterval(() => router.refresh(), 30_000);
    const t = setInterval(() => tick((n) => n + 1), 20_000);
    return () => {
      clearInterval(poll);
      clearInterval(t);
    };
  }, [router]);

  const order: LiveStatus[] = ["LATE", "OVERRUN", "AWAITING", "ON_SHIFT", "UPCOMING"];
  const sorted = [...shifts].sort(
    (a, b) => order.indexOf(a.status) - order.indexOf(b.status),
  );
  const alerts = shifts.filter((s) => s.status === "LATE" || s.status === "OVERRUN").length;

  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Live Shifts
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Shifts from 10 min before start to 30 min after — auto-refreshing. Late
            or overrunning workers are reminded automatically.
          </p>
        </div>
        {alerts > 0 && (
          <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-bold text-red-700">
            {alerts} need{alerts === 1 ? "s" : ""} attention
          </span>
        )}
      </header>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--border)] bg-white py-16 text-center shadow-sm">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--pastel-green)]">
            <span className="material-symbols-rounded text-[28px] text-green-600">check_circle</span>
          </div>
          <p className="font-medium text-[var(--text-primary)]">No shifts live right now</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">This page updates itself as shifts begin.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((s) => {
            const st = STYLE[s.status];
            const attention = s.status === "LATE" || s.status === "OVERRUN";
            const open = openId === s.id;
            const hasWorkerLoc = s.workerLat != null && s.workerLng != null;
            const km =
              hasWorkerLoc && s.clientLat != null && s.clientLng != null
                ? haversineKm(s.workerLat!, s.workerLng!, s.clientLat, s.clientLng)
                : null;
            const eta = km != null ? Math.max(1, Math.round((km / 32) * 60)) : null;
            return (
              <div
                key={s.id}
                className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${
                  attention ? "border-red-200" : "border-[var(--border)]"
                }`}
              >
                <button
                  onClick={() => setOpenId(open ? null : s.id)}
                  className="flex w-full items-center gap-4 p-4 text-left transition hover:bg-[var(--background)]"
                >
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${st.dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[var(--text-primary)]">{s.worker}</div>
                    <div className="truncate text-sm text-[var(--text-secondary)]">
                      {s.client} · {time(s.startIso)}–{time(s.endIso)}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${st.chip}`}>
                      {st.label}
                    </span>
                    <div className="mt-1 text-xs text-[var(--text-muted)]">
                      {s.status === "UPCOMING"
                        ? `starts ${rel(s.startIso)}`
                        : s.clockInIso
                          ? `in ${time(s.clockInIso)}`
                          : s.status === "OVERRUN"
                            ? `ended ${rel(s.endIso)}`
                            : `started ${rel(s.startIso)}`}
                    </div>
                  </div>
                  <span
                    className={`material-symbols-rounded shrink-0 text-[22px] text-[var(--text-muted)] transition ${open ? "rotate-180" : ""}`}
                  >
                    expand_more
                  </span>
                </button>

                {open && (
                  <div className="border-t border-[var(--border)] p-4">
                    {s.clientLat == null || s.clientLng == null ? (
                      <p className="text-sm text-[var(--text-muted)]">
                        No location set for this participant.
                      </p>
                    ) : (
                      <>
                        <TrackMap
                          client={{ lat: s.clientLat, lng: s.clientLng }}
                          worker={hasWorkerLoc ? { lat: s.workerLat!, lng: s.workerLng! } : null}
                          radiusM={s.geofenceFt * 0.3048}
                        />
                        {hasWorkerLoc ? (
                          <div className="mt-3 grid grid-cols-3 gap-3">
                            <Metric icon="my_location" label="Worker seen" value={s.workerSeenIso ? ago(s.workerSeenIso) : "—"} />
                            <Metric icon="straighten" label="Distance" value={`${km!.toFixed(1)} km`} />
                            <Metric icon="directions_car" label="~ Drive time" value={`${eta} min`} />
                          </div>
                        ) : (
                          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                            No recent location from {s.worker.split(" ")[0]}&apos;s phone. Ask
                            them to open the app so their position can be tracked.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-center">
      <span className="material-symbols-rounded text-[18px] text-[var(--brand)]">{icon}</span>
      <div className="text-sm font-bold text-[var(--text-primary)]">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
    </div>
  );
}
