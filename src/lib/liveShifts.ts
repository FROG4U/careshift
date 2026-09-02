import { prisma } from "./prisma";
import { notifyWorker, notifyManagers } from "./notify";
import { tzForState } from "./timezone";

export type LiveStatus =
  | "UPCOMING" // starts within 15 min, not started yet
  | "AWAITING" // started, within the clock-in grace
  | "LATE" // started + grace passed, still not clocked in
  | "ON_SHIFT" // clocked in, running normally
  | "OVERRUN"; // clocked in, shift ended 30+ min ago

export type LiveShift = {
  id: string;
  status: LiveStatus;
  worker: string;
  client: string;
  startIso: string;
  endIso: string;
  clockInIso: string | null;
  // Client (shift) location + geofence.
  clientLat: number | null;
  clientLng: number | null;
  geofenceFt: number;
  // Worker's latest known device location.
  workerLat: number | null;
  workerLng: number | null;
  workerSeenIso: string | null;
  /**
   * The participant's local timezone, so the admin screen shows the shift in
   * the time the worker is actually living in - not whatever timezone the
   * admin's own laptop happens to be set to.
   */
  timeZone: string;
  /** Rostered start as HH:MM in the branch's zone, for the office clock-in. */
  startHm: string;
};

const MIN = 60_000;
const LEAD = 10 * MIN; // start tracking 10 min before the shift
const TRAIL = 30 * MIN; // keep tracking 30 min after it ends

/**
 * Finds the shifts happening around now, works out each one's live status, and
 * fires reminder notifications ONCE (to the worker + managers) when a worker is
 * late to clock in, or is still clocked in well after the shift ended.
 * Returns the live list for display.
 */
export async function runLiveChecks(
  tenantId: string,
  graceMin: number,
): Promise<LiveShift[]> {
  const now = Date.now();

  const shifts = await prisma.shift.findMany({
    where: {
      tenantId,
      publishState: "ACCEPTED",
      status: { not: "COMPLETED" },
      staffId: { not: null },
      start: { lte: new Date(now + LEAD) },
      // Normal live window, OR anyone still clocked in (an overrun stays tracked
      // however long ago the shift was meant to end, until they clock out).
      OR: [{ end: { gte: new Date(now - TRAIL) } }, { status: "IN_PROGRESS" }],
    },
    include: { staff: true, client: true, branch: { select: { state: true } } },
    orderBy: { start: "asc" },
  });

  const out: LiveShift[] = [];

  for (const s of shifts) {
    const start = s.start.getTime();
    const end = s.end.getTime();
    const clockedIn = s.status === "IN_PROGRESS";

    let status: LiveStatus;
    if (clockedIn) {
      status = now > end + TRAIL ? "OVERRUN" : "ON_SHIFT";
    } else if (now < start) {
      status = "UPCOMING";
    } else if (now <= start + graceMin * MIN) {
      status = "AWAITING";
    } else {
      status = "LATE";
    }

    const worker = `${s.staff!.firstName} ${s.staff!.lastName}`;
    const client = `${s.client.firstName} ${s.client.lastName}`;
    // Formatted in the BRANCH's timezone. This label goes into the push sent
    // to the worker, so rendering it in the server's timezone told a Brisbane
    // worker a time that meant nothing to them.
    const timeZone = tzForState(s.branch?.state ?? null);
    const startLabel = s.start.toLocaleTimeString("en-AU", {
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    });
    // 24-hour HH:MM for the office clock-in's <input type="time">.
    const startHm = s.start.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone,
    });

    // ── Late: not clocked in past the grace window ──
    if (status === "LATE" && !s.lateAlertedAt) {
      await prisma.shift.update({
        where: { id: s.id },
        data: { lateAlertedAt: new Date() },
      });
      await notifyWorker(s.staffId!, {
        tenantId,
        type: "LATE",
        title: "You're late for your shift",
        body: `You haven't clocked in for ${client} (${startLabel}). Please tap "Running late" and tell the office why.`,
        shiftId: s.id,
      });
      await notifyManagers({
        tenantId,
        type: "LATE",
        title: "Worker not clocked in",
        body: `${worker} hasn't clocked in for ${client} — shift started ${startLabel}.`,
        shiftId: s.id,
      });
    }

    // ── Overrun: still clocked in well after the shift ended ──
    if (status === "OVERRUN" && !s.overrunAlertedAt) {
      await prisma.shift.update({
        where: { id: s.id },
        data: { overrunAlertedAt: new Date() },
      });
      await notifyWorker(s.staffId!, {
        tenantId,
        type: "OVERRUN",
        title: "Are you still on shift?",
        body: `Your shift with ${client} has ended. If you've finished, please clock out.`,
        shiftId: s.id,
      });
      await notifyManagers({
        tenantId,
        type: "OVERRUN",
        title: "Worker still clocked in",
        body: `${worker} is still clocked in after their shift with ${client} ended.`,
        shiftId: s.id,
      });
    }

    out.push({
      id: s.id,
      status,
      worker,
      client,
      startIso: s.start.toISOString(),
      endIso: s.end.toISOString(),
      clockInIso: s.clockInAt?.toISOString() ?? null,
      clientLat: s.client.lat,
      clientLng: s.client.lng,
      geofenceFt: s.client.geofenceFt,
      workerLat: s.staff!.lastLat,
      workerLng: s.staff!.lastLng,
      workerSeenIso: s.staff!.lastSeenAt?.toISOString() ?? null,
      timeZone,
      startHm,
    });
  }

  return out;
}
