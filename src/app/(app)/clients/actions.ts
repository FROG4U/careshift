"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s ? Number(s) : null;
};
const date = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s ? new Date(s) : null;
};
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;

/** Archive (deactivate) or restore a participant. Archived participants are
 *  excluded from the schedule (which only lists active clients). */
export async function setClientArchived(formData: FormData) {
  const { tenant } = await requireTenant();
  const id = String(formData.get("id") ?? "");
  const archive = String(formData.get("archive") ?? "") === "true";
  await prisma.client.updateMany({
    where: { id, tenantId: tenant.id },
    data: { active: !archive },
  });
  revalidatePath("/clients");
  revalidatePath("/schedule");
}

export async function createClient(formData: FormData) {
  const { tenant } = await requireTenant();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  if (!firstName || !lastName) return;

  await prisma.client.create({
    data: {
      tenantId: tenant.id,
      firstName,
      lastName,
      agreementType: str(formData.get("agreementType")) || "NDIS",
      ndisNumber: str(formData.get("ndisNumber")),
      budget: num(formData.get("budget")),
      weeklyHours: num(formData.get("weeklyHours")),
      planStart: date(formData.get("planStart")),
      planEnd: date(formData.get("planEnd")),
      address: str(formData.get("address")),
      phone: str(formData.get("phone")),
      email: str(formData.get("email")),
      lat: num(formData.get("lat")),
      lng: num(formData.get("lng")),
      geofenceFt: Math.round(num(formData.get("geofenceFt")) ?? 150),
      branchId: str(formData.get("branchId")),
      // Charge-rate overrides. Blank = inherit the agreement's default.
      chargeWeekdayDay: num(formData.get("chargeWeekdayDay")),
      chargeWeekdayEvening: num(formData.get("chargeWeekdayEvening")),
      chargeWeekdayNight: num(formData.get("chargeWeekdayNight")),
      chargeSaturday: num(formData.get("chargeSaturday")),
      chargeSunday: num(formData.get("chargeSunday")),
      chargePublicHoliday: num(formData.get("chargePublicHoliday")),
      chargeMileageRate: num(formData.get("chargeMileageRate")),
    },
  });

  revalidatePath("/clients");
}

export async function updateClient(formData: FormData) {
  const { tenant } = await requireTenant();
  const id = String(formData.get("id") ?? "");
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  if (!id || !firstName || !lastName) return;

  // Scope the update to this tenant so one customer can't edit another's data.
  await prisma.client.updateMany({
    where: { id, tenantId: tenant.id },
    data: {
      firstName,
      lastName,
      agreementType: str(formData.get("agreementType")) || "NDIS",
      ndisNumber: str(formData.get("ndisNumber")),
      budget: num(formData.get("budget")),
      weeklyHours: num(formData.get("weeklyHours")),
      planStart: date(formData.get("planStart")),
      planEnd: date(formData.get("planEnd")),
      address: str(formData.get("address")),
      phone: str(formData.get("phone")),
      email: str(formData.get("email")),
      lat: num(formData.get("lat")),
      lng: num(formData.get("lng")),
      geofenceFt: Math.round(num(formData.get("geofenceFt")) ?? 150),
      branchId: str(formData.get("branchId")),
      // Charge-rate overrides. Blank = inherit the agreement's default.
      chargeWeekdayDay: num(formData.get("chargeWeekdayDay")),
      chargeWeekdayEvening: num(formData.get("chargeWeekdayEvening")),
      chargeWeekdayNight: num(formData.get("chargeWeekdayNight")),
      chargeSaturday: num(formData.get("chargeSaturday")),
      chargeSunday: num(formData.get("chargeSunday")),
      chargePublicHoliday: num(formData.get("chargePublicHoliday")),
      chargeMileageRate: num(formData.get("chargeMileageRate")),
    },
  });

  revalidatePath("/clients");
  revalidatePath("/schedule");
}
