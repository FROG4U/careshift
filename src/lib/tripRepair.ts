import "server-only";
import { prisma } from "./prisma";
import { finaliseTripKm, gpsPathKm } from "./tripDistance";

/**
 * Finished trips whose saved distance is shorter than their own GPS trail.
 *
 * These were saved by the old mileage code (see lib/tripDistance): a phone that
 * slept mid-drive left long jumps that were thrown away, so real driving was
 * paid as 0 km. The GPS points were kept, so the distance can be worked out
 * again from them.
 *
 * Trips an admin corrected by hand are never listed - that figure is a decision,
 * not a measurement.
 */

/** Short by at least this much before it's worth flagging. */
const SHORT_BY_KM = 0.5;

export type ShortTrip = {
  id: string;
  shiftId: string;
  shiftStart: Date;
  branchId: string | null;
  worker: string;
  client: string;
  savedKm: number;
  gpsKm: number;
};

export async function findShortTrips(
  tenantId: string,
  opts: { shiftIds?: string[] } = {},
): Promise<ShortTrip[]> {
  if (opts.shiftIds && opts.shiftIds.length === 0) return [];
  const trips = await prisma.transport.findMany({
    where: {
      endAt: { not: null },
      kmEditedAt: null,
      shift: {
        tenantId,
        ...(opts.shiftIds ? { id: { in: opts.shiftIds } } : {}),
      },
    },
    select: {
      id: true,
      km: true,
      shiftId: true,
      points: { select: { lat: true, lng: true, at: true } },
      shift: {
        select: {
          start: true,
          branchId: true,
          staff: { select: { firstName: true, lastName: true } },
          client: { select: { firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { startAt: "asc" },
  });

  return trips
    .map((t) => ({
      id: t.id,
      shiftId: t.shiftId,
      shiftStart: t.shift.start,
      branchId: t.shift.branchId,
      worker: t.shift.staff
        ? `${t.shift.staff.firstName} ${t.shift.staff.lastName}`
        : "Unassigned",
      client: `${t.shift.client.firstName} ${t.shift.client.lastName}`,
      savedKm: t.km,
      gpsKm: gpsPathKm(t.points),
    }))
    .filter((t) => t.gpsKm >= t.savedKm + SHORT_BY_KM);
}

/**
 * Recalculate every short trip. Skips trips inside a completed pay run: the
 * paid figure there is frozen, and changing the trip underneath would leave
 * the two disagreeing. Re-open the run first.
 */
export async function repairShortTrips(
  tenantId: string,
): Promise<{ fixed: number; skipped: number; kmAdded: number }> {
  const [short, completedRuns] = await Promise.all([
    findShortTrips(tenantId),
    prisma.payrollPeriod.findMany({
      where: { tenantId, status: "APPROVED" },
      select: { branchId: true, startDate: true, endDate: true },
    }),
  ]);

  let fixed = 0;
  let skipped = 0;
  let kmAdded = 0;
  for (const t of short) {
    const frozen = completedRuns.some(
      (r) =>
        (r.branchId === null || r.branchId === t.branchId) &&
        t.shiftStart >= r.startDate &&
        t.shiftStart <= r.endDate,
    );
    if (frozen) {
      skipped += 1;
      continue;
    }
    const km = await finaliseTripKm(t.id);
    if (km != null && km > t.savedKm) {
      fixed += 1;
      kmAdded += km - t.savedKm;
    }
  }
  return { fixed, skipped, kmAdded: Math.round(kmAdded * 10) / 10 };
}
