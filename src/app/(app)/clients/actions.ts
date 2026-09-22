"use server";

import { revalidatePath } from "next/cache";
import { requireScope } from "@/lib/tenant";
import { opsWhere, resolveBranch, canSeeCharges } from "@/lib/scope";
import { prisma } from "@/lib/prisma";
import { resolveClientCoords } from "@/lib/geocode";
import { DEFAULT_GEOFENCE_FT } from "@/lib/constants";

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s ? Number(s) : null;
};
const date = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s ? new Date(s) : null;
};
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;

/** Charge-rate overrides. Blank = inherit the agreement's default. */
function chargeFields(formData: FormData) {
  return {
    chargeWeekdayDay: num(formData.get("chargeWeekdayDay")),
    chargeWeekdayEvening: num(formData.get("chargeWeekdayEvening")),
    chargeWeekdayNight: num(formData.get("chargeWeekdayNight")),
    chargeSaturday: num(formData.get("chargeSaturday")),
    chargeSunday: num(formData.get("chargeSunday")),
    chargePublicHoliday: num(formData.get("chargePublicHoliday")),
    chargeMileageRate: num(formData.get("chargeMileageRate")),
  };
}

/** Archive (deactivate) or restore a participant. Archived participants are
 *  excluded from the schedule (which only lists active clients). */
export async function setClientArchived(formData: FormData) {
  const { tenant, scope } = await requireScope();
  const id = String(formData.get("id") ?? "");
  const archive = String(formData.get("archive") ?? "") === "true";
  await prisma.client.updateMany({
    where: { id, tenantId: tenant.id, ...opsWhere(scope) },
    data: { active: !archive },
  });
  revalidatePath("/clients");
  revalidatePath("/schedule");
}

export async function createClient(formData: FormData) {
  const { tenant, session, scope } = await requireScope();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  if (!firstName || !lastName) return;
  // A branch manager files participants under their own branch only.
  const branch = resolveBranch(scope, str(formData.get("branchId")));
  if (!branch.ok) return;
  // Head office keeps the charge fields it always had; a branch manager only
  // writes them with the Finances tick for that branch.
  // Charges are Finances: super admins, or the Finances tick for this branch.
  const chargesAllowed = canSeeCharges(scope, session.role, branch.branchId);

  // The participant's ADDRESS decides where the clock-in geofence sits, not
  // whoever happened to be at the keyboard.
  const address = str(formData.get("address"));
  const coords = await resolveClientCoords(
    address,
    num(formData.get("lat")),
    num(formData.get("lng")),
  );

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
      lat: coords.lat,
      lng: coords.lng,
      geofenceFt: Math.round(num(formData.get("geofenceFt")) ?? DEFAULT_GEOFENCE_FT),
      branchId: branch.branchId,
      ...(chargesAllowed ? chargeFields(formData) : {}),
    },
  });

  revalidatePath("/clients");
}

export async function updateClient(formData: FormData) {
  const { tenant, session, scope } = await requireScope();
  const id = String(formData.get("id") ?? "");
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  if (!id || !firstName || !lastName) return;
  const branch = resolveBranch(scope, str(formData.get("branchId")));
  if (!branch.ok) return;
  // Charges are Finances: super admins, or the Finances tick for this branch.
  const chargesAllowed = canSeeCharges(scope, session.role, branch.branchId);

  // Same rule on edit: the address decides the geofence.
  const address = str(formData.get("address"));
  const coords = await resolveClientCoords(
    address,
    num(formData.get("lat")),
    num(formData.get("lng")),
  );

  // Scope the update to this tenant so one customer can't edit another's data.
  await prisma.client.updateMany({
    where: { id, tenantId: tenant.id, ...opsWhere(scope) },
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
      lat: coords.lat,
      lng: coords.lng,
      geofenceFt: Math.round(num(formData.get("geofenceFt")) ?? DEFAULT_GEOFENCE_FT),
      branchId: branch.branchId,
      ...(chargesAllowed ? chargeFields(formData) : {}),
    },
  });

  revalidatePath("/clients");
  revalidatePath("/schedule");
}
