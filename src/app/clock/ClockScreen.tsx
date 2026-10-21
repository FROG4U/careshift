"use client";

import { useCallback, useEffect, useState } from "react";
import { QrScan } from "@/components/QrScan";
import {
  applyLocally,
  enqueue,
  hashToken,
  matchShift,
  readFetchedAt,
  readQueue,
  readShifts,
  refreshShifts,
  syncQueue,
  tokenFromScan,
  type CachedShift,
  type QueuedScan,
} from "@/lib/clockQueue";

/**
 * Clocking on and off by scanning the card at the participant's home.
 *
 * This screen is built to work with no signal, because that is the only
 * reason it exists. It holds nothing it needs from the server at the moment
 * of use: the roster was saved the last time the app had bars, the time comes
 * from the phone, the position comes from the satellites, and the scan waits
 * on the phone until there is a connection to send it down.
 *
 * It is deliberately one screen with one big button. A worker is standing in
 * someone's hallway, one-handed, often in a hurry.
 */

const WAITING_NOTE =
  "Saved on your phone. It will send itself as soon as you have signal - you can put your phone away.";

function fmtAgo(iso: string | null) {
  if (!iso) return null;
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** The phone's position, if it can get one quickly. Satellites need no data. */
function position(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    const done = (v: { lat: number; lng: number } | null) => resolve(v);
    navigator.geolocation.getCurrentPosition(
      (p) => done({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => done(null),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 10_000 },
    );
  });
}

