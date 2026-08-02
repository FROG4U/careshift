"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  clockIn,
  clockOut,
  startPause,
  endPause,
  startTransport,
  pingTransport,
  endTransport,
} from "@/app/my-shifts/actions";

type Coords = { lat: number; lng: number; speed: number | null } | null;

function getLocation(): Promise<Coords> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          // Device speed in m/s (null if unsupported); server → km/h.
          speed:
            pos.coords.speed != null && pos.coords.speed >= 0
              ? pos.coords.speed
              : null,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 },
    );
  });
}

function withCoords(shiftId: string, coords: Coords, extra?: Record<string, string>) {
  const fd = new FormData();
  fd.set("shiftId", shiftId);
  if (coords) {
    fd.set("lat", String(coords.lat));
    fd.set("lng", String(coords.lng));
    if (coords.speed != null) fd.set("speed", String(coords.speed));
  }
  for (const [k, v] of Object.entries(extra ?? {})) fd.set(k, v);
  return fd;
}

export type ShiftClockProps = {
  shiftId: string;
  status: string;
  paused: boolean;
  transportActive: boolean;
  transportKm: number;
  transportPurpose: string | null;
  note: string;
  hero?: boolean;
  clockInIso?: string | null;
  /** If set, starting is blocked (e.g. overdue shift notes) and the reason shown. */
  blockedReason?: string | null;
  /** Participant + time, shown under the big action circle in hero mode. */
  participantName?: string;
  participantAddress?: string;
  whenLabel?: string;
};

const PING_MS = 15_000; // GPS sample interval while transporting

