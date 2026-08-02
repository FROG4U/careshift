"use server";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { notifySuperAdmins } from "@/lib/notify";

export type AcceptState = { error?: string; ok?: boolean };

/**
 * Accept an admin invite link: the invitee sets their name + password, which
 * creates a PENDING admin account for a super admin to approve.
 */
export async function acceptAdminInvite(
  _prev: AcceptState | undefined,
  formData: FormData,
): Promise<AcceptState> {
  const token = String(formData.get("token") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!name || !password) {
    return { error: "Please enter your name and a password." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const invite = await prisma.adminInvite.findFirst({
    where: { token, status: "PENDING" },
  });
  if (!invite) {
    return { error: "This invite link is no longer valid. Ask for a new one." };
  }

  const existing = await prisma.user.findFirst({
    where: { tenantId: invite.tenantId, email: invite.email },
    select: { id: true },
  });
  if (existing) {
    return { error: "An account with this email already exists — try signing in." };
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      tenantId: invite.tenantId,
      email: invite.email,
      passwordHash,
      name,
      role: invite.role,
      status: "PENDING",
    },
  });

  await prisma.adminInvite.update({
    where: { id: invite.id },
    data: { status: "ACCEPTED", acceptedUserId: user.id, name },
  });

  await notifySuperAdmins({
    tenantId: invite.tenantId,
    type: "ADMIN_INVITE_ACCEPTED",
    title: "New admin awaiting approval",
    body: `${name} (${invite.email}) accepted an admin invite. Approve them in Admins.`,
  });

  return { ok: true };
}
