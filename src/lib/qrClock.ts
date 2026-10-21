import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./prisma";
import { finaliseTripKm } from "./tripDistance";
// Shared with the phone, which has to read a scanned card the same way.
import { tokenFromScan } from "./clockQueue";

export { tokenFromScan };

/**
 * Clocking on and off by scanning the QR card left at a participant's home.
 *
 * Why it exists: some participants have no mobile signal at all - a basement
 * flat, a back room, a house out of range. A worker standing in the right
 * place with no bars can't tap Start, and the office is left with nothing to
 * show a plan manager or an auditor. The card solves the evidence problem in
 * a way a phone signal can't: it only exists at that address, so a scan of it
 * says the worker was at the door. The scan is stamped with the phone's own
 * time and GPS fix (satellites need no data), held on the phone when there's
 * no signal, and sent the moment there is.
 *
 * The phone never holds the token itself, only a hash of it, so the app can
 * recognise a scan offline without carrying something that would let anyone
 * clock in from their sofa.
 */

/** How long before or after a rostered start a scan can open that shift. */
const MATCH_WINDOW_MS = 6 * 3_600_000;
/** A phone clock this far out is reported rather than trusted silently. */
export const DRIFT_WARN_SEC = 300;

/** A fresh code for a participant's card. 22 URL-safe characters. */
export function newQrToken() {
  return randomBytes(16).toString("base64url");
}

/**
 * What the phone stores and matches a scan against. Truncated SHA-256: long
 * enough that it can't be worked backwards, short enough to keep the cached
 * shift list small.
 */
export function hashQrToken(token: string) {
  return createHash("sha256").update(token).digest("hex").slice(0, 32);
}

/**
 * What the card's QR code actually contains. A full URL, so a participant's
 * family pointing a phone camera at it lands on the clock screen rather than
 * seeing a meaningless string - the app reads the code out of it either way.
 */
