"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();

/** Allocate a support worker to a participant (admin only action). */
export async function addClientWorker(formData: FormData) {
  const { tenant } = await requireTenant();
  const clientId = str(formData.get("clientId"));
  const staffId = str(formData.get("staffId"));
  if (!clientId || !staffId) return;

  // Both must belong to this tenant.
  const [client, staff] = await Promise.all([
    prisma.client.findFirst({ where: { id: clientId, tenantId: tenant.id } }),
    prisma.staff.findFirst({ where: { id: staffId, tenantId: tenant.id } }),
  ]);
  if (!client || !staff) return;

  // Idempotent — the unique constraint would otherwise throw on double-add.
  const existing = await prisma.clientWorker.findFirst({
    where: { clientId, staffId },
  });
  if (existing) return;

  await prisma.clientWorker.create({
    data: { tenantId: tenant.id, clientId, staffId },
  });

  revalidatePath(`/clients/${clientId}/team`);
  revalidatePath("/schedule");
}

/** Remove a worker's allocation from a participant. */
export async function removeClientWorker(formData: FormData) {
  const { tenant } = await requireTenant();
  const id = str(formData.get("id"));
  const clientId = str(formData.get("clientId"));
  if (!id) return;

  await prisma.clientWorker.deleteMany({ where: { id, tenantId: tenant.id } });

  revalidatePath(`/clients/${clientId}/team`);
  revalidatePath("/schedule");
}
