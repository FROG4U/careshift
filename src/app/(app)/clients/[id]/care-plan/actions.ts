"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

const str = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;

/** Confirm the participant belongs to the signed-in tenant. */
async function ownClient(clientId: string) {
  const { tenant } = await requireTenant();
  const client = await prisma.client.findFirst({
    where: { id: clientId, tenantId: tenant.id },
  });
  if (!client) throw new Error("Participant not found");
  return { tenant, client };
}

export async function saveCarePlan(formData: FormData) {
  const clientId = String(formData.get("clientId") ?? "");
  const { tenant } = await ownClient(clientId);

  const data = {
    summary: str(formData.get("summary")),
    supportNeeds: str(formData.get("supportNeeds")),
    medicalConditions: str(formData.get("medicalConditions")),
    medications: str(formData.get("medications")),
    allergies: str(formData.get("allergies")),
    risks: str(formData.get("risks")),
    preferences: str(formData.get("preferences")),
    emergencyName: str(formData.get("emergencyName")),
    emergencyPhone: str(formData.get("emergencyPhone")),
    emergencyRelation: str(formData.get("emergencyRelation")),
  };

  await prisma.carePlan.upsert({
    where: { clientId },
    create: { clientId, tenantId: tenant.id, ...data },
    update: data,
  });
  revalidatePath(`/clients/${clientId}/care-plan`);
}

export async function addGoal(formData: FormData) {
  const clientId = String(formData.get("clientId") ?? "");
  const { tenant } = await ownClient(clientId);
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  await prisma.careGoal.create({
    data: {
      tenantId: tenant.id,
      clientId,
      title,
      detail: str(formData.get("detail")),
    },
  });
  revalidatePath(`/clients/${clientId}/care-plan`);
}

export async function toggleGoal(formData: FormData) {
  const clientId = String(formData.get("clientId") ?? "");
  const { tenant } = await ownClient(clientId);
  const id = String(formData.get("goalId") ?? "");
  const goal = await prisma.careGoal.findFirst({
    where: { id, tenantId: tenant.id, clientId },
  });
  if (!goal) return;
  await prisma.careGoal.update({
    where: { id },
    data: { achieved: !goal.achieved },
  });
  revalidatePath(`/clients/${clientId}/care-plan`);
}

export async function deleteGoal(formData: FormData) {
  const clientId = String(formData.get("clientId") ?? "");
  const { tenant } = await ownClient(clientId);
  const id = String(formData.get("goalId") ?? "");
  await prisma.careGoal.deleteMany({
    where: { id, tenantId: tenant.id, clientId },
  });
  revalidatePath(`/clients/${clientId}/care-plan`);
}
