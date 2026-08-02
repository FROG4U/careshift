"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { notifyWorker } from "@/lib/notify";

function assertManager(role: string) {
  return role === "ADMIN" || role === "COORDINATOR";
}

/** Approve a pending worker: activate their account + Staff record. */
export async function approveWorker(formData: FormData) {
  const { tenant, session } = await requireTenant();
  if (!assertManager(session.role)) return;

  const userId = String(formData.get("userId") ?? "");
  const branchId = String(formData.get("branchId") ?? "").trim();
  const employmentType = String(formData.get("employmentType") ?? "").trim();

  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId: tenant.id, status: "PENDING" },
    select: { id: true, staffId: true },
  });
  if (!user) return;

  await prisma.user.update({
    where: { id: user.id },
    data: { status: "APPROVED" },
  });

  if (user.staffId) {
    await prisma.staff.update({
      where: { id: user.staffId },
      data: {
        active: true,
        ...(branchId ? { branchId } : {}),
        ...(employmentType === "CASUAL" || employmentType === "PERMANENT"
          ? { employmentType }
          : {}),
      },
    });

    await notifyWorker(user.staffId, {
      tenantId: tenant.id,
      type: "ACCOUNT_APPROVED",
      title: "Your account is approved 🎉",
      body: "You can now see your shifts and clock in. Welcome aboard!",
    });
  }

  revalidatePath("/approvals");
  revalidatePath("/", "layout");
}

/** Decline a pending worker's sign-up request. */
export async function rejectWorker(formData: FormData) {
  const { tenant, session } = await requireTenant();
  if (!assertManager(session.role)) return;

  const userId = String(formData.get("userId") ?? "");
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId: tenant.id, status: "PENDING" },
    select: { id: true, staffId: true },
  });
  if (!user) return;

  await prisma.user.update({
    where: { id: user.id },
    data: { status: "REJECTED" },
  });
  if (user.staffId) {
    await prisma.staff.update({
      where: { id: user.staffId },
      data: { active: false },
    });
  }

  revalidatePath("/approvals");
  revalidatePath("/", "layout");
}
