/**
 * The phone's side of QR clocking: the roster it keeps, the scans it holds
 * while there is no signal, and sending them when there is.
 *
 * Runs in the browser only (localStorage), so no "server-only" here. Every
 * read and write is wrapped: a worker with storage blocked must still be able
 * to scan a card while online, which is the common case.
 */

/**
 * The code out of a scanned QR payload, whether it was the card's full URL
 * (what a phone camera reads) or the bare code.
 *
 * Shared with the server, which has to read it the same way.
 */
export function tokenFromScan(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const inUrl = /[?&]c=([A-Za-z0-9_-]{10,})/.exec(text);
  if (inUrl) return inUrl[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(text) ? text : null;
}

export const SHIFTS_KEY = "pcg:clock:shifts";
export const QUEUE_KEY = "pcg:clock:queue";
export const FETCHED_KEY = "pcg:clock:fetchedAt";

/** A shift as the phone holds it. No participant code, only a hash of it. */
export type CachedShift = {
  id: string;
  clientName: string;
  address: string;
  /** Hash of the code on that participant's card, or null if none issued. */
  codeHash: string | null;
  start: string;
  end: string;
  status: string;
  clockInAt: string | null;
  whenLabel: string;
};

export type QueuedScan = {
  /** Made on the phone, and the key the server dedupes on. */
  id: string;
  token: string;
  at: string;
  lat: number | null;
  lng: number | null;
  /** IN or OUT as the phone worked it out, for what it tells the worker. */
  kind: "IN" | "OUT";
  clientName: string;
  shiftId: string | null;
  /** True when it was taken with no signal. */
  offline: boolean;
  state: "WAITING" | "DONE" | "FAILED";
  message?: string;
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable or full - the screen still works online */
  }
}

export const readShifts = () => read<CachedShift[]>(SHIFTS_KEY, []);
export const writeShifts = (shifts: CachedShift[]) => write(SHIFTS_KEY, shifts);
export const readQueue = () => read<QueuedScan[]>(QUEUE_KEY, []);
export const writeQueue = (q: QueuedScan[]) => write(QUEUE_KEY, q);

export function readFetchedAt(): string | null {
  try {
    return localStorage.getItem(FETCHED_KEY);
  } catch {
    return null;
  }
}

/** The same truncated SHA-256 the server sends, worked out on the phone. */
export async function hashToken(token: string): Promise<string | null> {
  try {
    const bytes = new TextEncoder().encode(token);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 32);
  } catch {
    // Only happens on an insecure origin, where the app doesn't run anyway.
    return null;
  }
}

/** Pull the roster down and keep it, so a scan can be matched with no signal. */
export async function refreshShifts(): Promise<CachedShift[] | null> {
  try {
    const res = await fetch("/api/clock/shifts", { cache: "no-store" });
    if (res.status === 401) {
      // Signed out. The saved roster carries participants' names and addresses,
      // so it goes with the session rather than sitting in a phone's storage.
      writeShifts([]);
      return null;
    }
    if (!res.ok) return null;
    const data = (await res.json()) as { shifts?: CachedShift[] };
    if (!Array.isArray(data.shifts)) return null;
    writeShifts(data.shifts);
    try {
      localStorage.setItem(FETCHED_KEY, new Date().toISOString());
    } catch {
      /* storage unavailable */
    }
    return data.shifts;
  } catch {
    return null;
  }
}

/** The code on the card was scanned - which of my shifts is it? */
export function matchShift(
  shifts: CachedShift[],
  codeHash: string,
  nowMs: number,
): CachedShift | null {
  const mine = shifts.filter((s) => s.codeHash === codeHash);
  if (mine.length === 0) return null;
  // A shift already running wins: this scan is them leaving.
  const running = mine.find((s) => s.status === "IN_PROGRESS");
  if (running) return running;
  // Otherwise the one nearest to now.
  return mine
    .filter((s) => s.status === "SCHEDULED")
    .sort(
      (a, b) =>
        Math.abs(new Date(a.start).getTime() - nowMs) -
        Math.abs(new Date(b.start).getTime() - nowMs),
    )[0] ?? null;
}

/** A scan kept on the phone so an app restart or flat battery can't lose it. */
export function enqueue(scan: QueuedScan) {
  const q = readQueue();
  if (q.some((s) => s.id === scan.id)) return;
  q.push(scan);
  writeQueue(q.slice(-50));
}

/**
 * Mark a shift as running (or finished) in the cached roster, so the next scan
 * of the same card is read as the other half of the pair while still offline.
 */
export function applyLocally(shiftId: string, kind: "IN" | "OUT", atIso: string) {
  const shifts = readShifts().map((s) =>
    s.id === shiftId
      ? {
          ...s,
          status: kind === "IN" ? "IN_PROGRESS" : "COMPLETED",
          clockInAt: kind === "IN" ? atIso : s.clockInAt,
        }
      : s,
  );
  writeShifts(shifts);
}

export type SyncOutcome = {
  /** How many were accepted by the server. */
  sent: number;
  /** Still waiting, because there was no connection. */
  waiting: number;
  /** Couldn't be used - no matching shift, wrong card. */
  failed: number;
};

/**
 * Send everything the phone is holding.
 *
 * Safe to call as often as you like: each scan carries the id it was given on
 * the phone, so a batch the server already applied is recognised rather than
 * applied twice.
 */
export async function syncQueue(): Promise<SyncOutcome> {
  const q = readQueue();
  const waiting = q.filter((s) => s.state === "WAITING");
  if (waiting.length === 0) {
    return { sent: 0, waiting: 0, failed: 0 };
  }

  let results: { id: string; ok: boolean; outcome: string; message: string }[] = [];
  try {
    const res = await fetch("/api/clock/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceNow: new Date().toISOString(),
        events: waiting.map((s) => ({
          id: s.id,
          token: s.token,
          at: s.at,
          lat: s.lat,
          lng: s.lng,
          // Held rather than sent, whatever the phone said about its signal
          // at the time: a phone showing bars on a dying tower fails the same
          // way, and the office needs to see the gap either way.
          offline: s.offline || Date.now() - new Date(s.at).getTime() > 120_000,
        })),
      }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { results?: typeof results };
    results = data.results ?? [];
  } catch {
    // No connection, or the server refused. Everything stays on the phone.
    return { sent: 0, waiting: waiting.length, failed: 0 };
  }

  const byId = new Map(results.map((r) => [r.id, r]));
  const next = q.map((s) => {
    const r = byId.get(s.id);
    if (!r) return s;
    return {
      ...s,
      // The token is only needed until the scan is accepted; drop it then.
      token: r.ok ? "" : s.token,
      state: r.ok ? ("DONE" as const) : ("FAILED" as const),
      message: r.message,
    };
  });
  // Keep a short tail of finished scans so the worker can see what happened,
  // then forget them.
  const cutoff = Date.now() - 24 * 3_600_000;
  writeQueue(
    next.filter(
      (s) => s.state === "WAITING" || new Date(s.at).getTime() > cutoff,
    ),
  );

  const sent = results.filter((r) => r.ok).length;
  return {
    sent,
    waiting: next.filter((s) => s.state === "WAITING").length,
    failed: results.length - sent,
  };
}
