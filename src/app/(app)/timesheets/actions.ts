"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

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
