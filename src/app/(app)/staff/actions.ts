"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

const str = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;
const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s ? Number(s) : null;
};

/** Archive (deactivate) or restore a staff member. Archived staff are excluded
 *  from the schedule (which only lists active staff). */
export async function setStaffArchived(formData: FormData) {
  const { tenant } = await requireTenant();
  const id = String(formData.get("id") ?? "");
  const archive = String(formData.get("archive") ?? "") === "true";
  await prisma.staff.updateMany({
    where: { id, tenantId: tenant.id },
    data: { active: !archive },
  });
  revalidatePath("/staff");
  revalidatePath("/schedule");
}
const date = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s ? new Date(s) : null;
};

/**
 * Resolve the submitted pay-level id to a valid one for this tenant, or null.
 * Guards against empty strings and stale/deleted ids (which would otherwise
 * trip a foreign-key constraint).
 */
async function resolvePayLevelId(tenantId: string, raw: FormDataEntryValue | null) {
  const id = String(raw ?? "").trim();
  if (!id) return null;
  const lvl = await prisma.payLevel.findFirst({
    where: { id, tenantId },
    select: { id: true },
  });
  return lvl ? id : null;
}

/** Shared editable fields (everything except first/last name + pay level). */
function staffData(formData: FormData) {
  return {
    title: str(formData.get("title")),
    phone: str(formData.get("phone")),
    email: str(formData.get("email")),
    employmentType:
      String(formData.get("employmentType") ?? "").trim() === "CASUAL"
        ? "CASUAL"
        : "PERMANENT",
    clearanceType: str(formData.get("clearanceType")),
    clearanceExpiry: date(formData.get("clearanceExpiry")),
    branchId: str(formData.get("branchId")),
    // Optional manual overrides (only present if the form sends them).
    rateNdis: num(formData.get("rateNdis")),
    rateAgedCare: num(formData.get("rateAgedCare")),
    rateDva: num(formData.get("rateDva")),
    rateCleaning: num(formData.get("rateCleaning")),
  };
}

export async function createStaff(formData: FormData) {
  const { tenant } = await requireTenant();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  if (!firstName || !lastName) return;

  const payLevelId = await resolvePayLevelId(tenant.id, formData.get("payLevelId"));

  await prisma.staff.create({
    data: {
      tenantId: tenant.id,
      firstName,
      lastName,
      payLevelId,
      ...staffData(formData),
    },
  });

  revalidatePath("/staff");
}

export async function updateStaff(formData: FormData) {
  const { tenant } = await requireTenant();
  const id = String(formData.get("id") ?? "");
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  if (!id || !firstName || !lastName) return;

  const payLevelId = await resolvePayLevelId(tenant.id, formData.get("payLevelId"));

  // Tenant-scoped so one customer can't edit another's staff.
  await prisma.staff.updateMany({
    where: { id, tenantId: tenant.id },
    data: {
      firstName,
      lastName,
      payLevelId,
      ...staffData(formData),
    },
  });

  revalidatePath("/staff");
}
