"use server";

import { revalidatePath } from "next/cache";
import { requireScope } from "@/lib/tenant";
import { opsWhere } from "@/lib/scope";
import { prisma } from "@/lib/prisma";
import { isManager, isAdmin } from "@/lib/roles";
import { notifyUser } from "@/lib/notify";
import { tzForState, zonedTimeToUtc } from "@/lib/timezone";
import { DUTY_KINDS, type DutyKind } from "@/lib/duties";

/**
 * Meetings, supervisions and training.
 *
 * The office schedules one and asks workers to it; each worker accepts or
 * declines from their own app; after it has happened the office confirms who
 * was there, and only then is it paid. Same shape as a shift and a timesheet,
 * so nobody has to learn a second set of rules.
 */

/** One day, two wall-clock times, in the branch's own zone. */
function windowIn(
  dateKey: string,
  startHm: string,
  endHm: string,
  tz: string,
): { start: Date; end: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  if (!/^\d{2}:\d{2}$/.test(startHm) || !/^\d{2}:\d{2}$/.test(endHm)) return null;
  const start = zonedTimeToUtc(dateKey, startHm, tz);
  let end = zonedTimeToUtc(dateKey, endHm, tz);
  if (!start || !end) return null;
  // An end before the start means it runs past midnight.
  if (end <= start) end = new Date(end.getTime() + 24 * 3600_000);
  return { start, end };
}