function useElapsed(fromIso: string | null | undefined, active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  if (!fromIso) return "00:00:00";
  const ms = Math.max(0, now - new Date(fromIso).getTime());
  const s = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export function ShiftClock(props: ShiftClockProps) {
  const [pending, startTx] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState(props.note);
  const elapsed = useElapsed(
    props.clockInIso,
    props.status === "IN_PROGRESS" && !props.paused,
  );

  // Transport UI state (seeded from server, kept live on the client).
  const [transporting, setTransporting] = useState(props.transportActive);
  const [km, setKm] = useState(props.transportKm);
  const [purpose, setPurpose] = useState(props.transportPurpose ?? "");
  const [showTripForm, setShowTripForm] = useState(false);
  const [tripPurpose, setTripPurpose] = useState("");
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const busy = pending || locating;

  // While transporting, sample GPS periodically and accumulate km on the server.
  useEffect(() => {
    if (!transporting) return;
    let cancelled = false;
    const tick = async () => {
      const c = await getLocation();
      if (cancelled || !c) return;
      const res = await pingTransport(withCoords(props.shiftId, c));
      if (!cancelled && res && typeof res.km === "number") setKm(res.km);
    };
    pingTimer.current = setInterval(tick, PING_MS);
    tick(); // fire one immediately
    return () => {
      cancelled = true;
      if (pingTimer.current) clearInterval(pingTimer.current);
    };
  }, [transporting, props.shiftId]);

  async function locate() {
    setLocating(true);
    const c = await getLocation();
    setLocating(false);
    return c;
  }

  function handle(
    fn: () => Promise<{ error?: string; ok?: boolean } | void>,
  ) {
    setError(null);
    startTx(async () => {
      const res = await fn();
      if (res && "error" in res && res.error) setError(res.error);
    });
  }

  // --- COMPLETED ---
  if (props.status === "COMPLETED") {
    return (
      <div className="rounded-xl bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-700">
        ✓ Shift completed — sent to admin for approval
        {props.transportKm > 0 && (
          <div className="mt-0.5 text-xs font-normal text-emerald-600">
            {props.transportKm.toFixed(1)} km transport recorded
          </div>
        )}
      </div>
    );
  }

  // --- SCHEDULED (not started) ---
  if (props.status !== "IN_PROGRESS") {
    const blocked = props.blockedReason ?? null;
    const startIn = () =>
      handle(async () => {
        const c = await locate();
        return clockIn(withCoords(props.shiftId, c));
      });

    if (props.hero) {
      return (
        <div className="flex flex-col items-center">
          <button
            onClick={startIn}
            disabled={busy || !!blocked}
            className="flex h-36 w-36 flex-col items-center justify-center rounded-full text-white shadow-xl ring-4 ring-white transition active:scale-95 disabled:opacity-40"
            style={{
              background:
                "radial-gradient(circle at 30% 30%, var(--brand), color-mix(in srgb, var(--brand) 70%, #0891b2))",
            }}
          >
            <span className="material-symbols-rounded text-[40px]">
              {blocked ? "lock" : "play_arrow"}
            </span>
            <span className="text-base font-bold">
              {busy ? "…" : "Start"}
            </span>
          </button>
          <HeroName
            when={props.whenLabel}
            name={props.participantName}
            address={props.participantAddress}
          />
          {blocked && (
            <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-center text-sm font-medium text-red-600">
              {blocked}
            </p>
          )}
          {error && <p className="mt-2 text-center text-sm text-red-600">{error}</p>}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <button
          onClick={startIn}
          disabled={busy || !!blocked}
          className="w-full rounded-xl bg-[var(--brand)] px-4 py-3 text-base font-semibold text-white transition active:scale-[0.99] disabled:opacity-50"
        >
          {busy ? "Locating…" : blocked ? "Locked — notes overdue" : "Clock in"}
        </button>
        {blocked && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
            {blocked}
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  // --- IN_PROGRESS: transporting ---
  if (transporting) {
    return (
      <div className="space-y-3 rounded-xl border border-violet-200 bg-violet-50 p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-violet-500">
              Transport in progress{purpose ? ` · ${purpose}` : ""}
            </div>
            <div className="text-2xl font-bold text-violet-700">
              {km.toFixed(1)} km
            </div>
            <div className="text-xs text-violet-500">
              Tracking your journey automatically…
            </div>
          </div>
          <span className="flex h-3 w-3">
            <span className="absolute inline-flex h-3 w-3 animate-ping rounded-full bg-violet-400 opacity-75" />
            <span className="inline-flex h-3 w-3 rounded-full bg-violet-500" />
          </span>
        </div>
        <button
          onClick={() =>
            handle(async () => {
              const c = await locate();
              const res = await endTransport(withCoords(props.shiftId, c));
              if (res && "km" in res && typeof res.km === "number") setKm(res.km);
              setTransporting(false);
              return;
            })
          }
          disabled={busy}
          className="w-full rounded-xl bg-violet-600 px-4 py-3 text-base font-semibold text-white transition active:scale-[0.99] disabled:opacity-60"
        >
          {busy ? "Saving…" : "End transport"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  // --- IN_PROGRESS: on break ---
  if (props.paused) {
    return (
      <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
        <div className="text-center text-sm font-semibold text-amber-700">
          ⏸ On break — worked time is paused
        </div>
        <button
          onClick={() => handle(() => endPause(withCoords(props.shiftId, null)))}
          disabled={busy}
          className="w-full rounded-xl bg-amber-500 px-4 py-3 text-base font-semibold text-white transition active:scale-[0.99] disabled:opacity-60"
        >
          {busy ? "…" : "Resume shift"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  // --- IN_PROGRESS: working (default) ---
  const endShift = () =>
    handle(async () => {
      const c = await locate();
      return clockOut(withCoords(props.shiftId, c, { note }));
    });

  return (
    <div className="flex flex-col items-center">
      {props.hero && (
        <>
          <button
            onClick={endShift}
            disabled={busy}
            className="flex h-36 w-36 flex-col items-center justify-center rounded-full bg-red-600 text-white shadow-xl ring-4 ring-white transition active:scale-95 disabled:opacity-60"
          >
            <span className="material-symbols-rounded text-[38px]">stop_circle</span>
            <span className="text-base font-bold">{busy ? "…" : "END"}</span>
          </button>
          <HeroName
            when={props.whenLabel}
            name={props.participantName}
            address={props.participantAddress}
          />
        </>
      )}

      <div className="mt-4 w-full space-y-2">
        {/* Live timer */}
        <div className="flex items-center justify-center gap-2 rounded-full bg-emerald-500 px-4 py-3 text-white shadow-sm">
          <span className="material-symbols-rounded text-[20px]">timer</span>
          <span className="font-mono text-lg font-bold tabular-nums">{elapsed}</span>
        </div>

        {/* Driving + Break */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setShowTripForm((v) => !v)}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-full bg-violet-500 px-4 py-3 text-sm font-bold text-white transition active:scale-[0.99] disabled:opacity-60"
          >
            <span className="material-symbols-rounded text-[20px]">directions_car</span>
            Driving
          </button>
          <button
            onClick={() => handle(() => startPause(withCoords(props.shiftId, null)))}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-bold text-white transition active:scale-[0.99] disabled:opacity-60"
            style={{ background: "#9d2f6d" }}
          >
            <span className="material-symbols-rounded text-[20px]">local_cafe</span>
            Break
          </button>
        </div>

        {showTripForm && (
          <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50 p-3">
            <input
              value={tripPurpose}
              onChange={(e) => setTripPurpose(e.target.value)}
              placeholder="Where to? e.g. Doctor, Shops"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-violet-500"
            />
            <button
              onClick={() =>
                handle(async () => {
                  const c = await locate();
                  await startTransport(
                    withCoords(props.shiftId, c, { purpose: tripPurpose }),
                  );
                  setPurpose(tripPurpose);
                  setKm(0);
                  setShowTripForm(false);
                  setTransporting(true);
                  return;
                })
              }
              disabled={busy}
              className="w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Starting…" : "Start trip & track distance"}
            </button>
          </div>
        )}

        {/* Shift notes */}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Shift notes… (required to be paid)"
          rows={2}
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100"
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

/** Date/time + participant name + address shown under the big action circle. */
function HeroName({
  when,
  name,
  address,
}: {
  when?: string;
  name?: string;
  address?: string;
}) {
  if (!name) return null;
  return (
    <div className="mt-4 text-center">
      {when && (
        <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {when}
        </div>
      )}
      <div className="text-2xl font-bold text-slate-900">{name}</div>
      {address && (
        <div className="mt-1 flex items-center justify-center gap-1 text-sm text-slate-500">
          <span className="material-symbols-rounded text-[16px] text-red-500">location_on</span>
          {address}
        </div>
      )}
    </div>
  );
}