export function ClockScreen() {
  const [shifts, setShifts] = useState<CachedShift[]>([]);
  const [queue, setQueue] = useState<QueuedScan[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{
    ok: boolean;
    title: string;
    detail: string;
  } | null>(null);

  // A code arrived in the address bar: someone pointed their phone's own
  // camera at the card rather than scanning in the app. Never acted on by
  // itself - a page reopened from history would then clock someone out - so
  // it becomes one explicit tap.
  const [fromLink, setFromLink] = useState<string | null>(null);

  const reload = useCallback(() => {
    setShifts(readShifts());
    setQueue(readQueue());
    setFetchedAt(readFetchedAt());
  }, []);

  /** Catch up with the server: send what's held, then take a fresh roster. */
  const catchUp = useCallback(async () => {
    if (!navigator.onLine) return;
    await syncQueue();
    await refreshShifts();
    reload();
  }, [reload]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- everything this screen
       shows lives in the browser: the phone's saved roster, its queue, whether
       it has a connection, and the code in the address bar. There is nothing
       to read until it has mounted. */
    reload();
    setOnline(navigator.onLine);
    void catchUp();
    // Read from the address bar rather than useSearchParams: this page is
    // served from the service worker's copy when there's no signal, and that
    // copy must not depend on anything Next has to resolve.
    const code = tokenFromScan(window.location.search);
    if (code) setFromLink(code);
    /* eslint-enable react-hooks/set-state-in-effect */

    const up = () => {
      setOnline(true);
      void catchUp();
    };
    const down = () => setOnline(false);
    const woke = () => {
      if (document.visibilityState === "visible") {
        setOnline(navigator.onLine);
        void catchUp();
      }
    };
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    document.addEventListener("visibilitychange", woke);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      document.removeEventListener("visibilitychange", woke);
    };
  }, [catchUp, reload]);

  const handleCode = useCallback(
    async (text: string) => {
      setScanning(false);
      setResult(null);
      const token = tokenFromScan(text);
      if (!token) {
        setResult({
          ok: false,
          title: "That isn't a PCG card",
          detail:
            "The code you scanned isn't one of ours. Look for the PCG Shift Care card, usually by the front door.",
        });
        return;
      }

      setBusy("Finding where you are...");
      const [hash, where] = await Promise.all([hashToken(token), position()]);
      const nowIso = new Date().toISOString();
      const match = hash ? matchShift(readShifts(), hash, Date.now()) : null;
      const kind: "IN" | "OUT" =
        match && match.status === "IN_PROGRESS" ? "OUT" : "IN";

      const scan: QueuedScan = {
        id:
          crypto.randomUUID?.() ??
          `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        token,
        at: nowIso,
        lat: where?.lat ?? null,
        lng: where?.lng ?? null,
        kind,
        clientName: match?.clientName ?? "",
        shiftId: match?.id ?? null,
        offline: !navigator.onLine,
        state: "WAITING",
      };
      // On the phone first, always. A scan that only lives in a request can be
      // lost by a dropped connection, and the worker has already walked in.
      enqueue(scan);
      if (match) applyLocally(match.id, kind, nowIso);
      reload();

      if (!navigator.onLine) {
        setBusy(null);
        setResult({
          ok: true,
          title: match
            ? kind === "IN"
              ? `Started - ${match.clientName}`
              : `Finished - ${match.clientName}`
            : "Scan saved",
          detail: WAITING_NOTE,
        });
        return;
      }

      setBusy("Sending...");
      await syncQueue();
      const after = readQueue().find((s) => s.id === scan.id);
      await refreshShifts();
      reload();
      setBusy(null);

      if (!after || after.state === "WAITING") {
        setResult({ ok: true, title: "Scan saved", detail: WAITING_NOTE });
        return;
      }
      setResult({
        ok: after.state === "DONE",
        title:
          after.state === "DONE"
            ? kind === "IN"
              ? "Clocked in"
              : "Clocked out"
            : "Couldn't use that scan",
        detail: after.message ?? "",
      });
    },
    [reload],
  );

  const waiting = queue.filter((s) => s.state === "WAITING");
  const recent = queue
    .filter((s) => s.state !== "WAITING")
    .slice(-3)
    .reverse();
  const running = shifts.find((s) => s.status === "IN_PROGRESS");
  const today = shifts.filter((s) => s.status !== "COMPLETED").slice(0, 6);

  return (
    <div className="min-h-full bg-[#f6f7f9] pb-10">
      <header
        className="bg-[#003146] px-5 pb-5 text-white"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 18px)" }}
      >
        <a
          href="/my-shifts"
          className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-white/80"
        >
          <span className="material-symbols-rounded text-[18px]">arrow_back</span>
          My shifts
        </a>
        <h1 className="text-2xl font-bold">Scan card</h1>
        <p className="mt-1 text-sm text-white/75">
          Scan the card at the door to start your shift, and again on your way
          out to finish it. It works with no signal.
        </p>
      </header>

      <main className="mx-auto max-w-md px-5">
        {/* ── Where we stand ── */}
        <div className="-mt-4 mb-5 rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                online ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
            <span className="font-semibold text-slate-800">
              {online ? "You have signal" : "No signal - scanning still works"}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {shifts.length > 0
              ? `Your shifts were saved to this phone ${fmtAgo(fetchedAt) ?? "earlier"}.`
              : "Open this screen once while you have signal, so your shifts are saved to this phone."}
          </p>
        </div>

        {/* ── Scanned with the phone's own camera ── */}
        {fromLink && (
          <div className="mb-4 rounded-2xl border border-[#003146]/20 bg-white p-4 shadow-sm">
            <p className="font-bold text-slate-800">Card scanned</p>
            <p className="mt-0.5 text-sm text-slate-600">
              Tap below to {running ? "finish" : "start"} the shift. Next time
              you can tap Scan card here instead - it is quicker.
            </p>
            <button
              onClick={() => {
                const code = fromLink;
                setFromLink(null);
                void handleCode(code);
              }}
              disabled={!!busy}
              className="mt-3 w-full rounded-xl bg-[#003146] px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {running ? `Finish ${running.clientName}` : "Start my shift"}
            </button>
          </div>
        )}

        {/* ── The button ── */}
        <button
          onClick={() => {
            setResult(null);
            setScanning(true);
          }}
          disabled={!!busy}
          className="flex w-full flex-col items-center gap-2 rounded-3xl bg-[#003146] px-6 py-9 text-white shadow-lg disabled:opacity-70"
        >
          <span className="material-symbols-rounded text-[56px]">qr_code_scanner</span>
          <span className="text-lg font-bold">
            {busy ?? (running ? `Finish ${running.clientName}` : "Scan the card")}
          </span>
          {!busy && (
            <span className="text-sm text-white/70">
              {running
                ? "Scan the card again on your way out"
                : "Point your camera at the card by the door"}
            </span>
          )}
        </button>

        {/* ── What just happened ── */}
        {result && (
          <div
            className={`mt-5 rounded-2xl p-4 ${
              result.ok
                ? "bg-emerald-50 text-emerald-900"
                : "bg-amber-50 text-amber-900"
            }`}
          >
            <div className="flex items-center gap-2 font-bold">
              <span className="material-symbols-rounded text-[20px]">
                {result.ok ? "check_circle" : "error"}
              </span>
              {result.title}
            </div>
            {result.detail && <p className="mt-1 text-sm">{result.detail}</p>}
          </div>
        )}

        {/* ── Still to send ── */}
        {waiting.length > 0 && (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-bold text-amber-900">
                  {waiting.length} scan{waiting.length === 1 ? "" : "s"} waiting
                  to send
                </p>
                <p className="mt-0.5 text-xs text-amber-800">
                  Nothing is lost. They send themselves when you have signal.
                </p>
              </div>
              <button
                onClick={() => {
                  setBusy("Sending...");
                  void (async () => {
                    await syncQueue();
                    await refreshShifts();
                    reload();
                    setBusy(null);
                  })();
                }}
                disabled={!!busy}
                className="shrink-0 rounded-xl bg-amber-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                Try now
              </button>
            </div>
            <ul className="mt-3 space-y-1 text-xs text-amber-900">
              {waiting.map((s) => (
                <li key={s.id}>
                  {s.kind === "IN" ? "Started" : "Finished"}
                  {s.clientName ? ` ${s.clientName}` : ""} at{" "}
                  {new Date(s.at).toLocaleTimeString("en-AU", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </li>
              ))}
            </ul>
          </div>
        )}

        {recent.length > 0 && (
          <ul className="mt-5 space-y-2">
            {recent.map((s) => (
              <li
                key={s.id}
                className={`rounded-xl px-3 py-2 text-xs ${
                  s.state === "DONE"
                    ? "bg-white text-slate-600"
                    : "bg-rose-50 text-rose-800"
                }`}
              >
                <span className="font-semibold">
                  {new Date(s.at).toLocaleTimeString("en-AU", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>{" "}
                {s.message ?? (s.state === "DONE" ? "Sent" : "Not accepted")}
              </li>
            ))}
          </ul>
        )}

        {/* ── The roster this phone is holding ── */}
        {today.length > 0 && (
          <section className="mt-7">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              Saved on this phone
            </h2>
            <ul className="space-y-2">
              {today.map((s) => (
                <li
                  key={s.id}
                  className="rounded-2xl bg-white p-3 text-sm shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800">
                      {s.clientName}
                    </span>
                    {s.status === "IN_PROGRESS" ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                        running
                      </span>
                    ) : s.codeHash ? null : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">
                        no card
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">{s.whenLabel}</p>
                  {s.address && (
                    <p className="text-xs text-slate-400">{s.address}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-7 text-center text-xs text-slate-400">
          Every scan records the time and, where your phone can get one, your
          location. That is what proves you were there.
        </p>
      </main>

      {scanning && (
        <QrScan onCode={handleCode} onClose={() => setScanning(false)} />
      )}
    </div>
  );
}
