"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { notifyWorker } from "@/lib/notify";

const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();

function fmtWhen(d: Date) {
  return d.toLocaleString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Approve a swap: reassign the shift to the requested worker. */
export async function approveSwap(formData: FormData) {
  const { tenant, session } = await requireTenant();
  if (session.role !== "ADMIN" && session.role !== "COORDINATOR") return;

  const id = str(formData.get("id"));
  const swap = await prisma.shiftSwap.findFirst({
    where: { id, tenantId: tenant.id, status: "PENDING" },
    include: { shift: { include: { client: true } }, fromStaff: true, toStaff: true },
  });
  if (!swap) return;

  // Re-check the target is still allocated to the participant.
  const stillAllocated = await prisma.clientWorker.findFirst({
    where: { clientId: swap.shift.clientId, staffId: swap.toStaffId },
  });
  if (!stillAllocated) {
    await prisma.shiftSwap.update({
      where: { id: swap.id },
      data: {
        status: "REJECTED",
        reason: `${swap.reason ?? ""} [auto-rejected: worker no longer allocated]`.trim(),
        decidedBy: session.name,
        decidedAt: new Date(),
      },
    });
    revalidatePath("/swaps");
    return;
  }

  await prisma.$transaction([
    prisma.shift.update({
      where: { id: swap.shiftId },
      data: { staffId: swap.toStaffId },
    }),
    prisma.shiftSwap.update({
      where: { id: swap.id },
      data: { status: "APPROVED", decidedBy: session.name, decidedAt: new Date() },
    }),
  ]);

  const label = `${swap.shift.client.firstName} ${swap.shift.client.lastName} · ${fmtWhen(swap.shift.start)}`;
  await notifyWorker(swap.toStaffId, {
    tenantId: tenant.id,
    type: "SWAP_APPROVED",
    title: "Shift assigned to you",
    body: `${swap.fromStaff.firstName} swapped ${label} to you — approved by ${session.name}.`,
    shiftId: swap.shiftId,
  });
  await notifyWorker(swap.fromStaffId, {
    tenantId: tenant.id,
    type: "SWAP_APPROVED",
    title: "Swap approved",
    body: `${label} is now covered by ${swap.toStaff.firstName} ${swap.toStaff.lastName}.`,
    shiftId: swap.shiftId,
  });

  revalidatePath("/swaps");
  revalidatePath("/schedule");
  revalidatePath("/my-shifts");
}

/** Reject a swap: the shift stays with the original worker. */
export async function rejectSwap(formData: FormData) {
  const { tenant, session } = await requireTenant();
  if (session.role !== "ADMIN" && session.role !== "COORDINATOR") return;

  const id = str(formData.get("id"));
  const swap = await prisma.shiftSwap.findFirst({
    where: { id, tenantId: tenant.id, status: "PENDING" },
    include: { shift: { include: { client: true } }, toStaff: true },
  });
  if (!swap) return;

  await prisma.shiftSwap.update({
    where: { id: swap.id },
    data: { status: "REJECTED", decidedBy: session.name, decidedAt: new Date() },
  });

  await notifyWorker(swap.fromStaffId, {
    tenantId: tenant.id,
    type: "SWAP_REJECTED",
    title: "Swap declined",
    body: `Your swap for ${swap.shift.client.firstName} ${swap.shift.client.lastName} · ${fmtWhen(swap.shift.start)} was declined by ${session.name}. The shift stays with you.`,
    shiftId: swap.shiftId,
  });

  revalidatePath("/swaps");
  revalidatePath("/my-shifts");
}
