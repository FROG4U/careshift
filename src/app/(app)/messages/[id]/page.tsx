import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { conversationTitle } from "@/lib/chat";
import { isOnline, presenceLabel } from "@/lib/presence";
import { Thread, type ChatMessage, type Member } from "./Thread";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;

  const convo = await prisma.conversation.findFirst({
    where: {
      id,
      tenantId: session.tenantId,
      members: { some: { userId: session.id } },
    },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              phone: true,
              lastSeenAt: true,
              staff: { select: { phone: true } },
            },
          },
        },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          sender: { select: { id: true, name: true } },
          reactions: { include: { user: { select: { id: true, name: true } } } },
          parent: { include: { sender: { select: { name: true } } } },
        },
      },
    },
  });
  if (!convo) notFound();

  // Opening the thread clears its unread badge (direct write — no revalidate
  // during render).
  await prisma.conversationMember.updateMany({
    where: { conversationId: id, userId: session.id },
    data: { lastReadAt: new Date() },
  });

  const title = conversationTitle(convo, session.id, session.name);
  const members: Member[] = convo.members.map((m) => ({
    id: m.user.id,
    name: m.user.name,
  }));

  // For a DM, offer tap-to-call the other person (their login phone, else their
  // staff record's phone).
  const other =
    convo.type === "GROUP"
      ? null
      : convo.members.find((m) => m.user.id !== session.id);
  const callNumber = other
    ? other.user.phone ?? other.user.staff?.phone ?? null
    : null;
  const online = other ? isOnline(other.user.lastSeenAt) : false;
  const presence = other ? presenceLabel(other.user.lastSeenAt) : null;

  const messages: ChatMessage[] = convo.messages.map((m) => ({
    id: m.id,
    senderId: m.senderId,
    senderName: m.sender.name,
    body: m.body,
    attachmentUrl: m.attachmentUrl,
    attachmentType: m.attachmentType,
    createdAt: m.createdAt.toISOString(),
    replyTo: m.parent
      ? { senderName: m.parent.sender.name, body: m.parent.body }
      : null,
    likes: m.reactions.map((r) => ({ userId: r.userId, name: r.user.name })),
  }));

  return (
    <Thread
      conversationId={convo.id}
      title={title}
      isGroup={convo.type === "GROUP"}
      memberCount={convo.members.length}
      meId={session.id}
      members={members}
      messages={messages}
      callNumber={callNumber}
      online={online}
      presence={presence}
    />
  );
}
