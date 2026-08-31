"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/tenant";
import { isManager } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { effectiveRates } from "@/lib/rates";
import { DAY_TYPES, STAFF_STREAMS } from "@/lib/constants";

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

/**
 * Save the rate grid an admin typed on the staff form.
 *
 * A cell is stored as an override only when it DIFFERS from what the pay
 * level would give (casual loading included). Typing back the number the
 * level already produces leaves no override, so a later change of level
 * still flows through. Clearing a cell removes its override.
 *
 * The stored value is the FINAL rate — no loading is added on top of it.
 */
async function saveRateOverrides(
  tenantId: string,
  staffId: string,
  formData: FormData,
) {
  const staff = await prisma.staff.findFirst({
    where: { id: staffId, tenantId },
    include: { payLevel: { include: { rates: true } }, rateOverrides: true },
  });
  if (!staff) return;

  // What the level alone pays, so a real override is distinguishable from
  // an untouched cell.
  const levelOnly = effectiveRates({
    employmentType: staff.employmentType,
    payLevel: staff.payLevel,
    rateOverrides: [],
  }).grid;

  const keep: { stream: string; dayType: string; rate: number }[] = [];

  for (const stream of STAFF_STREAMS) {
    for (const dayType of DAY_TYPES) {
      const raw = String(formData.get(`rate_${stream}_${dayType}`) ?? "").trim();
      if (!raw) continue;
      const value = Math.round(Number(raw) * 100) / 100;
      if (!Number.isFinite(value) || value <= 0) continue;

      const fromLevel = levelOnly[`${stream}_${dayType}`] ?? 0;
      if (Math.abs(value - fromLevel) < 0.005) continue; // unchanged
      keep.push({ stream, dayType, rate: value });
    }
  }

  // Replaced wholesale, so anything the admin cleared disappears.
  await prisma.$transaction([
    prisma.staffRate.deleteMany({ where: { staffId } }),
    ...(keep.length
      ? [
          prisma.staffRate.createMany({
            data: keep.map((k) => ({ ...k, tenantId, staffId })),
          }),
        ]
      : []),
  ]);
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

  // After the level/employment change has landed, so the comparison is
  // against the level they're actually on now.
  await saveRateOverrides(tenant.id, id, formData);

  revalidatePath("/staff");
  revalidatePath("/payroll");
}

/**
 * Permanently delete an archived staff member.
 *
 * Refused outright once they have any shift against them. `Shift.staffId` is
 * SetNull, so deleting a worker who has actually worked would leave completed,
 * paid shifts showing "Unassigned" - corrupting payroll and the NDIS record of
 * who delivered what. Archiving is the correct end state for anyone who has
 * worked a day; this is only for records created in error.
 *
 * A linked login is locked out rather than deleted, for the same reason it is
 * with admins: deleting the user would cascade away their messages and any
 * incident reports they filed.
 */
export async function deleteStaff(formData: FormData) {
  const { tenant, session } = await requireTenant();
  if (!isManager(session.role)) return { error: "Managers only." };

  const id = String(formData.get("id") ?? "");
  const staff = await prisma.staff.findFirst({
    where: { id, tenantId: tenant.id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      active: true,
      _count: { select: { shifts: true, incidents: true } },
    },
  });
  if (!staff) return { error: "That staff member no longer exists." };

  if (staff.active) {
    return { error: "Archive them first, so deleting is never a single click." };
  }

  if (staff._count.shifts > 0) {
    return {
      error: `${staff.firstName} has ${staff._count.shifts} shift${staff._count.shifts === 1 ? "" : "s"} on record. Deleting would leave those shifts with no worker, so they have to stay archived.`,
    };
  }

  if (staff._count.incidents > 0) {
    return {
      error: `${staff.firstName} filed incident reports, which have to be kept. They have to stay archived.`,
    };
  }

  // Lock any login out rather than deleting it, so messages and reports survive.
  await prisma.user.updateMany({
    where: { tenantId: tenant.id, staffId: staff.id },
    data: { status: "REMOVED", staffId: null },
  });

  await prisma.staff.delete({ where: { id: staff.id } });

  revalidatePath("/staff");
  revalidatePath("/schedule");
  return { ok: true, name: `${staff.firstName} ${staff.lastName}` };
}
