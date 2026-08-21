import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Someone counts as typing only for a few seconds after their last keystroke. */
const TYPING_WINDOW_MS = 6000;

/**
 * Cheap live state for an open thread: who's typing, who has read it, and
 * whether there are new messages.
 *
 * The thread polls this instead of re-rendering the whole page every few
 * seconds — it only triggers a full refresh when the message count actually
 * changes, which keeps typing indicators responsive without the cost.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const conversationId = req.nextUrl.searchParams.get("c");
  if (!conversationId) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const member = await prisma.conversationMember.findFirst({
    where: { conversationId, userId: session.id },
    select: { id: true },
  });
  if (!member) return NextResponse.json({ ok: false }, { status: 403 });

  const [members, count, latest] = await Promise.all([
    prisma.conversationMember.findMany({
      where: { conversationId },
      select: {
        userId: true,
        lastReadAt: true,
        typingAt: true,
        user: { select: { name: true } },
      },
    }),
    prisma.message.count({ where: { conversationId } }),
    prisma.message.findFirst({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      select: { id: true, senderId: true, createdAt: true },
    }),
  ]);

  const now = Date.now();

  return NextResponse.json({
    ok: true,
    count,
    lastMessageId: latest?.id ?? null,
    typing: members
      .filter(
        (m) =>
          m.userId !== session.id &&
          m.typingAt &&
          now - m.typingAt.getTime() < TYPING_WINDOW_MS,
      )
      .map((m) => m.user.name),
    // Who has seen the newest message — drives the "Seen" receipt.
    readers: members
      .filter(
        (m) =>
          m.userId !== session.id &&
          latest != null &&
          m.lastReadAt != null &&
          m.lastReadAt >= latest.createdAt,
      )
      .map((m) => m.user.name),
    lastMessageMine: latest?.senderId === session.id,
  });
}
