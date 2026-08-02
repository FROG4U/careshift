"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const numOrNull = (v: FormDataEntryValue | null) => {
  const s = str(v);
  return s ? Number(s) : null;
};

/** Monday 00:00 of the week containing `d`. */
function weekStart(d: Date) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return date;
}

async function ownsClient(tenantId: string, clientId: string) {
  return prisma.client.findFirst({ where: { id: clientId, tenantId } });
}

export async function addPlanSlot(formData: FormData) {
  const { tenant } = await requireTenant();
  const clientId = str(formData.get("clientId"));
  if (!(await ownsClient(tenant.id, clientId))) return;

  const dayOfWeek = Number(str(formData.get("dayOfWeek")));
  const startTime = str(formData.get("startTime"));
  const endTime = str(formData.get("endTime"));
  if (Number.isNaN(dayOfWeek) || !startTime || !endTime) return;

  await prisma.planSlot.create({
    data: {
      tenantId: tenant.id,
      clientId,
      dayOfWeek,
      startTime,
      endTime,
      priceItemId: str(formData.get("priceItemId")) || null,
      mileageKm: numOrNull(formData.get("mileageKm")),
      notes: str(formData.get("notes")) || null,
    },
  });
  revalidatePath(`/clients/${clientId}/plan`);
}

export async function updatePlanSlot(formData: FormData) {
  const { tenant } = await requireTenant();
  const id = str(formData.get("id"));
  const clientId = str(formData.get("clientId"));
  if (!id) return;

  await prisma.planSlot.updateMany({
    where: { id, tenantId: tenant.id },
    data: {
      dayOfWeek: Number(str(formData.get("dayOfWeek"))),
      startTime: str(formData.get("startTime")),
      endTime: str(formData.get("endTime")),
      priceItemId: str(formData.get("priceItemId")) || null,
      mileageKm: numOrNull(formData.get("mileageKm")),
      notes: str(formData.get("notes")) || null,
    },
  });
  revalidatePath(`/clients/${clientId}/plan`);
}

export async function deletePlanSlot(formData: FormData) {
  const { tenant } = await requireTenant();
  const id = str(formData.get("id"));
  const clientId = str(formData.get("clientId"));
  await prisma.planSlot.deleteMany({ where: { id, tenantId: tenant.id } });
  revalidatePath(`/clients/${clientId}/plan`);
}

/**
 * Generate roster shifts for a week from the participant's weekly template.
 * `weekISO` is any date in the target week (defaults to the current week).
 * Skips slots that already have a matching shift so it's safe to re-run.
 */
export async function generateRoster(formData: FormData) {
  const { tenant } = await requireTenant();
  const clientId = str(formData.get("clientId"));
  const client = await ownsClient(tenant.id, clientId);
  if (!client) return;

  const weekISO = str(formData.get("week"));
  const base = weekISO ? new Date(`${weekISO}T00:00:00`) : new Date();
  const monday = weekStart(base);

  const slots = await prisma.planSlot.findMany({
    where: { tenantId: tenant.id, clientId },
  });
  if (slots.length === 0) return;

  for (const slot of slots) {
    const day = new Date(monday);
    day.setDate(day.getDate() + slot.dayOfWeek);
    const [sh, sm] = slot.startTime.split(":").map(Number);
    const [eh, em] = slot.endTime.split(":").map(Number);
    const start = new Date(day);
    start.setHours(sh, sm, 0, 0);
    const end = new Date(day);
    end.setHours(eh, em, 0, 0);

    // De-dupe: don't create a second identical shift for this slot/week.
    const exists = await prisma.shift.findFirst({
      where: { tenantId: tenant.id, clientId, start, end },
    });
    if (exists) continue;

    await prisma.shift.create({
      data: {
        tenantId: tenant.id,
        clientId,
        start,
        end,
        address: client.address ?? null,
        priceItemId: slot.priceItemId,
        mileageKm: slot.mileageKm,
        notes: slot.notes,
      },
    });
  }

  revalidatePath("/schedule");
  revalidatePath("/dashboard");
  revalidatePath(`/clients/${clientId}/plan`);
}
