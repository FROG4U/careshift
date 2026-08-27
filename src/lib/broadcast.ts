import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Office announcements.
 *
 * Distinct from chat: a broadcast has to be READ. The recipient gets a
 * full-screen popup they must open and close, and the office can see exactly
 * who has done so. Chat is a conversation; this is a noticeboard with a
 * signature sheet.
 */

/** Who a broadcast can be aimed at. */
export const AUDIENCES = ["WORKERS", "ADMINS"] as const;
export type Audience = (typeof AUDIENCES)[number];

export const AUDIENCE_LABELS: Record<Audience, string> = {
  WORKERS: "Support workers",
  ADMINS: "Admin team",
};

/**
 * Who a message can be sent "from". A label rather than the sender's own name,
 * because an announcement carries the office's authority, not an individual's.
 * The real sender is still recorded on the broadcast for accountability.
 */
export const FROM_LABELS = ["Admin Team", "Management"] as const;

export type PendingBroadcast = {
  recipientId: string;
  title: string;
  body: string;
  fromLabel: string;
  sentAt: string;
};

/**
 * The next unread announcement for a user, or null.
 *
 * Oldest first: if three went out while someone was on leave, they work
 * through them in the order they were sent rather than newest-first.
 */
export async function pendingBroadcastFor(
  userId: string,
): Promise<PendingBroadcast | null> {
  const row = await prisma.broadcastRecipient.findFirst({
    where: { userId, readAt: null },
    orderBy: { broadcast: { createdAt: "asc" } },
    select: {
      id: true,
      broadcast: {
        select: {
          title: true,
          body: true,
          fromLabel: true,
          createdAt: true,
        },
      },
    },
  });
  if (!row) return null;

  return {
    recipientId: row.id,
    title: row.broadcast.title,
    body: row.broadcast.body,
    fromLabel: row.broadcast.fromLabel,
    sentAt: row.broadcast.createdAt.toISOString(),
  };
}

/**
 * The users a broadcast should reach.
 *
 * Resolved at send time and stored, so the read list records who it actually
 * went to. Moving someone between branches next week must not silently rewrite
 * who was told what.
 */
export async function recipientsFor(
  tenantId: string,
  audience: Audience,
  branchId: string | null,
): Promise<string[]> {
  if (audience === "ADMINS") {
    // Admins aren't tied to a branch, so a branch filter doesn't apply.
    const admins = await prisma.user.findMany({
      where: {
        tenantId,
        status: "APPROVED",
        role: { in: ["ADMIN", "SUPER_ADMIN", "COORDINATOR"] },
      },
      select: { id: true },
    });
    return admins.map((u) => u.id);
  }

  const workers = await prisma.user.findMany({
    where: {
      tenantId,
      status: "APPROVED",
      role: "WORKER",
      // A worker's branch lives on their staff record; an inactive staff
      // record means they've left, so they shouldn't be told anything.
      staff: branchId ? { branchId, active: true } : { active: true },
    },
    select: { id: true },
  });
  return workers.map((u) => u.id);
}
