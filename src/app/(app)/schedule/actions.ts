"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { syncShiftTasks, syncTemplateToFutureShifts } from "@/lib/tasks";
import { notifyWorker, notifyManagers } from "@/lib/notify";
import { isStaffUnavailable } from "@/lib/availability";

import { isAdmin, isManager as hasManagerRole } from "@/lib/roles";
function fmtWhen(d: Date) {
  return d.toLocaleString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export type CreateShiftResult =
  | { ok: true }
  | { ok: false; error: string; needsAuth?: boolean };

/** Monday 00:00 of the week containing `d`. */
function weekStart(d: Date) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = (date.getDay() + 6) % 7; // 0 = Monday
  date.setDate(date.getDate() - day);
  return date;
}

const hoursBetween = (a: Date, b: Date) =>
  (b.getTime() - a.getTime()) / 3_600_000;


/**
 * Persist the tasks entered in the New-shift dialog.
 *
 * ONCE  -> a ShiftTask on this shift only.
 * EVERY / DAYS -> a TaskTemplate on the participant, which is then applied to
 * this shift and to their future ones, so the admin never has to set the same
 * task up twice.
 */
type DialogTask = {
  title?: unknown;
  recurrence?: unknown;
  days?: unknown;
  dueTime?: unknown;
  reminder?: unknown;
  reminderMinutesBefore?: unknown;
};

