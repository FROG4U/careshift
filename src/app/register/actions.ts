"use server";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { notifyManagers } from "@/lib/notify";

export type RegisterState = { error?: string; ok?: boolean };

/**
 * Self-service worker sign-up. The worker enters the company join code (which
 * both authorises the sign-up and identifies the tenant they're joining). We
 * create an inactive Staff record + a PENDING login, then notify managers so an
 * admin can approve. The worker cannot see any client data until approved.
 */
export async function registerAction(
  _prev: RegisterState | undefined,
  formData: FormData,
): Promise<RegisterState> {
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const code = String(formData.get("code") ?? "").trim().toUpperCase();

  if (!firstName || !lastName || !email || !password || !code) {
    return { error: "Please fill in all the required fields." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  // The join code identifies which company (tenant) they're joining.
  const tenant = await prisma.tenant.findFirst({
    where: { joinCode: code },
    select: { id: true },
  });
  if (!tenant) {
    return { error: "That company code wasn't recognised. Check with your manager." };
  }

  const existing = await prisma.user.findFirst({
    where: { tenantId: tenant.id, email },
    select: { id: true },
  });
  if (existing) {
    return { error: "An account with this email already exists. Try signing in instead." };
  }

  const passwordHash = await hashPassword(password);

  // Inactive Staff record + PENDING login, linked. Admin flips both on approval.
  const staff = await prisma.staff.create({
    data: {
      tenantId: tenant.id,
      firstName,
      lastName,
      email,
      phone: phone || null,
      title: "Support Worker",
      active: false,
    },
  });

  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email,
      passwordHash,
      name: `${firstName} ${lastName}`,
      role: "WORKER",
      status: "PENDING",
      phone: phone || null,
      staffId: staff.id,
    },
  });

  await notifyManagers({
    tenantId: tenant.id,
    type: "WORKER_REGISTERED",
    title: "New worker sign-up",
    body: `${firstName} ${lastName} (${email}) has requested an account. Review in Approvals.`,
  });

  return { ok: true };
}
