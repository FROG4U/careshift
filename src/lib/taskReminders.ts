import "server-only";
import { prisma } from "./prisma";
import { tzForState, fmtInTz } from "./timezone";
import { dueAtFor } from "./tasks";
import { sendPushToUsers } from "./push";

/**
 * Task reminders.
 *
 * Two kinds, both only for tasks whose template has reminders switched on:
 *   - at the start of a shift, one nudge listing the outstanding tasks
 *   - before a timed task ("10:00 medication"), `reminderMinutesBefore` ahead
 *
 * Each is fired at most once — `Shift.tasksRemindedAt` and
 * `ShiftTask.reminderSentAt` are stamped when sent — so running this every
 * few minutes from cron is safe.
 */

export type ReminderRun = {
  startNudges: number;
  taskReminders: number;
  checked: number;
};

export async function runTaskReminders(now = new Date()): Promise<ReminderRun> {
  const run: ReminderRun = { startNudges: 0, taskReminders: 0, checked: 0 };

  // Shifts in play: started within the last 12h or starting in the next 2h.
  const shifts = await prisma.shift.findMany({
    where: {
      status: { in: ["SCHEDULED", "IN_PROGRESS"] },
      staffId: { not: null },
      start: {
        gte: new Date(now.getTime() - 12 * 3_600_000),
        lte: new Date(now.getTime() + 2 * 3_600_000),
      },
      tasks: { some: { reminder: true, completedAt: null } },
    },
    include: {
      client: { select: { firstName: true, lastName: true } },
      branch: { select: { state: true } },
      staff: { select: { id: true } },
      tasks: true,
    },
  });

  run.checked = shifts.length;
  if (shifts.length === 0) return run;

  // Map staff -> login, so we can push to the right device.
  const staffIds = shifts.map((s) => s.staffId!).filter(Boolean);
  const users = await prisma.user.findMany({
    where: { staffId: { in: staffIds } },
    select: { id: true, staffId: true },
  });
  const userIdFor = new Map(users.map((u) => [u.staffId!, u.id]));

  for (const shift of shifts) {
    const userId = userIdFor.get(shift.staffId!);
    if (!userId) continue;

    const tz = tzForState(shift.branch?.state);
    const who = `${shift.client.firstName} ${shift.client.lastName}`;
    const pending = shift.tasks.filter((t) => !t.completedAt && t.reminder);

    // ── 1. Shift-start nudge ──
    const startDue = shift.start <= now;
    if (startDue && !shift.tasksRemindedAt && pending.length > 0) {
      await sendPushToUsers([userId], {
        title: `${pending.length} task${pending.length === 1 ? "" : "s"} this shift`,
        body: `${who}: ${pending.map((t) => t.title).slice(0, 3).join(", ")}${
          pending.length > 3 ? "…" : ""
        }`,
        url: `/my-shifts/shift/${shift.id}`,
        tag: `tasks-${shift.id}`,
      });
      await prisma.shift.update({
        where: { id: shift.id },
        data: { tasksRemindedAt: now },
      });
      run.startNudges++;
    }

    // ── 2. Ahead of each timed task ──
    for (const task of pending) {
      if (task.reminderSentAt) continue;
      const dueAt = dueAtFor(shift.start, task.dueTime, tz);
      if (!dueAt) continue; // untimed — covered by the start nudge

      const fireAt = new Date(
        dueAt.getTime() - task.reminderMinutesBefore * 60_000,
      );
      // Fire once we're past the moment, but not for long-gone tasks.
      if (now < fireAt) continue;
      if (now.getTime() - dueAt.getTime() > 2 * 3_600_000) continue;

      await sendPushToUsers([userId], {
        title: `Task due ${fmtInTz(dueAt, tz, { hour: "numeric", minute: "2-digit" })}`,
        body: `${task.title} — ${who}`,
        url: `/my-shifts/shift/${shift.id}`,
        tag: `task-${task.id}`,
      });
      await prisma.shiftTask.update({
        where: { id: task.id },
        data: { reminderSentAt: now },
      });
      run.taskReminders++;
    }
  }

  return run;
}
