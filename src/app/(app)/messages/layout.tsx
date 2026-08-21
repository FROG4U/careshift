import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { conversationTitle } from "@/lib/chat";
import { isOnline } from "@/lib/presence";
import { MessagesShell, type ConvoSummary, type DirectoryUser } from "./MessagesShell";

export default async function MessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const memberships = await prisma.conversationMember.findMany({
    where: { userId: session.id, conversation: { tenantId: session.tenantId } },
    include: {
      conversation: {
        include: {
          members: {
            include: {
              user: { select: { id: true, name: true, lastSeenAt: true } },
            },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { sender: { select: { name: true } } },
          },
        },
      },
    },
  });

  const convos: ConvoSummary[] = await Promise.all(
    memberships.map(async (m) => {
      const c = m.conversation;
      const last = c.messages[0];
      const unread = await prisma.message.count({
        where: {
          conversationId: c.id,
          senderId: { not: session.id },
          ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
        },
      });
      const title = conversationTitle(c, session.id, session.name);
      const otherMember =
        c.type === "GROUP"
          ? null
          : c.members.find((mm) => mm.user.id !== session.id);
      return {
        id: c.id,
        type: c.type,
        archived: m.archivedAt != null,
        title,
        memberCount: c.members.length,
        online: otherMember ? isOnline(otherMember.user.lastSeenAt) : false,
        lastBody: last
          ? last.attachmentUrl && !last.body
            ? "📷 Photo"
            : `${last.senderId === session.id ? "You: " : c.type === "GROUP" ? `${last.sender.name.split(" ")[0]}: ` : ""}${last.body}`
          : "No messages yet",
        lastAt: last ? last.createdAt.toISOString() : c.createdAt.toISOString(),
        unread,
      };
    }),
  );
  convos.sort((a, b) => b.lastAt.localeCompare(a.lastAt));

  // Directory for starting new chats (everyone but me).
  const users = await prisma.user.findMany({
    where: { tenantId: session.tenantId, id: { not: session.id } },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
  const directory: DirectoryUser[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    role: u.role,
  }));

  return (
    <MessagesShell convos={convos} directory={directory}>
      {children}
    </MessagesShell>
  );
}
