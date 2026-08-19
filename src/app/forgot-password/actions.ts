"use server";

import { createHash, randomBytes } from "crypto";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { mailConfigured, resetEmail, sendMail } from "@/lib/mail";

const TOKEN_MINUTES = 60;

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export type ForgotState = { ok?: boolean; error?: string; sent?: boolean };

/**
 * Start a password reset.
 *
 * Always reports the same result whether or not the address exists — telling
 * a stranger which emails have accounts is a free list of who works here.
 */
export async function requestReset(
  _prev: ForgotState | undefined,
  formData: FormData,
): Promise<ForgotState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { error: "Enter the email address you sign in with." };
  }

  if (!mailConfigured()) {
    return {
      error:
        "Password reset emails aren't switched on yet. Please contact your manager and they can set your password.",
    };
  }

  const user = await prisma.user.findFirst({
    where: { email },
    select: { id: true, tenantId: true, name: true, email: true, status: true },
  });

  // Only ever send to a real, non-rejected account — but say the same thing
  // either way.
  if (user && user.status !== "REJECTED") {
    // Any earlier unused link stops working the moment a new one is issued.
    await prisma.passwordReset.deleteMany({
      where: { userId: user.id, usedAt: null },
    });

    const token = randomBytes(32).toString("base64url");
    await prisma.passwordReset.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + TOKEN_MINUTES * 60_000),
      },
    });

    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3100";
    const proto = h.get("x-forwarded-proto") ?? "https";
    const link = `${proto}://${host}/reset-password/${token}`;

    const { text, html } = resetEmail(
      user.name.split(" ")[0] || "there",
      link,
      TOKEN_MINUTES,
    );
    await sendMail({
      to: user.email,
      subject: "Reset your CareShift password",
      text,
      html,
    });
  }

  return { ok: true, sent: true };
}

export type ResetState = { error?: string; ok?: boolean };

/** Finish a reset: verify the token, set the new password, burn the token. */
export async function completeReset(
  _prev: ResetState | undefined,
  formData: FormData,
): Promise<ResetState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) {
    return { error: "Use at least 8 characters." };
  }
  if (password !== confirm) {
    return { error: "The two passwords don't match." };
  }

  const row = await prisma.passwordReset.findUnique({
    where: { tokenHash: sha256(token) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });

  if (!row || row.usedAt || row.expiresAt < new Date()) {
    return {
      error:
        "That link has expired or has already been used. Please request a new one.",
    };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: { passwordHash: await hashPassword(password) },
    }),
    prisma.passwordReset.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
    // Any other outstanding links for this account are now void.
    prisma.passwordReset.deleteMany({
      where: { userId: row.userId, usedAt: null },
    }),
  ]);

  return { ok: true };
}

/** Is this token still good? Used to render the page before submitting. */
export async function tokenIsValid(token: string): Promise<boolean> {
  if (!token) return false;
  const row = await prisma.passwordReset.findUnique({
    where: { tokenHash: sha256(token) },
    select: { expiresAt: true, usedAt: true },
  });
  return Boolean(row && !row.usedAt && row.expiresAt > new Date());
}
