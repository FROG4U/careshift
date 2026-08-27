"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isSuperAdmin, isManager } from "@/lib/roles";
import { notifyUser } from "@/lib/notify";
import {
  recipientsFor,
  FROM_LABELS,
  AUDIENCES,
  type Audience,
} from "@/lib/broadcast";

export async function sendBroadcast(formData: FormData) {
  const { tenant } = await requireTenant();
  const session = await getSession();
  if (!session || !isManager(session.role)) {
    return { error: "You don't have permission to send announcements." };
  }

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title || !body) return { error: "Give it a title and a message." };

  const audienceRaw = String(formData.get("audience") ?? "WORKERS");
  const audience: Audience = AUDIENCES.includes(audienceRaw as Audience)
    ? (audienceRaw as Audience)
    : "WORKERS";

  // Messaging the admin team is a super-admin power. Checked here rather than
  // only hidden in the UI, so a crafted form post can't bypass it.
  if (audience === "ADMINS" && !isSuperAdmin(session.role)) {
    return { error: "Only a super admin can message the admin team." };
  }

  const fromRaw = String(formData.get("fromLabel") ?? "");
  const fromSuffix = FROM_LABELS.includes(fromRaw as (typeof FROM_LABELS)[number])
    ? fromRaw
    : FROM_LABELS[0];
  const fromLabel = `${tenant.name} ${fromSuffix}`;

  const branchRaw = String(formData.get("branchId") ?? "");
  const branchId = audience === "ADMINS" || !branchRaw ? null : branchRaw;

  const userIds = await recipientsFor(tenant.id, audience, branchId);
  if (userIds.length === 0) {
    return { error: "Nobody matches that selection, so nothing was sent." };
  }

  const broadcast = await prisma.broadcast.create({
    data: {
      tenantId: tenant.id,
      branchId,
      audience,
      fromLabel,
      title,
      body,
      createdById: session.id,
      createdByName: session.name,
      recipients: { create: userIds.map((userId) => ({ userId })) },
    },
  });

  // The popup is the thing that guarantees it's read; the push is what makes
  // them open the app. Failures here must not lose the broadcast itself.
  await Promise.all(
    userIds.map((id) =>
      notifyUser(id, {
        tenantId: tenant.id,
        type: "ANNOUNCEMENT",
        title,
        body,
        url: audience === "ADMINS" ? "/dashboard" : "/my-shifts",
      }).catch(() => {}),
    ),
  );

  revalidatePath("/announcements");
  return { ok: true, sentTo: userIds.length, id: broadcast.id };
}

/** The recipient marks their own copy read. */
export async function markBroadcastRead(formData: FormData) {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };

  const recipientId = String(formData.get("recipientId") ?? "");
  // Scoped to the caller's own row, so nobody can mark someone else as having
  // read something.
  const updated = await prisma.broadcastRecipient.updateMany({
    where: { id: recipientId, userId: session.id, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath("/my-shifts");
  revalidatePath("/dashboard");
  return { ok: true, changed: updated.count };
}
