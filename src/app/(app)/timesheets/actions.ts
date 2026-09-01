"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { isManager } from "@/lib/roles";
import { tzForState, zonedTimeToUtc } from "@/lib/timezone";

export async function setApproval(formData: FormData) {
  const { tenant } = await requireTenant();
  const shiftId = String(formData.get("shiftId") ?? "");
  const approval = String(formData.get("approval") ?? "");
  if (!["APPROVED", "REJECTED", "PENDING"].includes(approval)) return;

  await prisma.shift.updateMany({
    where: { id: shiftId, tenantId: tenant.id },
    data: { approval },
  });

  revalidatePath("/timesheets");
  revalidatePath("/dashboard");
}

/** Admin edits a shift's clocked times, notes and per-trip mileage. */
export async function updateShiftDetail(formData: FormData) {
  const { tenant } = await requireTenant();
  const shiftId = String(formData.get("shiftId") ?? "");
  const shift = await prisma.shift.findFirst({
    where: { id: shiftId, tenantId: tenant.id },
    include: { transports: true },
  });
  if (!shift) return;

  // Combine the shift's date with the edited HH:MM times.
  const dayIso = new Date(shift.start).toISOString().slice(0, 10);
  const toDate = (v: FormDataEntryValue | null) => {
    const t = String(v ?? "").trim();
    return t ? new Date(`${dayIso}T${t}:00`) : null;
  };

  const clockInAt = toDate(formData.get("clockInTime"));
  const clockOutAt = toDate(formData.get("clockOutTime"));
  const note = String(formData.get("note") ?? "").trim() || null;

  await prisma.shift.update({
    where: { id: shift.id },
    data: {
      clockInAt: clockInAt ?? shift.clockInAt,
      clockOutAt: clockOutAt ?? shift.clockOutAt,
      progressNote: note,
    },
  });

  // Per-trip mileage overrides (km_<transportId>).
  for (const t of shift.transports) {
    const raw = formData.get(`km_${t.id}`);
    if (raw !== null) {
      const km = Number(String(raw));
      if (!Number.isNaN(km) && km >= 0) {
        await prisma.transport.update({ where: { id: t.id }, data: { km } });
      }
    }
  }

  revalidatePath("/timesheets");
  revalidatePath("/dashboard");
}

/**
 * Add a completed shift by hand.
 *
 * For work that happened but was never clocked: a phone that died, a shift
 * covered at short notice and never rostered. Saved as COMPLETED and PENDING
 * approval, so it joins the normal timesheet queue rather than skipping it.
 *
 * The times are read in the PARTICIPANT'S branch timezone, not the server's.
 * `new Date("2026-10-10T09:00")` resolves against whatever zone the VPS is set
 * to (Australia/Brisbane) - fine today, an hour out for a Sydney shift the
 * moment NSW goes onto daylight saving.
 *
 * Who entered it and why is stored on the shift, so a timesheet reader can
 * always tell stated time from measured time.
 */
export async function createManualShift(formData: FormData) {
  const { tenant, session } = await requireTenant();
  if (!isManager(session.role)) return { error: "Managers only." };

  const staffId = String(formData.get("staffId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");
  const date = String(formData.get("date") ?? "");
  const startTime = String(formData.get("startTime") ?? "");
  const endTime = String(formData.get("endTime") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const kmRaw = String(formData.get("mileageKm") ?? "").trim();

  if (!staffId || !clientId || !date || !startTime || !endTime) {
    return { error: "Worker, participant, date and both times are required." };
  }
  if (!note) {
    return {
      error:
        "Shift notes are required. Without them the shift can't be approved or paid, which defeats the point of adding it.",
    };
  }
  if (!reason) return { error: "Say why this is being entered by hand." };

  const [staff, client] = await Promise.all([
    prisma.staff.findFirst({
      where: { id: staffId, tenantId: tenant.id },
      select: { id: true, firstName: true, lastName: true, branchId: true },
    }),
    prisma.client.findFirst({
      where: { id: clientId, tenantId: tenant.id },
      select: { id: true, branchId: true, branch: { select: { state: true } } },
    }),
  ]);
  if (!staff) return { error: "That worker no longer exists." };
  if (!client) return { error: "That participant no longer exists." };

  const tz = tzForState(client.branch?.state ?? null);
  const start = zonedTimeToUtc(date, startTime, tz);
  const end = zonedTimeToUtc(date, endTime, tz);
  if (!start || !end) return { error: "Check the date and times." };
  if (end <= start) return { error: "The finish time must be after the start." };

  const hours = (end.getTime() - start.getTime()) / 3_600_000;
  if (hours > 24) return { error: "That's longer than 24 hours. Check the times." };

  // A shift already covering this worker and time is nearly always a mistake -
  // the roster entry they forgot to clock into, about to be double-paid.
  const clash = await prisma.shift.findFirst({
    where: {
      tenantId: tenant.id,
      staffId: staff.id,
      status: { not: "CANCELLED" },
      start: { lt: end },
      end: { gt: start },
    },
    select: { id: true, start: true, status: true },
  });
  if (clash) {
    return {
      error: `${staff.firstName} already has a shift overlapping that time. Edit that one in Timesheets instead, so the hours aren't counted twice.`,
    };
  }

  const km = kmRaw ? Number(kmRaw) : null;
  if (km != null && (!Number.isFinite(km) || km < 0)) {
    return { error: "Mileage must be a number." };
  }

  await prisma.shift.create({
    data: {
      tenantId: tenant.id,
      clientId: client.id,
      staffId: staff.id,
      branchId: client.branchId ?? staff.branchId ?? null,
      start,
      end,
      // The work is done, so it skips the publish/accept dance - but it still
      // goes through timesheet approval like any other shift.
      status: "COMPLETED",
      publishState: "ACCEPTED",
      approval: "PENDING",
      // Paid time is the overlap of clocked and rostered, so setting both to
      // the stated window pays exactly what was entered.
      clockInAt: start,
      clockOutAt: end,
      progressNote: note,
      mileageKm: km,
      manualEntryBy: session.name,
      manualEntryAt: new Date(),
      manualEntryReason: reason,
    },
  });

  revalidatePath("/timesheets");
  revalidatePath("/schedule");
  return { ok: true, worker: `${staff.firstName} ${staff.lastName}`, hours };
}