export async function createDuty(formData: FormData) {
  const { tenant, scope, session } = await requireScope();
  if (!isManager(session.role)) {
    return { error: "You don't have permission to schedule these." };
  }

  const title = String(formData.get("title") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "MEETING");
  const kind: DutyKind = (DUTY_KINDS as readonly string[]).includes(kindRaw)
    ? (kindRaw as DutyKind)
    : "MEETING";
  const date = String(formData.get("date") ?? "");
  const startHm = String(formData.get("start") ?? "");
  const endHm = String(formData.get("end") ?? "");
  const location = String(formData.get("location") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const branchId = String(formData.get("branchId") ?? "") || null;
  const staffIds = formData.getAll("staffIds").map(String).filter(Boolean);

  if (!title) return { error: "Give it a title." };
  if (staffIds.length === 0) return { error: "Choose at least one worker." };

  // A branch manager schedules inside their own branch only.
  if (!scope.all && branchId && !scope.ops.includes(branchId)) {
    return { error: "That branch is not yours." };
  }

  const branch = branchId
    ? await prisma.branch.findFirst({
        where: { id: branchId, tenantId: tenant.id },
        select: { state: true },
      })
    : null;
  const when = windowIn(date, startHm, endHm, tzForState(branch?.state ?? null));
  if (!when) return { error: "Check the date and times." };

  // Only workers this account can see, and only active ones.
  const staff = await prisma.staff.findMany({
    where: { id: { in: staffIds }, tenantId: tenant.id, active: true, ...opsWhere(scope) },
    select: { id: true, user: { select: { id: true } } },
  });
  if (staff.length === 0) return { error: "Those workers are not available." };

  const duty = await prisma.duty.create({
    data: {
      tenantId: tenant.id,
      branchId,
      title,
      kind,
      start: when.start,
      end: when.end,
      location: location || null,
      notes: notes || null,
      createdById: session.id,
      createdByName: session.name,
      attendees: {
        create: staff.map((s) => ({ tenantId: tenant.id, staffId: s.id })),
      },
    },
  });

  // The invitation is what they act on, so it goes to their phone.
  await Promise.all(
    staff
      .filter((s) => s.user)
      .map((s) =>
        notifyUser(s.user!.id, {
          tenantId: tenant.id,
          type: "SHIFT_OFFER",
          title: `${title} - please accept`,
          body: "Open the app to accept or decline.",
          url: "/my-shifts/pending",
        }).catch(() => {}),
      ),
  );

  revalidatePath("/schedule");
  revalidatePath("/my-shifts");
  return { ok: true, id: duty.id, invited: staff.length };
}

/**
 * Change a scheduled duty, including who has to be there.
 *
 * Two rules worth knowing. Moving the time clears everyone's answer back to
 * "invited": a yes to Wednesday 6pm is not a yes to Thursday 8am, and the
 * office needs to know who can still make it. And a person whose attendance
 * is already approved for pay cannot be taken off - that would quietly
 * remove a line from a pay run.
 */
export async function updateDuty(formData: FormData) {
  const { tenant, scope, session } = await requireScope();
  if (!isManager(session.role)) {
    return { error: "You don't have permission to change these." };
  }

  const dutyId = String(formData.get("dutyId") ?? "");
  const duty = await prisma.duty.findFirst({
    where: { id: dutyId, tenantId: tenant.id },
    include: { branch: { select: { state: true } }, attendees: true },
  });
  if (!duty) return { error: "That is no longer there." };

  const title = String(formData.get("title") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? duty.kind);
  const kind: DutyKind = (DUTY_KINDS as readonly string[]).includes(kindRaw)
    ? (kindRaw as DutyKind)
    : "MEETING";
  const date = String(formData.get("date") ?? "");
  const startHm = String(formData.get("start") ?? "");
  const endHm = String(formData.get("end") ?? "");
  const location = String(formData.get("location") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const staffIds = formData.getAll("staffIds").map(String).filter(Boolean);

  if (!title) return { error: "Give it a title." };
  if (staffIds.length === 0) return { error: "Choose at least one worker." };

  const tz = tzForState(duty.branch?.state ?? null);
  const when = windowIn(date, startHm, endHm, tz);
  if (!when) return { error: "Check the date and times." };

  const moved =
    when.start.getTime() !== duty.start.getTime() ||
    when.end.getTime() !== duty.end.getTime();

  const keep = new Set(staffIds);
  const removing = duty.attendees.filter((a) => !keep.has(a.staffId));
  const blocked = removing.filter((a) => a.approval === "APPROVED");
  if (blocked.length > 0) {
    return {
      error:
        "Someone you are removing is already approved for pay. Un-approve their attendance first.",
    };
  }

  const existing = new Set(duty.attendees.map((a) => a.staffId));
  const adding = await prisma.staff.findMany({
    where: {
      id: { in: staffIds.filter((id) => !existing.has(id)) },
      tenantId: tenant.id,
      active: true,
      ...opsWhere(scope),
    },
    select: { id: true, user: { select: { id: true } } },
  });

  await prisma.$transaction([
    prisma.duty.update({
      where: { id: duty.id },
      data: {
        title,
        kind,
        start: when.start,
        end: when.end,
        location: location || null,
        notes: notes || null,
      },
    }),
    ...(removing.length
      ? [prisma.dutyAttendee.deleteMany({ where: { id: { in: removing.map((a) => a.id) } } })]
      : []),
    ...adding.map((s2) =>
      prisma.dutyAttendee.create({
        data: { tenantId: tenant.id, dutyId: duty.id, staffId: s2.id },
      }),
    ),
    // A moved meeting needs answering again.
    ...(moved
      ? [
          prisma.dutyAttendee.updateMany({
            where: { dutyId: duty.id, approval: { not: "APPROVED" } },
            data: { status: "INVITED", respondedAt: null, declineReason: null },
          }),
        ]
      : []),
  ]);

  // Tell everyone who now has something to answer.
  const toTell = await prisma.dutyAttendee.findMany({
    where: { dutyId: duty.id, status: "INVITED" },
    select: { staff: { select: { user: { select: { id: true } } } } },
  });
  await Promise.all(
    toTell
      .map((a) => a.staff.user?.id)
      .filter((id): id is string => !!id)
      .map((id) =>
        notifyUser(id, {
          tenantId: tenant.id,
          type: "SHIFT_OFFER",
          title: moved ? `${title} has moved - please accept again` : `${title} - please accept`,
          body: "Open the app to accept or decline.",
          url: "/my-shifts/pending",
        }).catch(() => {}),
      ),
  );

  revalidatePath("/schedule");
  revalidatePath("/my-shifts");
  return { ok: true, moved, added: adding.length, removed: removing.length };
}

/** The worker's own answer. */
export async function respondToDuty(formData: FormData) {
  const { tenant, session } = await requireScope();
  if (!session.staffId) return { error: "Only a support worker can answer this." };

  const dutyId = String(formData.get("dutyId") ?? "");
  const accept = String(formData.get("answer") ?? "") === "ACCEPT";
  const reason = String(formData.get("reason") ?? "").trim();

  const row = await prisma.dutyAttendee.findFirst({
    where: { dutyId, staffId: session.staffId, tenantId: tenant.id },
    include: { duty: { select: { title: true, createdById: true } } },
  });
  if (!row) return { error: "That is no longer on your list." };

  await prisma.dutyAttendee.update({
    where: { id: row.id },
    data: {
      status: accept ? "ACCEPTED" : "DECLINED",
      respondedAt: new Date(),
      declineReason: accept ? null : reason || null,
    },
  });

  // The office needs to know about a decline; an acceptance is visible on the
  // schedule without interrupting anyone.
  if (!accept) {
    notifyUser(row.duty.createdById, {
      tenantId: tenant.id,
      type: "SHIFT_REJECTED",
      title: `${session.name} declined ${row.duty.title}`,
      body: reason || "No reason given.",
      url: "/schedule",
    }).catch(() => {});
  }

  revalidatePath("/my-shifts");
  revalidatePath("/my-shifts/pending");
  revalidatePath("/schedule");
  return { ok: true };
}

/** The office confirming who was actually there. Nothing is paid before this. */
export async function setDutyAttendance(formData: FormData) {
  const { tenant, scope, session } = await requireScope();
  if (!isManager(session.role)) {
    return { error: "You don't have permission to approve these." };
  }

  const attendeeId = String(formData.get("attendeeId") ?? "");
  const approval = String(formData.get("approval") ?? "");
  if (!["APPROVED", "REJECTED", "PENDING"].includes(approval)) {
    return { error: "Unknown answer." };
  }
  const hoursRaw = String(formData.get("hours") ?? "").trim();
  const hours = hoursRaw ? Number(hoursRaw) : null;
  if (hours != null && (!Number.isFinite(hours) || hours < 0 || hours > 24)) {
    return { error: "Check the hours." };
  }

  const row = await prisma.dutyAttendee.findFirst({
    where: { id: attendeeId, tenantId: tenant.id, staff: { ...opsWhere(scope) } },
  });
  if (!row) return { error: "That is no longer there." };

  await prisma.dutyAttendee.update({
    where: { id: row.id },
    data: {
      approval,
      approvedBy: approval === "PENDING" ? null : session.name,
      approvedAt: approval === "PENDING" ? null : new Date(),
      hours: hours && hours > 0 ? hours : null,
    },
  });

  revalidatePath("/schedule");
  revalidatePath("/payroll");
  return { ok: true };
}

/** Call it off. Only an admin, and it takes the invitations with it. */
export async function deleteDuty(formData: FormData) {
  const { tenant, session } = await requireScope();
  if (!isAdmin(session.role)) {
    return { error: "Only an admin can delete these." };
  }
  const dutyId = String(formData.get("dutyId") ?? "");
  const duty = await prisma.duty.findFirst({
    where: { id: dutyId, tenantId: tenant.id },
    include: {
      attendees: {
        where: { approval: "APPROVED" },
        select: { id: true },
      },
    },
  });
  if (!duty) return { error: "That is no longer there." };
  if (duty.attendees.length > 0) {
    return {
      error: "Some attendance is already approved for pay. Un-approve it first.",
    };
  }

  await prisma.duty.delete({ where: { id: duty.id } });
  revalidatePath("/schedule");
  revalidatePath("/my-shifts");
  return { ok: true };
}
