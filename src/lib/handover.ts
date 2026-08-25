import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Shift handover notes.
 *
 * A worker finishing a shift can pass something on to whoever is next with
 * that participant. The note lives on the shift that wrote it; the incoming
 * worker acknowledges it, which is what clears it from the queue.
 *
 * A handover follows the PARTICIPANT, not the person — whoever is on the next
 * shift receives it, which is how a real handover works.
 */

export type PendingHandover = {
  /** The shift the note was written on — what gets acknowledged. */
  fromShiftId: string;
  fromWorker: string;
  clientName: string;
  body: string;
  /** When the outgoing worker finished, so the reader knows how fresh it is. */
  writtenAt: string;
};

/** How far back to look. A note older than this has been overtaken by events. */
const MAX_AGE_DAYS = 14;

/**
 * The handover a worker needs to read before getting on with an in-progress
 * shift, or null if there isn't one.
 *
 * Deliberately scoped to the shift they've actually clocked into: a worker
 * shouldn't be interrupted by a note for a shift they haven't started yet, and
 * shouldn't be able to clear one by opening the app at home.
 */
export async function pendingHandoverForShift(
  shiftId: string,
): Promise<PendingHandover | null> {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    select: { id: true, clientId: true, tenantId: true, start: true },
  });
  if (!shift) return null;

  const cutoff = new Date(shift.start.getTime() - MAX_AGE_DAYS * 86_400_000);

  const previous = await prisma.shift.findFirst({
    where: {
      tenantId: shift.tenantId,
      clientId: shift.clientId,
      id: { not: shift.id },
      start: { lt: shift.start, gte: cutoff },
      handoverNote: { not: null },
      handoverAckAt: null,
    },
    // Most recent first: if two went unacknowledged, the latest is the one
    // that matters — it was written knowing about the earlier one.
    orderBy: { start: "desc" },
    select: {
      id: true,
      handoverNote: true,
      clockOutAt: true,
      end: true,
      staff: { select: { firstName: true, lastName: true } },
      client: { select: { firstName: true, lastName: true } },
    },
  });

  if (!previous?.handoverNote) return null;

  return {
    fromShiftId: previous.id,
    fromWorker: previous.staff
      ? `${previous.staff.firstName} ${previous.staff.lastName}`
      : "A colleague",
    clientName: `${previous.client.firstName} ${previous.client.lastName}`,
    body: previous.handoverNote,
    writtenAt: (previous.clockOutAt ?? previous.end).toISOString(),
  };
}

/**
 * The handover waiting for a worker right now — only while they're actually
 * clocked in somewhere.
 */
export async function pendingHandoverForStaff(
  tenantId: string,
  staffId: string,
): Promise<PendingHandover | null> {
  const active = await prisma.shift.findFirst({
    where: { tenantId, staffId, status: "IN_PROGRESS" },
    orderBy: { start: "desc" },
    select: { id: true },
  });
  if (!active) return null;
  return pendingHandoverForShift(active.id);
}