async function saveDialogTasks(
  tenantId: string,
  shiftId: string,
  clientId: string,
  formData: FormData,
) {
  const raw = String(formData.get("tasksJson") ?? "");
  if (!raw) return;

  let parsed: DialogTask[];
  try {
    parsed = JSON.parse(raw);
  } catch {
    return; // malformed payload — better to save no tasks than wrong ones
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return;

  const cleanTime = (v: unknown) => {
    const t = String(v ?? "").trim();
    return /^\d{1,2}:\d{2}$/.test(t) ? t : null;
  };

  let order = 100;
  for (const item of parsed.slice(0, 20)) {
    const title = String(item.title ?? "").trim();
    if (!title) continue;

    const dueTime = cleanTime(item.dueTime);
    const reminder = item.reminder === true;
    const minutes = Math.min(
      180,
      Math.max(0, Number(item.reminderMinutesBefore) || 15),
    );
    const days = Array.isArray(item.days)
      ? item.days
          .map((d) => Number(d))
          .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      : [];
    const recurrence =
      item.recurrence === "EVERY"
        ? "EVERY"
        : item.recurrence === "DAYS" && days.length > 0
          ? "DAYS"
          : "ONCE";

    if (recurrence === "ONCE") {
      await prisma.shiftTask.create({
        data: {
          tenantId,
          shiftId,
          title,
          dueTime,
          reminder,
          reminderMinutesBefore: minutes,
          sortOrder: order++,
        },
      });
      continue;
    }

    const template = await prisma.taskTemplate.create({
      data: {
        tenantId,
        clientId,
        title,
        recurrence,
        days: recurrence === "DAYS" ? days : [],
        dueTime,
        reminder,
        reminderMinutesBefore: minutes,
        sortOrder: order++,
      },
    });
    // Land it on this shift now, and on the participant's future shifts.
    await syncTemplateToFutureShifts(template.id);
  }
}

export async function createShift(
  formData: FormData,
): Promise<CreateShiftResult> {
  const { tenant, session } = await requireTenant();
  const clientId = String(formData.get("clientId") ?? "");
  const date = String(formData.get("date") ?? "");
  const startTime = String(formData.get("startTime") ?? "");
  const endTime = String(formData.get("endTime") ?? "");
  if (!clientId || !date || !startTime || !endTime)
    return { ok: false, error: "Please complete all fields." };

  const staffId = String(formData.get("staffId") ?? "") || null;
  const start = new Date(`${date}T${startTime}`);
  const end = new Date(`${date}T${endTime}`);
  if (end <= start)
    return { ok: false, error: "End time must be after start time." };

  const client = await prisma.client.findFirst({
    where: { id: clientId, tenantId: tenant.id },
  });
  if (!client) return { ok: false, error: "Participant not found." };

  // Don't roster a worker during their approved time off.
  if (staffId && (await isStaffUnavailable(tenant.id, staffId, start, end))) {
    const worker = await prisma.staff.findUnique({ where: { id: staffId } });
    return {
      ok: false,
      error: `${worker ? worker.firstName + " " + worker.lastName : "This worker"} has approved time off then — they're not available for this shift.`,
    };
  }

  const newHours = hoursBetween(start, end);

  // --- Agreed-hours guard ---------------------------------------------------
  // If the participant has agreed weekly hours, the week's rostered total may
  // not exceed it unless a manager (ADMIN/COORDINATOR) authorises the overrun.
  let overAgreement = false;
  let authorisedBy: string | null = null;

  if (client.weeklyHours != null) {
    const ws = weekStart(start);
    const we = new Date(ws);
    we.setDate(we.getDate() + 7);

    const existing = await prisma.shift.findMany({
      where: {
        tenantId: tenant.id,
        clientId,
        start: { gte: ws, lt: we },
        status: { not: "CANCELLED" },
      },
      select: { start: true, end: true },
    });
    const used = existing.reduce(
      (sum, s) => sum + hoursBetween(s.start, s.end),
      0,
    );

    if (used + newHours > client.weeklyHours + 1e-6) {
      const isManager =
        session.role === "ADMIN" ||
        session.role === "SUPER_ADMIN" ||
        session.role === "COORDINATOR";
      const wantsOverride = String(formData.get("authorise") ?? "") === "on";

      if (!wantsOverride) {
        const remaining = Math.max(0, client.weeklyHours - used);
        return {
          ok: false,
          needsAuth: true,
          error: `This ${newHours.toFixed(1)}h shift exceeds ${client.firstName}'s agreed ${client.weeklyHours}h/week (${remaining.toFixed(1)}h remaining). A manager must authorise the extra hours.`,
        };
      }
      if (!isManager) {
        return {
          ok: false,
          needsAuth: true,
          error:
            "Only a manager (Admin or Coordinator) can authorise hours beyond the agreed plan.",
        };
      }
      overAgreement = true;
      authorisedBy = session.name;
    }
  }

  // File the shift under the selected branch, falling back to the
  // participant's home branch.
  const branchId =
    String(formData.get("branchId") ?? "") || client.branchId || null;

  const created = await prisma.shift.create({
    data: {
      tenantId: tenant.id,
      clientId,
      staffId,
      branchId,
      start,
      end,
      address: client.address ?? null,
      overAgreement,
      authorisedBy,
    },
  });

  // Pull in whatever tasks this participant's templates call for.
  await syncShiftTasks(created.id);

  // Tasks typed into the dialog. A one-off lives on this shift alone; a
  // repeating one is saved against the participant so it also lands on their
  // future shifts.
  await saveDialogTasks(tenant.id, created.id, clientId, formData);

  revalidatePath("/schedule");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Move a shift to a different staff member and/or day (drag-and-drop). */
export async function reassignShift(formData: FormData) {
  const { tenant } = await requireTenant();
  const shiftId = String(formData.get("shiftId") ?? "");
  const date = String(formData.get("date") ?? ""); // YYYY-MM-DD of the target day
  // staffId: "" means drop onto the Unassigned row.
  const rawStaff = formData.get("staffId");
  const staffId = rawStaff === null ? undefined : String(rawStaff) || null;
  // clientId is only sent from the "by participant" view (row = participant).
  const rawClient = formData.get("clientId");
  const newClientId =
    rawClient === null ? undefined : String(rawClient) || undefined;

  const shift = await prisma.shift.findFirst({
    where: { id: shiftId, tenantId: tenant.id },
    include: { client: true },
  });
  if (!shift) return;

  const data: {
    staffId?: string | null;
    clientId?: string;
    address?: string | null;
    branchId?: string | null;
    start?: Date;
    end?: Date;
    publishState?: string;
    rejectionReason?: string | null;
    publishedAt?: Date | null;
    respondedAt?: Date | null;
  } = {};
  if (staffId !== undefined) {
    data.staffId = staffId;
    // Keep the shift on the branch of whoever it's assigned to.
    if (staffId) {
      const st = await prisma.staff.findFirst({
        where: { id: staffId, tenantId: tenant.id },
        select: { branchId: true },
      });
      if (st?.branchId) data.branchId = st.branchId;
    }

    // Reassigning to a different worker cancels the prior worker's offer and
    // resets the shift to draft so the admin re-publishes to the new worker.
    if (staffId !== shift.staffId) {
      if (shift.staffId && shift.publishState !== "DRAFT") {
        await notifyWorker(shift.staffId, {
          tenantId: tenant.id,
          type: "SHIFT_REASSIGNED",
          title: "Shift reassigned",
          body: `Your shift with ${shift.client.firstName} ${shift.client.lastName} on ${fmtWhen(shift.start)} was reassigned.`,
          shiftId: shift.id,
        });
      }
      data.publishState = "DRAFT";
      data.rejectionReason = null;
      data.publishedAt = null;
      data.respondedAt = null;
    }
  }

  // Dropping onto a different participant row moves the shift to that client
  // (and follows their address for geofenced clock-in).
  if (newClientId && newClientId !== shift.clientId) {
    const target = await prisma.client.findFirst({
      where: { id: newClientId, tenantId: tenant.id },
    });
    if (target) {
      data.clientId = target.id;
      data.address = target.address ?? null;
    }
  }

  // Keep the same time-of-day, just move to the new date.
  if (date) {
    const move = (d: Date) => {
      const target = new Date(`${date}T00:00:00`);
      target.setHours(d.getHours(), d.getMinutes(), 0, 0);
      return target;
    };
    data.start = move(shift.start);
    data.end = move(shift.end);
  }

  // Don't drop a shift onto a worker during their approved time off — the board
  // snaps back on the next render.
  const effStaff = data.staffId !== undefined ? data.staffId : shift.staffId;
  const effStart = data.start ?? shift.start;
  const effEnd = data.end ?? shift.end;
  if (effStaff && (await isStaffUnavailable(tenant.id, effStaff, effStart, effEnd)))
    return;

  await prisma.shift.update({ where: { id: shift.id }, data });
  revalidatePath("/schedule");
  revalidatePath("/dashboard");
}

export async function deleteShift(formData: FormData) {
  const { tenant } = await requireTenant();
  const shiftId = String(formData.get("shiftId") ?? "");
  await prisma.shift.deleteMany({ where: { id: shiftId, tenantId: tenant.id } });
  revalidatePath("/schedule");
  revalidatePath("/dashboard");
}

/** Publish assigned draft/rejected shifts to their workers (notifies each). */
export async function publishShifts(
  shiftIds: string[],
): Promise<{ published: number }> {
  const { tenant } = await requireTenant();
  if (!shiftIds?.length) return { published: 0 };

  const shifts = await prisma.shift.findMany({
    where: {
      id: { in: shiftIds },
      tenantId: tenant.id,
      staffId: { not: null },
      publishState: { in: ["DRAFT", "REJECTED"] },
    },
    include: { client: true },
  });

  const now = new Date();
  for (const s of shifts) {
    await prisma.shift.update({
      where: { id: s.id },
      data: {
        publishState: "PUBLISHED",
        publishedAt: now,
        rejectionReason: null,
        respondedAt: null,
      },
    });
    if (s.staffId) {
      await notifyWorker(s.staffId, {
        tenantId: tenant.id,
        type: "SHIFT_PUBLISHED",
        title: "New shift offered",
        body: `${s.client.firstName} ${s.client.lastName} · ${fmtWhen(s.start)}`,
        shiftId: s.id,
      });
    }
  }

  revalidatePath("/schedule");
  return { published: shifts.length };
}

/** Create a new branch schedule (admin-only). Returns its id so the client
 *  can jump straight to that branch's calendar. */
export async function addScheduleBranch(
  name: string,
): Promise<{ id: string } | { error: string }> {
  const { tenant, session } = await requireTenant();
  if (!isAdmin(session.role))
    return { error: "Only admins can add a schedule." };
  const clean = name.trim();
  if (!clean) return { error: "Please enter a name." };
  const branch = await prisma.branch.create({
    data: { tenantId: tenant.id, name: clean },
  });
  revalidatePath("/schedule");
  revalidatePath("/settings");
  return { id: branch.id };
}

/** Rename a branch schedule (admin-only). */
export async function renameScheduleBranch(formData: FormData) {
  const { tenant, session } = await requireTenant();
  if (!isAdmin(session.role)) return;
  const id = String(formData.get("branchId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;
  await prisma.branch.updateMany({
    where: { id, tenantId: tenant.id },
    data: { name },
  });
  revalidatePath("/schedule");
  revalidatePath("/settings");
}

/** Delete a branch schedule and its shifts (admin-only). */
export async function deleteScheduleBranch(formData: FormData) {
  const { tenant, session } = await requireTenant();
  if (!isAdmin(session.role)) return;
  const id = String(formData.get("branchId") ?? "");
  if (!id) return;
  // Remove the branch's shifts, then the branch itself.
  await prisma.shift.deleteMany({ where: { tenantId: tenant.id, branchId: id } });
  await prisma.branch.deleteMany({ where: { id, tenantId: tenant.id } });
  revalidatePath("/schedule");
  revalidatePath("/settings");
}

/** Edit a single shift's start/end time (same day). */
export async function updateShiftTime(formData: FormData) {
  const { tenant } = await requireTenant();
  const shiftId = String(formData.get("shiftId") ?? "");
  const startTime = String(formData.get("startTime") ?? "");
  const endTime = String(formData.get("endTime") ?? "");
  if (!shiftId || !startTime || !endTime) return;

  const shift = await prisma.shift.findFirst({
    where: { id: shiftId, tenantId: tenant.id },
  });
  if (!shift) return;

  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const start = new Date(`${iso(shift.start)}T${startTime}`);
  const end = new Date(`${iso(shift.start)}T${endTime}`);
  if (end <= start) return;

  await prisma.shift.update({
    where: { id: shift.id },
    data: { start, end },
  });
  revalidatePath("/schedule");
  revalidatePath("/dashboard");
}

/** Publish a single assigned shift to its worker (notifies them). */
export async function publishOneShift(formData: FormData) {
  const { tenant } = await requireTenant();
  const shiftId = String(formData.get("shiftId") ?? "");
  const shift = await prisma.shift.findFirst({
    where: { id: shiftId, tenantId: tenant.id, staffId: { not: null } },
    include: { client: true },
  });
  if (!shift) return;

  await prisma.shift.update({
    where: { id: shift.id },
    data: {
      publishState: "PUBLISHED",
      publishedAt: new Date(),
      rejectionReason: null,
      respondedAt: null,
    },
  });
  if (shift.staffId) {
    await notifyWorker(shift.staffId, {
      tenantId: tenant.id,
      type: "SHIFT_PUBLISHED",
      title: "New shift offered",
      body: `${shift.client.firstName} ${shift.client.lastName} · ${fmtWhen(shift.start)}`,
      shiftId: shift.id,
    });
  }
  revalidatePath("/schedule");
  revalidatePath("/dashboard");
}

/** Pull a published/accepted shift back to draft (unpublish). */
export async function unpublishShift(formData: FormData) {
  const { tenant } = await requireTenant();
  const shiftId = String(formData.get("shiftId") ?? "");
  const shift = await prisma.shift.findFirst({
    where: { id: shiftId, tenantId: tenant.id },
    include: { client: true },
  });
  if (!shift || shift.status === "COMPLETED") return;

  // Let the worker know the offer was withdrawn.
  if (shift.staffId && shift.publishState !== "DRAFT") {
    await notifyWorker(shift.staffId, {
      tenantId: tenant.id,
      type: "SHIFT_REASSIGNED",
      title: "Shift withdrawn",
      body: `${shift.client.firstName} ${shift.client.lastName} · ${fmtWhen(shift.start)} was pulled back by the office.`,
      shiftId: shift.id,
    });
  }
  await prisma.shift.update({
    where: { id: shift.id },
    data: {
      publishState: "DRAFT",
      publishedAt: null,
      respondedAt: null,
      rejectionReason: null,
    },
  });
  revalidatePath("/schedule");
  revalidatePath("/dashboard");
}

/**
 * Copy a week's roster forward one week (as drafts). Optionally limit to one
 * participant. Skips any target slot that already has a matching shift so it's
 * safe to re-run. Copied shifts keep the worker + times, reset to DRAFT.
 */
export async function copyWeek(formData: FormData) {
  const { tenant } = await requireTenant();
  const sourceWeek = String(formData.get("sourceWeek") ?? ""); // Monday YYYY-MM-DD
  const clientId = String(formData.get("clientId") ?? "") || null;
  if (!sourceWeek) return;

  const srcStart = new Date(`${sourceWeek}T00:00:00`);
  const srcEnd = new Date(srcStart);
  srcEnd.setDate(srcEnd.getDate() + 7);

  const source = await prisma.shift.findMany({
    where: {
      tenantId: tenant.id,
      start: { gte: srcStart, lt: srcEnd },
      ...(clientId ? { clientId } : {}),
    },
  });
  if (source.length === 0) return;

  const shift7 = (d: Date) => {
    const x = new Date(d);
    x.setDate(x.getDate() + 7);
    return x;
  };

  let copied = 0;
  for (const s of source) {
    const start = shift7(s.start);
    const end = shift7(s.end);
    // De-dupe: same client, staff, start already there?
    const exists = await prisma.shift.findFirst({
      where: {
        tenantId: tenant.id,
        clientId: s.clientId,
        staffId: s.staffId,
        start,
      },
    });
    if (exists) continue;
    const newShift = await prisma.shift.create({
      data: {
        tenantId: tenant.id,
        clientId: s.clientId,
        staffId: s.staffId,
        branchId: s.branchId,
        start,
        end,
        address: s.address,
        priceItemId: s.priceItemId,
        mileageKm: s.mileageKm,
        publishState: "DRAFT",
        status: "SCHEDULED",
      },
    });
    await syncShiftTasks(newShift.id);
    copied++;
  }
  revalidatePath("/schedule");
  revalidatePath("/dashboard");
}

/**
 * Add a task to an existing shift.
 *
 * Same choices as the New-shift dialog: this shift only, every shift, or
 * certain weekdays — the repeating ones become a template on the participant.
 */
export async function addShiftTask(formData: FormData) {
  const { tenant, session } = await requireTenant();
  if (!hasManagerRole(session.role)) return;

  const shiftId = String(formData.get("shiftId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!shiftId || !title) return;

  const shift = await prisma.shift.findFirst({
    where: { id: shiftId, tenantId: tenant.id },
    select: { id: true, clientId: true },
  });
  if (!shift) return;

  const rawTime = String(formData.get("dueTime") ?? "").trim();
  const dueTime = /^\d{1,2}:\d{2}$/.test(rawTime) ? rawTime : null;
  const reminder = String(formData.get("reminder") ?? "") === "on";
  const minutes = Math.min(
    180,
    Math.max(0, Number(formData.get("reminderMinutesBefore")) || 15),
  );
  const days = formData
    .getAll("days")
    .map((d) => Number(d))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);

  const raw = String(formData.get("recurrence") ?? "ONCE");
  const recurrence =
    raw === "EVERY" ? "EVERY" : raw === "DAYS" && days.length > 0 ? "DAYS" : "ONCE";

  const count = await prisma.shiftTask.count({ where: { shiftId } });

  if (recurrence === "ONCE") {
    await prisma.shiftTask.create({
      data: {
        tenantId: tenant.id,
        shiftId,
        title,
        dueTime,
        reminder,
        reminderMinutesBefore: minutes,
        sortOrder: 100 + count,
      },
    });
  } else {
    const template = await prisma.taskTemplate.create({
      data: {
        tenantId: tenant.id,
        clientId: shift.clientId,
        title,
        recurrence,
        days: recurrence === "DAYS" ? days : [],
        dueTime,
        reminder,
        reminderMinutesBefore: minutes,
        sortOrder: 100 + count,
      },
    });
    await syncTemplateToFutureShifts(template.id);
  }

  revalidatePath("/schedule");
}

/**
 * Remove a task from a shift.
 *
 * Refuses once it's been ticked — that's a record of work done, and deleting
 * it would quietly rewrite what happened on the visit.
 */
export async function removeShiftTask(formData: FormData) {
  const { tenant, session } = await requireTenant();
  if (!hasManagerRole(session.role)) return;

  const id = String(formData.get("id") ?? "");
  const task = await prisma.shiftTask.findFirst({
    where: { id, tenantId: tenant.id },
    select: { id: true, completedAt: true },
  });
  if (!task || task.completedAt) return;

  await prisma.shiftTask.delete({ where: { id: task.id } });
  revalidatePath("/schedule");
}
