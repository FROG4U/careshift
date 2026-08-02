"use server";

import { randomInt } from "crypto";
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

/** Human-friendly code, no ambiguous chars (0/O, 1/I). e.g. PCG-7K3M. */
function makeJoinCode(name: string) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const prefix =
    (name.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase() || "CARE");
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += alphabet[randomInt(alphabet.length)];
  return `${prefix}-${suffix}`;
}

/**
 * Generate (or rotate) the company sign-up code workers enter on /register.
 * Admin-only. Rotating it means old codes stop working — hand out the new one.
 */
export async function generateJoinCode() {
  const { tenant, session } = await requireTenant();
  if (session.role !== "ADMIN") return;

  // Retry on the (extremely unlikely) unique-collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeJoinCode(tenant.name);
    try {
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { joinCode: code },
      });
      break;
    } catch {
      // collision — try another code
    }
  }
  revalidatePath("/settings");
}

/** Turn off self sign-up by clearing the code. Admin-only. */
export async function clearJoinCode() {
  const { tenant, session } = await requireTenant();
  if (session.role !== "ADMIN") return;
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { joinCode: null },
  });
  revalidatePath("/settings");
}

export async function updateBranding(formData: FormData) {
  const { tenant } = await requireTenant();
  const name = String(formData.get("name") ?? "").trim();
  const brandColor = String(formData.get("brandColor") ?? "").trim();

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      name: name || tenant.name,
      brandColor: /^#[0-9a-fA-F]{6}$/.test(brandColor)
        ? brandColor
        : tenant.brandColor,
    },
  });

  revalidatePath("/", "layout");
}

// Branch management is admin-only.
export async function createBranch(formData: FormData) {
  const { tenant, session } = await requireTenant();
  if (session.role !== "ADMIN") return;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await prisma.branch.create({ data: { tenantId: tenant.id, name } });
  revalidatePath("/settings");
  revalidatePath("/schedule");
}

export async function renameBranch(formData: FormData) {
  const { tenant, session } = await requireTenant();
  if (session.role !== "ADMIN") return;
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;
  await prisma.branch.updateMany({
    where: { id, tenantId: tenant.id },
    data: { name },
  });
  revalidatePath("/settings");
  revalidatePath("/schedule");
}

export async function deleteBranch(formData: FormData) {
  const { tenant, session } = await requireTenant();
  if (session.role !== "ADMIN") return;
  const id = String(formData.get("id") ?? "");
  // Staff/participants/shifts keep their records; branchId is set null (SetNull).
  await prisma.branch.deleteMany({ where: { id, tenantId: tenant.id } });
  revalidatePath("/settings");
  revalidatePath("/schedule");
}

/** Attendance thresholds that drive the worker reliability score. */
export async function updateAttendanceSettings(formData: FormData) {
  const { tenant, session } = await requireTenant();
  if (session.role !== "ADMIN" && session.role !== "COORDINATOR") return;

  const num = (k: string, min: number, max: number, fallback: number) => {
    const n = Number(String(formData.get(k) ?? "").trim());
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
  };

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      lateGraceMin: num("lateGraceMin", 0, 120, 5),
      earlyFinishGraceMin: num("earlyFinishGraceMin", 0, 120, 5),
      lateFinishGraceMin: num("lateFinishGraceMin", 0, 240, 15),
      ratingGreenAt: num("ratingGreenAt", 1, 100, 85),
      ratingAmberAt: num("ratingAmberAt", 0, 99, 65),
      lateNoticePenalty: num("lateNoticePenalty", 0, 50, 2),
    },
  });

  revalidatePath("/settings");
  revalidatePath("/attendance");
  revalidatePath("/staff");
  revalidatePath("/my-shifts");
}

/** Leave & time-off allowances + whether workers see their balance. */
export async function updateLeaveSettings(formData: FormData) {
  const { tenant, session } = await requireTenant();
  if (session.role !== "ADMIN" && session.role !== "COORDINATOR") return;

  const num = (k: string, fallback: number) => {
    const n = Number(String(formData.get(k) ?? "").trim());
    return Number.isFinite(n) ? Math.min(365, Math.max(0, Math.round(n))) : fallback;
  };

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      annualLeaveDays: num("annualLeaveDays", 20),
      sickLeaveDays: num("sickLeaveDays", 10),
      showLeaveBalance: String(formData.get("showLeaveBalance") ?? "") === "on",
    },
  });

  revalidatePath("/settings");
  revalidatePath("/my-shifts/profile");
}
