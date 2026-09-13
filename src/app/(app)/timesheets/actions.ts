"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { isManager } from "@/lib/roles";
import {
  tzForState,
  zonedTimeToUtc,
  dateKeyInTz,
  hmInTz,
  addDaysInTz,
  fmtInTz,
} from "@/lib/timezone";
import { isDayShifted, DAY_MS } from "@/lib/dayShift";
import { repairShortTrips } from "@/lib/tripRepair";

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
    include: { transports: true, branch: { select: { state: true } } },
  });
  if (!shift) return;

  // Clock times are wall-clock times where the participant lives. This used to
  // take the shift's UTC date and parse the time in the server's zone, so any
  // shift starting before 10am Brisbane landed a day early - and saving this
  // form, even just to change the notes, zeroed that shift's paid hours.
  const tz = tzForState(shift.branch?.state ?? null);
  const dayKey = dateKeyInTz(shift.start, tz);

  // Only rewrite a clock time the admin actually changed. Round-tripping an
  // untouched value through HH:MM is how a formatting bug here silently
  // rewrote shifts nobody meant to edit.
  const edited = (field: string, current: Date | null) => {
    const t = String(formData.get(field) ?? "").trim();
    if (!/^\d{2}:\d{2}$/.test(t)) return current;
    if (current && hmInTz(current, tz) === t) return current;
    return zonedTimeToUtc(dayKey, t, tz) ?? current;
  };

  const clockInAt = edited("clockInTime", shift.clockInAt);
  let clockOutAt = edited("clockOutTime", shift.clockOutAt);
  // An overnight shift finishes the next day.
  if (
    clockOutAt !== shift.clockOutAt &&
    clockInAt &&
    clockOutAt &&
    clockOutAt <= clockInAt
  ) {
    clockOutAt = addDaysInTz(clockOutAt, 1, tz);
  }
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
      // The box shows the km to one decimal. Submitting it untouched must not
      // round the real figure, or mark a trip as corrected by hand.
      const unchanged = Math.abs(km - Number(t.km.toFixed(1))) < 0.001;
      if (!Number.isNaN(km) && km >= 0 && !unchanged) {
        await prisma.transport.update({
          where: { id: t.id },
          data: { km, kmEditedAt: new Date() },
        });
      }
    }
  }

  // Typed mileage - only used when there are no tracked trips (see kmOf).
  const typedRaw = formData.get("mileageKm");
  if (shift.transports.length === 0 && typedRaw !== null) {
    const t = String(typedRaw).trim();
    const km = t === "" ? null : Number(t);
    if (km === null || (Number.isFinite(km) && km >= 0)) {
      await prisma.shift.update({ where: { id: shift.id }, data: { mileageKm: km } });
    }
  }

  revalidatePath("/timesheets");
  revalidatePath("/payroll");
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

  // Only hours actually worked can clash. A worker can do several shifts in a
  // day; what must never happen is the same hours being paid twice. So compare
  // against clocked time (or a shift they're clocked into right now), not
  // against roster entries nobody clocked into.
  const nearby = await prisma.shift.findMany({
    where: {
      tenantId: tenant.id,
      staffId: staff.id,
      status: { not: "CANCELLED" },
      OR: [
        { clockInAt: { lt: end }, clockOutAt: { gt: start } },
        { clockInAt: { lt: end }, clockOutAt: null },
        { clockInAt: null, start: { lt: end }, end: { gt: start } },
      ],
    },
    select: {
      id: true,
      start: true,
      end: true,
      status: true,
      clockInAt: true,
      clockOutAt: true,
      clientId: true,
      client: { select: { firstName: true, lastName: true } },
    },
  });
  const now = new Date();
  const workedClash = nearby.find((s) => {
    if (!s.clockInAt) return false;
    // Still clocked in: they're working until now, or the rostered end.
    const workedTo = s.clockOutAt ?? (s.end > now ? s.end : now);
    return s.clockInAt < end && workedTo > start;
  });
  if (workedClash) {
    const t = (d: Date) => fmtInTz(d, tz, { hour: "numeric", minute: "2-digit" });
    const from = workedClash.clockInAt!;
    const to = workedClash.clockOutAt;
    return {
      error: `${staff.firstName} already worked ${t(from)} - ${to ? t(to) : "now (still clocked in)"} with ${workedClash.client.firstName} ${workedClash.client.lastName} on ${fmtInTz(from, tz, { weekday: "short", day: "numeric", month: "short" })}, which overlaps these times. Change the times, or edit that timesheet instead, so the hours aren't paid twice.`,
    };
  }

  // The rostered shift for this participant that nobody clocked into - the
  // usual reason for a manual entry. The entry takes it over; left on the
  // roster it could still be clocked into later and paid a second time.
  const roster = nearby.find(
    (s) => !s.clockInAt && s.status === "SCHEDULED" && s.clientId === client.id,
  );

  const km = kmRaw ? Number(kmRaw) : null;
  if (km != null && (!Number.isFinite(km) || km < 0)) {
    return { error: "Mileage must be a number." };
  }

  const entry = {
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
  };
  if (roster) {
    await prisma.shift.update({ where: { id: roster.id }, data: entry });
  } else {
    await prisma.shift.create({
      data: {
        ...entry,
        tenantId: tenant.id,
        clientId: client.id,
        staffId: staff.id,
        branchId: client.branchId ?? staff.branchId ?? null,
      },
    });
  }

  revalidatePath("/timesheets");
  revalidatePath("/schedule");
  return {
    ok: true,
    worker: `${staff.firstName} ${staff.lastName}`,
    hours,
    replacedRoster: Boolean(roster),
  };
}

