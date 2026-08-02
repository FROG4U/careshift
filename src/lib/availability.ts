import { prisma } from "./prisma";

/**
 * True if the worker has an APPROVED time-off request that overlaps the given
 * shift window. Used by the schedule to stop rostering someone who's off.
 */
export async function isStaffUnavailable(
  tenantId: string,
  staffId: string,
  start: Date,
  end: Date,
): Promise<boolean> {
  const offs = await prisma.availability.findMany({
    where: { tenantId, staffId, status: "APPROVED" },
  });

  for (const a of offs) {
    if (a.allDay || !a.startTime || !a.endTime) {
      // Whole-day (or multi-day) window: midnight of startDate → end of endDate.
      const dayStart = new Date(a.startDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(a.endDate);
      dayEnd.setHours(23, 59, 59, 999);
      if (start <= dayEnd && end >= dayStart) return true;
    } else {
      // Single-day time range.
      const [sh, sm] = a.startTime.split(":").map(Number);
      const [eh, em] = a.endTime.split(":").map(Number);
      const winStart = new Date(a.startDate);
      winStart.setHours(sh, sm, 0, 0);
      const winEnd = new Date(a.startDate);
      winEnd.setHours(eh, em, 0, 0);
      if (start < winEnd && end > winStart) return true;
    }
  }
  return false;
}