export function qrUrlFor(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}/clock?c=${token}`;
}

const FT_PER_M = 3.28084;

function distanceMetres(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(toRad(aLat)) * Math.cos(toRad(bLat));
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** One scan as the phone recorded it. */
export type ScanEvent = {
  /** Generated on the phone. The same scan resent keeps the same id. */
  id: string;
  /** The code read off the card. */
  token: string;
  /** Device time of the scan, ISO. */
  at: string;
  lat?: number | null;
  lng?: number | null;
  /** True when the phone had no signal at the time and queued it. */
  offline?: boolean;
  /** Notes typed at the door while offline, for a clock-out scan. */
  note?: string | null;
  handover?: string | null;
};

export type ScanResult = {
  id: string;
  ok: boolean;
  /** CLOCKED_IN | CLOCKED_OUT | NO_SHIFT | UNKNOWN_CODE | ERROR */
  outcome: string;
  /** Shown to the worker, so it has to read as something a person wrote. */
  message: string;
  shiftId?: string;
  clientName?: string;
};

type Who = { tenantId: string; staffId: string };

/**
 * Apply one scan.
 *
 * The worker never says whether they are arriving or leaving: if the shift for
 * that participant is already running, the scan ends it, otherwise it starts
 * the nearest one. That is how the card gets used in practice - scan on the
 * way in, scan on the way out.
 */
export async function applyScan(
  who: Who,
  ev: ScanEvent,
  /** Server time when the batch arrived, for working out the phone's drift. */
  receivedAt: Date,
  /** The phone's own clock when it sent the batch, if it said. */
  deviceNow: Date | null,
): Promise<ScanResult> {
  // A resend of a scan already applied. Answer from the record rather than
  // clocking the worker out of the shift this very scan clocked them into.
  const seen = await prisma.qrScan.findUnique({ where: { id: ev.id } });
  if (seen) {
    return {
      id: ev.id,
      ok: seen.outcome === "CLOCKED_IN" || seen.outcome === "CLOCKED_OUT",
      outcome: seen.outcome,
      message: seen.message ?? "Already recorded.",
      shiftId: seen.shiftId ?? undefined,
    };
  }

  const token = tokenFromScan(ev.token);
  const client = token
    ? await prisma.client.findFirst({
        where: { qrToken: token, tenantId: who.tenantId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          lat: true,
          lng: true,
          geofenceFt: true,
        },
      })
    : null;

  const driftSec =
    deviceNow != null
      ? Math.round((deviceNow.getTime() - receivedAt.getTime()) / 1000)
      : null;
  const offline = !!ev.offline;
  const lat = ev.lat ?? null;
  const lng = ev.lng ?? null;

  if (!client) {
    // Nothing to attach it to, so there's no participant row to write - but
    // the worker still gets a straight answer.
    return {
      id: ev.id,
      ok: false,
      outcome: "UNKNOWN_CODE",
      message:
        "That code isn't one of ours. Check you scanned the PCG card on the wall, and tell the office if it is the right one.",
    };
  }

  const name = `${client.firstName} ${client.lastName}`;
  // Kept on every scan, near or far: it is the evidence the card exists for.
  const distanceM =
    client.lat != null && client.lng != null && lat != null && lng != null
      ? Math.round(distanceMetres(lat, lng, client.lat, client.lng))
      : null;
  // The shift's own distance fields mean "how far OUTSIDE the radius", which
  // is what the timesheet reads to decide whether there is anything to look
  // at. A scan at the door leaves them null, the same as a tap at the door.
  const outsideM =
    distanceM != null && distanceM > client.geofenceFt / FT_PER_M
      ? distanceM
      : null;

  /**
   * The scan record, written in the SAME transaction as the clock it belongs
   * to. If either fails, neither is written and the phone's retry is safe -
   * which is the whole point of the id being generated on the phone.
   */
  const logWrite = (
    kind: "IN" | "OUT",
    outcome: string,
    message: string,
    shiftId: string | null,
    scannedAt: Date,
  ) =>
    prisma.qrScan.create({
      data: {
        id: ev.id,
        tenantId: who.tenantId,
        staffId: who.staffId,
        clientId: client.id,
        shiftId,
        kind,
        scannedAt,
        syncedAt: receivedAt,
        offline,
        driftSec,
        lat,
        lng,
        distanceM,
        outcome,
        message,
      },
    });

  const scannedAt = (() => {
    const d = new Date(ev.at);
    if (Number.isNaN(d.getTime())) return receivedAt;
    // A scan can't be in the future and can't predate the app existing. A
    // phone with a badly wrong clock would otherwise write a nonsense shift.
    if (d.getTime() > receivedAt.getTime() + 60_000) return receivedAt;
    if (d.getTime() < receivedAt.getTime() - 14 * 24 * 3_600_000) return receivedAt;
    return d;
  })();

  // Already on this shift: the scan is them leaving.
  const running = await prisma.shift.findFirst({
    where: {
      tenantId: who.tenantId,
      staffId: who.staffId,
      clientId: client.id,
      status: "IN_PROGRESS",
    },
    include: { transports: true },
    orderBy: { start: "desc" },
  });

  if (running) {
    // A clock-out can't land before the clock-in it closes, whatever the
    // phone's clock says.
    const outAt =
      running.clockInAt && scannedAt < running.clockInAt
        ? running.clockInAt
        : scannedAt;

    await prisma.shiftPause.updateMany({
      where: { shiftId: running.id, endAt: null },
      data: { endAt: outAt },
    });

    const openTrip = running.transports.find((t) => !t.endAt);
    if (openTrip) {
      await prisma.transport.update({
        where: { id: openTrip.id },
        data: {
          endAt: outAt,
          endLat: lat,
          endLng: lng,
          lastLat: lat,
          lastLng: lng,
          points: lat != null && lng != null ? { create: [{ lat, lng }] } : undefined,
        },
      });
      try {
        await finaliseTripKm(openTrip.id);
      } catch {
        /* the repair on Timesheets catches anything missed here */
      }
    }

    const message = `Clocked out of ${name}'s shift.`;
    await prisma.$transaction([
      prisma.shift.update({
        where: { id: running.id },
        data: {
          status: "COMPLETED",
          clockOutAt: outAt,
          clockOutLat: lat,
          clockOutLng: lng,
          clockOutQr: true,
          clockOutDistanceM: outsideM,
          progressNote: ev.note?.trim() || running.progressNote,
          handoverNote: ev.handover?.trim() || running.handoverNote,
          ...(offline ? { offlineSyncedAt: receivedAt, clockDriftSec: driftSec } : {}),
        },
      }),
      logWrite("OUT", "CLOCKED_OUT", message, running.id, outAt),
    ]);
    return {
      id: ev.id,
      ok: true,
      outcome: "CLOCKED_OUT",
      message,
      shiftId: running.id,
      clientName: name,
    };
  }

  // Otherwise it's an arrival: the shift for this participant nearest the scan.
  const candidates = await prisma.shift.findMany({
    where: {
      tenantId: who.tenantId,
      staffId: who.staffId,
      clientId: client.id,
      status: "SCHEDULED",
      start: {
        gte: new Date(scannedAt.getTime() - MATCH_WINDOW_MS),
        lte: new Date(scannedAt.getTime() + MATCH_WINDOW_MS),
      },
    },
    select: { id: true, start: true },
  });

  const shift = candidates.sort(
    (a, b) =>
      Math.abs(a.start.getTime() - scannedAt.getTime()) -
      Math.abs(b.start.getTime() - scannedAt.getTime()),
  )[0];

  if (!shift) {
    const message = `You don't have a shift with ${client.firstName} around that time, so there was nothing to start. Call the office - they can put it right.`;
    await logWrite("IN", "NO_SHIFT", message, null, scannedAt);
    return { id: ev.id, ok: false, outcome: "NO_SHIFT", message, clientName: name };
  }

  const message = `Clocked in for ${name}.`;
  await prisma.$transaction([
    prisma.shift.update({
      where: { id: shift.id },
      data: {
        status: "IN_PROGRESS",
        clockInAt: scannedAt,
        clockInLat: lat,
        clockInLng: lng,
        clockInQr: true,
        clockInDistanceM: outsideM,
        ...(offline ? { offlineSyncedAt: receivedAt, clockDriftSec: driftSec } : {}),
      },
    }),
    logWrite("IN", "CLOCKED_IN", message, shift.id, scannedAt),
  ]);
  return {
    id: ev.id,
    ok: true,
    outcome: "CLOCKED_IN",
    message,
    shiftId: shift.id,
    clientName: name,
  };
}

/** Distance in feet, for the office-facing text. */
export const metresToFeet = (m: number) => Math.round(m * FT_PER_M);
