import "server-only";
import { prisma } from "./prisma";
import { zonedParts, tzForState } from "./timezone";

/**
 * Shift tasks: the checklist a worker ticks off on a visit.
 *
 * Admin defines TaskTemplates against a participant (every shift, certain
 * weekdays, or a one-off). Those are materialised into ShiftTask rows on the
 * shift itself, so the record of what was asked for on a completed shift can
 * never be rewritten by editing the template afterwards.
 */

/** Does this template apply to a shift starting at `start` in `tz`? */
export function templateApplies(
  template: { recurrence: string; days: number[] },
  start: Date,
  tz: string,
): boolean {
  if (template.recurrence === "EVERY") return true;
  if (template.recurrence === "DAYS") {
    const { weekday } = zonedParts(start, tz); // 0 = Sunday
    return template.days.includes(weekday);
  }
  // ONCE templates are attached deliberately, never auto-applied.
  return false;
}

/**
 * Make sure a shift carries the tasks its participant's templates call for.
 *
 * Idempotent: a template already represented on the shift is left alone, so
 * this is safe to call whenever a shift or a template changes. Tasks the
 * worker has already ticked are never touched.
 */
export async function syncShiftTasks(shiftId: string): Promise<number> {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    select: {
      id: true,
      tenantId: true,
      clientId: true,
      start: true,
      status: true,
      branch: { select: { state: true } },
      tasks: { select: { id: true, templateId: true } },
    },
  });
  if (!shift) return 0;
  // Don't retro-fit tasks onto work that's already been done.
  if (shift.status === "COMPLETED" || shift.status === "CANCELLED") return 0;

  const templates = await prisma.taskTemplate.findMany({
    where: { clientId: shift.clientId, active: true },
    orderBy: { sortOrder: "asc" },
  });

  const tz = tzForState(shift.branch?.state);
  const already = new Set(shift.tasks.map((t) => t.templateId).filter(Boolean));

  const toCreate = templates
    .filter((t) => !already.has(t.id))
    .filter((t) => templateApplies(t, shift.start, tz))
    .map((t, i) => ({
      tenantId: shift.tenantId,
      shiftId: shift.id,
      templateId: t.id,
      title: t.title,
      notes: t.notes,
      dueTime: t.dueTime,
      reminder: t.reminder,
      reminderMinutesBefore: t.reminderMinutesBefore,
      sortOrder: t.sortOrder || i,
    }));

  if (toCreate.length === 0) return 0;
  await prisma.shiftTask.createMany({ data: toCreate });
  return toCreate.length;
}

/** Apply a template to every future shift of its participant. */
export async function syncTemplateToFutureShifts(templateId: string) {
  const template = await prisma.taskTemplate.findUnique({
    where: { id: templateId },
    select: { clientId: true },
  });
  if (!template) return;

  const shifts = await prisma.shift.findMany({
    where: {
      clientId: template.clientId,
      start: { gte: new Date() },
      status: { in: ["SCHEDULED", "IN_PROGRESS"] },
    },
    select: { id: true },
  });

  for (const s of shifts) await syncShiftTasks(s.id);
}

/**
 * Remove a template's not-yet-ticked tasks from future shifts.
 * Completed ticks stay — they're a record of work actually done.
 */
export async function removeTemplateFromFutureShifts(templateId: string) {
  await prisma.shiftTask.deleteMany({
    where: {
      templateId,
      completedAt: null,
      shift: { start: { gte: new Date() }, status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
    },
  });
}

/** The instant a timed task is due, resolved in the branch's local day. */
export function dueAtFor(
  shiftStart: Date,
  dueTime: string | null,
  tz: string,
): Date | null {
  if (!dueTime || !/^\d{1,2}:\d{2}$/.test(dueTime)) return null;
  const [h, m] = dueTime.split(":").map(Number);
  if (h > 23 || m > 59) return null;

  // Walk from the shift's own local midnight so the result lands on the
  // right calendar day regardless of the server's timezone.
  const local = zonedParts(shiftStart, tz);
  const guess = new Date(shiftStart);
  const currentMinutes = local.hour * 60 + local.minute;
  const targetMinutes = h * 60 + m;
  guess.setTime(shiftStart.getTime() + (targetMinutes - currentMinutes) * 60_000);
  return guess;
}
