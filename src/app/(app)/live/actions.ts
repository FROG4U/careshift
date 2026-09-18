"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { isManager } from "@/lib/roles";
import { tzForState, zonedTimeToUtc, dateKeyInTz, addDaysInTz } from "@/lib/timezone";
import { finaliseTripKm } from "@/lib/tripDistance";

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

/**
 * Clock a worker out from the office.
 *
 * For a shift still running after the worker has gone: their clock-out never
 * reached us (no signal, a database blip, a flat battery). Before this there
 * was no way for the office to stop a shift - Timesheets only lists finished
 * ones, and a manual entry was refused because the hours were "still being
 * worked".
 *
 * Defaults to the rostered finish, or now if that hasn't come yet.
 */
export async function officeClockOut(formData: FormData) {
  const { tenant, session } = await requireTenant();
  if (!isManager(session.role)) return { error: "Managers only." };

  const shiftId = String(formData.get("shiftId") ?? "");
  const endTime = String(formData.get("endTime") ?? "").trim();

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
      transports: { where: { endAt: null }, select: { id: true } },
    },
  });
  if (!shift) return { error: "That shift no longer exists." };
  if (shift.status !== "IN_PROGRESS" || !shift.clockInAt) {
    return { error: "They're not clocked in, so there's nothing to end." };
  }

  const now = new Date();
  const tz = tzForState(shift.branch?.state ?? null);
  let clockOutAt = shift.end < now ? shift.end : now;
  if (endTime) {
    let parsed = zonedTimeToUtc(dateKeyInTz(shift.start, tz), endTime, tz);
    if (!parsed) return { error: "Check the finish time." };
    // A finish earlier in the day than the clock-in is the next morning.
    if (parsed <= shift.clockInAt) parsed = addDaysInTz(parsed, 1, tz);
    if (parsed > now) return { error: "That finish time is in the future." };
    clockOutAt = parsed;
  }
  if (clockOutAt <= shift.clockInAt) {
    return { error: "The finish time must be after they clocked in." };
  }

  await prisma.shiftPause.updateMany({
    where: { shiftId: shift.id, endAt: null },
    data: { endAt: clockOutAt },
  });
  await prisma.transport.updateMany({
    where: { shiftId: shift.id, endAt: null },
    data: { endAt: clockOutAt },
  });
  for (const t of shift.transports) {
    try {
      await finaliseTripKm(t.id);
    } catch {
      /* the mileage repair catches anything missed here */
    }
  }

  await prisma.shift.update({
    where: { id: shift.id },
    data: {
      status: "COMPLETED",
      clockOutAt,
      clockOutByOffice: session.name,
      // No position: the worker didn't press anything.
      clockOutLat: null,
      clockOutLng: null,
      overrunAlertedAt: now,
    },
  });

  revalidatePath("/live");
  revalidatePath("/timesheets");
  revalidatePath("/dashboard");
  return { ok: true, worker: shift.staff?.firstName ?? "They" };
}
