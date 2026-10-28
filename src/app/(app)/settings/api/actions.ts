"use server";

import { revalidatePath } from "next/cache";
import { requireScope } from "@/lib/tenant";
import { isSuperAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { ROTATION_GRACE_HOURS, newApiKey } from "@/lib/apiKey";

/**
 * Issuing, rotating and switching off the export key.
 *
 * Super admin only, and head office only: this is one key to every shift,
 * note, wage figure and participant record in the system.
 *
 * The key itself is returned to the screen ONCE, right here, and never
 * stored. If it is lost, rotate and hand over the new one.
 */

async function gate() {
  const { tenant, session, scope } = await requireScope();
  if (!scope.headOffice) return null;
  if (!isSuperAdmin(session.role)) return null;
  return { tenant, session };
}

export async function createApiKey(formData: FormData) {
  const ctx = await gate();
  if (!ctx) return { error: "Only a super admin at head office can do this." };

  const name = String(formData.get("name") ?? "").trim().slice(0, 60) || "Omexx";
  const { key, hash, prefix } = newApiKey();

  await prisma.apiToken.create({
    data: {
      tenantId: ctx.tenant.id,
      name,
      hash,
      prefix,
      createdBy: ctx.session.name,
      // No expiry: it works until it is switched off or rotated away.
    },
  });

  revalidatePath("/settings/api");
  return { ok: true, key };
}

/**
 * Issue a replacement and give the old one a day to live, so the other end
 * can be changed over without a failed overnight sync.
 */
export async function rotateApiKey(formData: FormData) {
  const ctx = await gate();
  if (!ctx) return { error: "Only a super admin at head office can do this." };

  const id = String(formData.get("tokenId") ?? "");
  const old = await prisma.apiToken.findFirst({
    where: { id, tenantId: ctx.tenant.id, revokedAt: null },
    select: { id: true, name: true },
  });
  if (!old) return { error: "That key no longer exists." };

  const { key, hash, prefix } = newApiKey();
  const retiresAt = new Date(Date.now() + ROTATION_GRACE_HOURS * 3_600_000);

  await prisma.$transaction([
    prisma.apiToken.update({ where: { id: old.id }, data: { retiresAt } }),
    prisma.apiToken.create({
      data: {
        tenantId: ctx.tenant.id,
        name: old.name,
        hash,
        prefix,
        createdBy: ctx.session.name,
      },
    }),
  ]);

  revalidatePath("/settings/api");
  return { ok: true, key, oldStopsAt: retiresAt.toISOString() };
}

/** Stop a key working this second. For a key believed to be in the wrong hands. */
export async function revokeApiKey(formData: FormData) {
  const ctx = await gate();
  if (!ctx) return { error: "Only a super admin at head office can do this." };

  const id = String(formData.get("tokenId") ?? "");
  await prisma.apiToken.updateMany({
    where: { id, tenantId: ctx.tenant.id },
    data: { revokedAt: new Date() },
  });

  revalidatePath("/settings/api");
  return { ok: true };
}