/**
 * Move day-shifted clock times forward 24 hours. See lib/dayShift.
 *
 * Skips any shift inside a completed pay run: its paid figure is frozen, and
 * correcting the timesheet underneath it would leave the two disagreeing.
 */
export async function repairDayShiftedShifts(): Promise<{ fixed: number; skipped: number }> {
  const { tenant, session } = await requireTenant();
  if (!isManager(session.role)) return { fixed: 0, skipped: 0 };

  const [clocked, completedRuns] = await Promise.all([
    prisma.shift.findMany({
      where: { tenantId: tenant.id, clockInAt: { not: null }, clockOutAt: { not: null } },
      select: { id: true, start: true, end: true, clockInAt: true, clockOutAt: true, branchId: true },
    }),
    prisma.payrollPeriod.findMany({
      where: { tenantId: tenant.id, status: "APPROVED" },
      select: { branchId: true, startDate: true, endDate: true },
    }),
  ]);

  let fixed = 0;
  let skipped = 0;
  for (const s of clocked.filter(isDayShifted)) {
    const frozen = completedRuns.some(
      (r) =>
        (r.branchId === null || r.branchId === s.branchId) &&
        s.start >= r.startDate &&
        s.start <= r.endDate,
    );
    if (frozen) {
      skipped += 1;
      continue;
    }
    await prisma.shift.update({
      where: { id: s.id },
      data: {
        clockInAt: new Date(s.clockInAt!.getTime() + DAY_MS),
        clockOutAt: new Date(s.clockOutAt!.getTime() + DAY_MS),
      },
    });
    fixed += 1;
  }

  revalidatePath("/timesheets");
  revalidatePath("/payroll");
  return { fixed, skipped };
}

/** Recalculate trips saved shorter than their GPS trail. See lib/tripRepair. */
export async function repairTripMileage(): Promise<{
  fixed: number;
  skipped: number;
  kmAdded: number;
}> {
  const { tenant, session } = await requireTenant();
  if (!isManager(session.role)) return { fixed: 0, skipped: 0, kmAdded: 0 };
  const result = await repairShortTrips(tenant.id);
  revalidatePath("/timesheets");
  revalidatePath("/payroll");
  return result;
}
