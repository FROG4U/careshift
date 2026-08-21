"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { isManager } from "@/lib/roles";
import {
  syncTemplateToFutureShifts,
  removeTemplateFromFutureShifts,
} from "@/lib/tasks";

const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();

function parseDays(formData: FormData): number[] {
  return formData
    .getAll("days")
    .map((d) => Number(d))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

/** Valid "HH:MM" or null. */
function parseTime(raw: string): string | null {
  if (!/^\d{1,2}:\d{2}$/.test(raw)) return null;
  const [h, m] = raw.split(":").map(Number);
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export async function createTaskTemplate(formData: FormData) {
  const { tenant, session } = await requireTenant();
  if (!isManager(session.role)) return;

  const clientId = str(formData.get("clientId"));
  const title = str(formData.get("title"));
  if (!clientId || !title) return;

  const client = await prisma.client.findFirst({
    where: { id: clientId, tenantId: tenant.id },
    select: { id: true },
  });
  if (!client) return;

  const recurrenceRaw = str(formData.get("recurrence"));
  const days = parseDays(formData);
  // "Certain days" with nothing ticked would silently never fire.
  const recurrence =
    recurrenceRaw === "DAYS" && days.length > 0 ? "DAYS" : "EVERY";

  const count = await prisma.taskTemplate.count({ where: { clientId } });

  const created = await prisma.taskTemplate.create({
    data: {
      tenantId: tenant.id,
      clientId,
      title,
      notes: str(formData.get("notes")) || null,
      recurrence,
      days: recurrence === "DAYS" ? days : [],
      dueTime: parseTime(str(formData.get("dueTime"))),
      reminder: str(formData.get("reminder")) === "on",
      reminderMinutesBefore: Math.min(
        180,
        Math.max(0, Number(str(formData.get("reminderMinutesBefore"))) || 15),
      ),
      sortOrder: count,
    },
  });

  await syncTemplateToFutureShifts(created.id);

  revalidatePath(`/clients/${clientId}/tasks`);
  revalidatePath("/schedule");
}

export async function updateTaskTemplate(formData: FormData) {
  const { tenant, session } = await requireTenant();
  if (!isManager(session.role)) return;

  const id = str(formData.get("id"));
  const existing = await prisma.taskTemplate.findFirst({
    where: { id, tenantId: tenant.id },
    select: { id: true, clientId: true },
  });
  if (!existing) return;

  const title = str(formData.get("title"));
  if (!title) return;

  const recurrenceRaw = str(formData.get("recurrence"));
  const days = parseDays(formData);
  const recurrence =
    recurrenceRaw === "DAYS" && days.length > 0 ? "DAYS" : "EVERY";

  await prisma.taskTemplate.update({
    where: { id: existing.id },
    data: {
      title,
      notes: str(formData.get("notes")) || null,
      recurrence,
      days: recurrence === "DAYS" ? days : [],
      dueTime: parseTime(str(formData.get("dueTime"))),
      reminder: str(formData.get("reminder")) === "on",
      reminderMinutesBefore: Math.min(
        180,
        Math.max(0, Number(str(formData.get("reminderMinutesBefore"))) || 15),
      ),
    },
  });

  // Rebuild on future shifts so a changed schedule takes effect, without
  // disturbing anything already ticked.
  await removeTemplateFromFutureShifts(existing.id);
  await syncTemplateToFutureShifts(existing.id);

  revalidatePath(`/clients/${existing.clientId}/tasks`);
}

export async function deleteTaskTemplate(formData: FormData) {
  const { tenant, session } = await requireTenant();
  if (!isManager(session.role)) return;

  const id = str(formData.get("id"));
  const existing = await prisma.taskTemplate.findFirst({
    where: { id, tenantId: tenant.id },
    select: { id: true, clientId: true },
  });
  if (!existing) return;

  // Pull it from upcoming shifts, then retire it. Completed ticks keep their
  // record (templateId goes null via SetNull) so history stays intact.
  await removeTemplateFromFutureShifts(existing.id);
  await prisma.taskTemplate.delete({ where: { id: existing.id } });

  revalidatePath(`/clients/${existing.clientId}/tasks`);
}
