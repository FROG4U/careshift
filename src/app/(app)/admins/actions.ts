"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/roles";
import { notifyUser } from "@/lib/notify";

/** Create a shareable invite link for a new admin. Super admins only. */
export async function createAdminInvite(formData: FormData) {
  const { tenant, session } = await requireTenant();
  if (!isSuperAdmin(session.role)) return;

  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "ADMIN") === "SUPER_ADMIN"
    ? "SUPER_ADMIN"
    : "ADMIN";
  if (!email) return;

  // Don't invite someone who already has an account here.
  const existing = await prisma.user.findFirst({
    where: { tenantId: tenant.id, email },
    select: { id: true },
  });
  if (existing) return;

  const token = randomBytes(24).toString("base64url");
  await prisma.adminInvite.create({
    data: {
      tenantId: tenant.id,
      email,
      name: name || null,
      role,
      token,
      invitedById: session.id,
    },
  });

  revalidatePath("/admins");
}

/** Cancel an outstanding invite link. */
export async function revokeInvite(formData: FormData) {
  const { tenant, session } = await requireTenant();
  if (!isSuperAdmin(session.role)) return;
  const id = String(formData.get("id") ?? "");
  await prisma.adminInvite.updateMany({
    where: { id, tenantId: tenant.id, status: "PENDING" },
    data: { status: "REVOKED" },
  });
  revalidatePath("/admins");
}

/** Approve a pending admin (someone who accepted an invite link). */
export async function approveAdmin(formData: FormData) {
  const { tenant, session } = await requireTenant();
  if (!isSuperAdmin(session.role)) return;
  const userId = String(formData.get("userId") ?? "");
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      tenantId: tenant.id,
      status: "PENDING",
      role: { in: ["ADMIN", "SUPER_ADMIN"] },
    },
    select: { id: true },
  });
  if (!user) return;
  await prisma.user.update({
    where: { id: user.id },
    data: { status: "APPROVED" },
  });
  await notifyUser(user.id, {
    tenantId: tenant.id,
    type: "ADMIN_APPROVED",
    title: "Your admin access is approved 🎉",
    body: "You can now sign in and manage the platform.",
  });
  revalidatePath("/admins");
}

/** Decline a pending admin request. */
export async function rejectAdmin(formData: FormData) {
  const { tenant, session } = await requireTenant();
  if (!isSuperAdmin(session.role)) return;
  const userId = String(formData.get("userId") ?? "");
  await prisma.user.updateMany({
    where: {
      id: userId,
      tenantId: tenant.id,
      status: "PENDING",
      role: { in: ["ADMIN", "SUPER_ADMIN"] },
    },
    data: { status: "REJECTED" },
  });
  revalidatePath("/admins");
}

/** Promote an admin to super admin, or demote back to admin. */
export async function setAdminRole(formData: FormData) {
  const { tenant, session } = await requireTenant();
  if (!isSuperAdmin(session.role)) return;
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "") === "SUPER_ADMIN"
    ? "SUPER_ADMIN"
    : "ADMIN";

  // Can't change your own role (avoid locking yourself out of super-admin).
  if (userId === session.id) return;

  const target = await prisma.user.findFirst({
    where: {
      id: userId,
      tenantId: tenant.id,
      role: { in: ["ADMIN", "SUPER_ADMIN"] },
    },
    select: { id: true, role: true },
  });
  if (!target) return;

  // Never leave the tenant with zero super admins.
  if (target.role === "SUPER_ADMIN" && role === "ADMIN") {
    const supers = await prisma.user.count({
      where: { tenantId: tenant.id, role: "SUPER_ADMIN", status: "APPROVED" },
    });
    if (supers <= 1) return;
  }

  await prisma.user.update({ where: { id: target.id }, data: { role } });
  revalidatePath("/admins");
}
