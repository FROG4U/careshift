"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyManagers } from "@/lib/notify";

/**
 * Worker submits a time-off / unavailability request. Three kinds:
 *  - "range"   : a start→end date range (whole days)
 *  - "day"     : a single whole day
 *  - "daytime" : a single day with a time range (e.g. 9am–1pm)
 * All start life PENDING and need admin approval.
 */
export async function addAvailability(
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const session = await getSession();
  if (!session?.staffId) return { error: "Not signed in." };

  const kind = String(formData.get("kind") ?? "range");
  const leaveTypeRaw = String(formData.get("leaveType") ?? "ANNUAL");
  const leaveType = ["ANNUAL", "SICK", "OTHER"].includes(leaveTypeRaw)
    ? leaveTypeRaw
    : "ANNUAL";
  const startDate = String(formData.get("startDate") ?? "");
  const endDateRaw = String(formData.get("endDate") ?? "");
  const startTime = String(formData.get("startTime") ?? "") || null;
  const endTime = String(formData.get("endTime") ?? "") || null;
  const reason = String(formData.get("reason") ?? "").trim() || null;

  if (!startDate) return { error: "Please choose a date." };

  const start = new Date(`${startDate}T00:00:00`);
  let end = new Date(`${startDate}T00:00:00`);
  let allDay = true;
  let sTime: string | null = null;
  let eTime: string | null = null;

  if (kind === "range") {
    end = new Date(`${endDateRaw || startDate}T00:00:00`);
    if (end < start) return { error: "End date can't be before the start date." };
  } else if (kind === "daytime") {
    allDay = false;
    if (!startTime || !endTime)
      return { error: "Please choose a start and end time." };
    if (endTime <= startTime)
      return { error: "End time must be after the start time." };
    sTime = startTime;
    eTime = endTime;
  }

  await prisma.availability.create({
    data: {
      tenantId: session.tenantId,
      staffId: session.staffId,
      startDate: start,
      endDate: end,
      allDay,
      startTime: sTime,
      endTime: eTime,
      leaveType,
      reason,
    },
  });

  await notifyManagers({
    tenantId: session.tenantId,
    type: "AVAILABILITY",
    title: "Time-off request",
    body: `${session.name} requested time off — needs your approval.`,
  });

  revalidatePath("/my-shifts/availability");
  return { ok: true };
}

/** Worker cancels their own still-pending request. */
export async function cancelAvailability(formData: FormData) {
  const session = await getSession();
  if (!session?.staffId) return;
  const id = String(formData.get("id") ?? "");
  await prisma.availability.deleteMany({
    where: { id, staffId: session.staffId, status: "PENDING" },
  });
  revalidatePath("/my-shifts/availability");
}
