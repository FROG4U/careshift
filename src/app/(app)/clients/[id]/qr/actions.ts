"use server";

import { revalidatePath } from "next/cache";
import { requireScope } from "@/lib/tenant";
import { opsWhere } from "@/lib/scope";
import { isManager } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { newQrToken } from "@/lib/qrClock";

/**
 * Issue a clock-in card for a participant, or replace the one they have.
 *
 * Replacing retires the old card on the spot: a code that has been thrown in
 * a bin, photographed or left in a house the participant has moved out of is
 * no longer evidence of anything, so it stops working the moment a new one is
 * issued.
 */
export async function issueQrCard(formData: FormData) {
  const { tenant, session, scope } = await requireScope();
  if (!isManager(session.role)) return { error: "Not authorised." };

  const id = String(formData.get("clientId") ?? "");
  const client = await prisma.client.findFirst({
    where: { id, tenantId: tenant.id, ...opsWhere(scope) },
    select: { id: true },
  });
  if (!client) return { error: "Participant not found." };

  await prisma.client.update({
    where: { id: client.id },
    data: { qrToken: newQrToken(), qrIssuedAt: new Date() },
  });

  revalidatePath(`/clients/${client.id}/qr`);
  revalidatePath(`/clients/${client.id}`);
  return { ok: true };
}
