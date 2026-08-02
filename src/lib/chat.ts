import "server-only";
import { prisma } from "./prisma";

/** Total unread messages across all of a user's conversations. */
export async function totalUnread(
  tenantId: string,
  userId: string,
): Promise<number> {
  const memberships = await prisma.conversationMember.findMany({
    where: { userId, conversation: { tenantId } },
    select: { conversationId: true, lastReadAt: true },
  });
  if (memberships.length === 0) return 0;

  let total = 0;
  for (const m of memberships) {
    total += await prisma.message.count({
      where: {
        conversationId: m.conversationId,
        senderId: { not: userId },
        ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
      },
    });
  }
  return total;
}

/** Short title for a DM (the other person) or a group (its name). */
export function conversationTitle(
  convo: { type: string; name: string | null; members: { user: { name: string } }[] },
  meId: string,
  meName: string,
): string {
  if (convo.type === "GROUP") return convo.name ?? "Group";
  const other = convo.members.find((m) => m.user.name !== meName);
  return other?.user.name ?? "Direct message";
}
