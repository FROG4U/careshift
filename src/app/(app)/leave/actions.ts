"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { notifyWorker } from "@/lib/notify";

async function decide(id: string, status: "APPROVED" | "REJECTED") {
  const { session, tenant } = await requireTenant();
  if (session.role === "WORKER") return;

  const a = await prisma.availability.findFirst({
    where: { id, tenantId: tenant.id },
  });
  if (!a) return;

  await prisma.availability.update({
    where: { id },
    data: { status, decidedBy: session.name },
  });

  await notifyWorker(a.staffId, {
    tenantId: tenant.id,
    type: "AVAILABILITY",
    title: status === "APPROVED" ? "Time off approved" : "Time off declined",
    body: `Your time-off request was ${status.toLowerCase()}.`,
  });

  revalidatePath("/leave");
  revalidatePath("/schedule");
}

/** Admin fully edits a time-off request (dates, type, reason). */
export async function editAvailability(formData: FormData) {
  const { session, tenant } = await requireTenant();
  if (session.role === "WORKER") return;

  const id = String(formData.get("id") ?? "");
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "") || startDate;
  const leaveTypeRaw = String(formData.get("leaveType") ?? "ANNUAL");
  const leaveType = ["ANNUAL", "SICK", "OTHER"].includes(leaveTypeRaw)
    ? leaveTypeRaw
    : "ANNUAL";
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!startDate) return;

  const a = await prisma.availability.findFirst({
    where: { id, tenantId: tenant.id },
  });
  if (!a) return;

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  await prisma.availability.update({
    where: { id },
    data: {
      startDate: start,
      endDate: end < start ? start : end,
      leaveType,
      reason,
    },
  });

  revalidatePath("/leave");
  revalidatePath("/schedule");
  revalidatePath("/my-shifts/profile");
}

export async function approveAvailability(formData: FormData) {
  await decide(String(formData.get("id") ?? ""), "APPROVED");
}

export async function rejectAvailability(formData: FormData) {
  await decide(String(formData.get("id") ?? ""), "REJECTED");
}
