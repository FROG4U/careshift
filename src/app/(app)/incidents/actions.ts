"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { isManager } from "@/lib/roles";
import { INCIDENT_STATUSES } from "@/lib/constants";
import { notifyUser } from "@/lib/notify";

/** Move an incident through the register and record the office's findings. */
export async function updateIncident(formData: FormData) {
  const { tenant, session } = await requireTenant();
  if (!isManager(session.role)) return;

  const id = String(formData.get("id") ?? "");
  const statusRaw = String(formData.get("status") ?? "");
  const reviewNotes = String(formData.get("reviewNotes") ?? "").trim();
  if (!id) return;

  const status = (INCIDENT_STATUSES as readonly string[]).includes(statusRaw)
    ? statusRaw
    : undefined;

  const existing = await prisma.incident.findFirst({
    where: { id, tenantId: tenant.id },
    select: { id: true, status: true, reportedById: true },
  });
  if (!existing) return;

  await prisma.incident.update({
    where: { id: existing.id },
    data: {
      ...(status ? { status } : {}),
      reviewNotes: reviewNotes || null,
      reviewedById: session.id,
      reviewedAt: new Date(),
    },
  });

  // Let the worker know their report was actioned.
  if (status && status !== existing.status) {
    await notifyUser(existing.reportedById, {
      tenantId: tenant.id,
      type: "INCIDENT_UPDATED",
      title:
        status === "CLOSED"
          ? "Your incident report has been closed"
          : "Your incident report is being reviewed",
      body: reviewNotes || undefined,
      url: "/my-shifts/incidents",
    });
  }

  revalidatePath("/incidents");
  revalidatePath(`/incidents/${id}`);
}
