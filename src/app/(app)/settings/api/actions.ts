"use server";

import { revalidatePath } from "next/cache";
import { requireScope } from "@/lib/tenant";
import { isSuperAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { ROTATION_GRACE_HOURS, newApiKey } from "@/lib/apiKey";
import { checkNotifyUrl, pingNotifyUrl } from "@/lib/notifyHook";

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

/**
 * Save (or clear) the address we knock on when there is new data.
 *
 * The server is what fetches this address, so it is checked rather than
 * trusted: public https only, nothing pointing back inside our own network.
 */
export async function setNotifyUrl(formData: FormData) {
  const ctx = await gate();
  if (!ctx) return { error: "Only a super admin at head office can do this." };

  const id = String(formData.get("tokenId") ?? "");
  const raw = String(formData.get("notifyUrl") ?? "").trim();

  const token = await prisma.apiToken.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    select: { id: true },
  });
  if (!token) return { error: "That key no longer exists." };

  // Empty means "turn it off", which is a legitimate thing to want.
  if (!raw) {
    await prisma.apiToken.update({
      where: { id: token.id },
      data: { notifyUrl: null, notifiedAt: null, notifyResult: null },
    });
    revalidatePath("/settings/api");
    return { ok: true, cleared: true };
  }

  const checked = checkNotifyUrl(raw);
  if ("error" in checked) return { error: checked.error };

  await prisma.apiToken.update({
    where: { id: token.id },
    data: { notifyUrl: checked.url },
  });
  revalidatePath("/settings/api");
  return { ok: true };
}

/**
 * Tell the far end there is something new, now, rather than waiting for its
 * next scheduled run.
 *
 * We send a nudge, not the data: they come and pull what they want with the
 * key they already hold. One way in, one set of rules.
 */
export async function pushNow(formData: FormData) {
  const ctx = await gate();
  if (!ctx) return { error: "Only a super admin at head office can do this." };

  const id = String(formData.get("tokenId") ?? "");
  const token = await prisma.apiToken.findFirst({
    where: { id, tenantId: ctx.tenant.id, revokedAt: null },
    select: { id: true, name: true, notifyUrl: true },
  });
  if (!token) return { error: "That key no longer exists." };
  if (!token.notifyUrl) {
    return {
      error:
        "No address saved yet. Ask Oneil for the web address to notify, paste it above and save it first.",
    };
  }

  const at = new Date();
  const outcome = await pingNotifyUrl(token.notifyUrl, {
    event: "data.changed",
    source: "PCG Shift Care",
    at: at.toISOString(),
    message:
      "There is new or changed data. Pull the export endpoints with your key, using the nextSince value from your last pull.",
    triggeredBy: ctx.session.name,
  });

  await prisma.apiToken.update({
    where: { id: token.id },
    data: { notifiedAt: at, notifyResult: outcome.detail.slice(0, 200) },
  });

  revalidatePath("/settings/api");
  return outcome.ok
    ? { ok: true, detail: outcome.detail }
    : { error: `${token.name} was not reached. ${outcome.detail}.` };
}
