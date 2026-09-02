"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { isManager } from "@/lib/roles";
import { tzForState, zonedTimeToUtc, dateKeyInTz } from "@/lib/timezone";

/**
 * Clock a worker in from the office.
 *
 * For the worker who is on site but can't clock themselves in - flat battery,
 * no signal, app trouble. Without this the shift sits red all day and has to
 * be reconstructed afterwards from memory.
 *
 * Defaults to the ROSTERED start rather than now. Paid time is the overlap of
 * clocked and rostered, so stamping "now" on a shift discovered 40 minutes
 * late would quietly dock the worker 40 minutes they were actually working.
 * The office can override it when they genuinely started late.
 */
export async function officeClockIn(formData: FormData) {
  const { tenant, session } = await requireTenant();
  if (!isManager(session.role)) return { error: "Managers only." };

  const shiftId = String(formData.get("shiftId") ?? "");
  const startTime = String(formData.get("startTime") ?? "").trim();

  const shift = await prisma.shift.findFirst({
    where: { id: shiftId, tenantId: tenant.id },
    select: {
      id: true,
      start: true,
      end: true,
      status: true,
      clockInAt: true,
      branch: { select: { state: true } },
      staff: { select: { firstName: true } },
    },
  });
  if (!shift) return { error: "That shift no longer exists." };
  if (shift.clockInAt) return { error: "They're already clocked in." };
  if (shift.status === "COMPLETED") {
    return { error: "That shift is already finished." };
  }

  const tz = tzForState(shift.branch?.state ?? null);
  let clockInAt = shift.start;
  if (startTime) {
    // Read against the shift's own local date, so a time typed by an admin in
    // London still means what it says where the participant lives.
    const parsed = zonedTimeToUtc(dateKeyInTz(shift.start, tz), startTime, tz);
    if (!parsed) return { error: "Check the start time." };
    if (parsed > new Date()) return { error: "That start time is in the future." };
    clockInAt = parsed;
  }

  await prisma.shift.update({
    where: { id: shift.id },
    data: {
      status: "IN_PROGRESS",
      clockInAt,
      clockInByOffice: session.name,
      // The worker never pressed anything, so there is no position to record.
      // Leaving these null is the honest answer; a fake one would look like
      // evidence.
      clockInLat: null,
      clockInLng: null,
      // Stop the late reminder firing now the office has taken it on.
      lateAlertedAt: new Date(),
    },
  });

  revalidatePath("/live");
  revalidatePath("/timesheets");
  return { ok: true, worker: shift.staff?.firstName ?? "They" };
}
