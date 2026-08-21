import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { conversationTitle } from "@/lib/chat";
import { isOnline } from "@/lib/presence";
import { initials } from "@/lib/format";
import { NewChatButton, type ChatContact } from "@/components/worker/NewChatButton";
import { ROLE_LABELS, type Role } from "@/lib/constants";

function ago(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

export default async function WorkerChatPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.staffId) redirect("/dashboard");

  const account = await prisma.user.findUnique({
    where: { id: session.id },
    select: { status: true },
  });
  if (!account || account.status !== "APPROVED") redirect("/pending");

  // Everyone else in the tenant they could message.
  const contactRows = await prisma.user.findMany({
    where: {
      tenantId: session.tenantId,
      id: { not: session.id },
      status: "APPROVED",
    },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
  const contacts: ChatContact[] = contactRows.map((u) => ({
    id: u.id,
    name: u.name,
    role: ROLE_LABELS[u.role as Role] ?? u.role,
  }));

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

  const convos = await Promise.all(
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
      const otherMember =
        c.type === "GROUP"
          ? null
          : c.members.find((mm) => mm.user.id !== session.id);
      return {
        id: c.id,
        isGroup: c.type === "GROUP",
        online: otherMember ? isOnline(otherMember.user.lastSeenAt) : false,
        title: conversationTitle(c, session.id, session.name),
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

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-900">Chat</h1>
        <NewChatButton contacts={contacts} />
      </div>

      {convos.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
          No conversations yet. Tap the pencil to message someone in your team.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {convos.map((c) => (
            <Link
              key={c.id}
              href={`/my-shifts/chat/${c.id}`}
              className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 transition last:border-0 hover:bg-slate-50"
            >
              <span className="relative shrink-0">
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--brand), color-mix(in srgb, var(--brand) 55%, #000))",
                  }}
                >
                  {c.isGroup ? (
                    <span className="material-symbols-rounded text-[22px]">group</span>
                  ) : (
                    initials(c.title.split(" ")[0] ?? "", c.title.split(" ")[1] ?? "")
                  )}
                </span>
                {c.online && (
                  <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-green-500" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold text-slate-900">
                    {c.title}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">
                    {ago(c.lastAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`truncate text-sm ${c.unread > 0 ? "font-semibold text-slate-700" : "text-slate-400"}`}
                  >
                    {c.lastBody}
                  </span>
                  {c.unread > 0 && (
                    <span
                      className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white"
                      style={{ background: "var(--accent, #886949)" }}
                    >
                      {c.unread > 9 ? "9+" : c.unread}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <p className="mt-4 text-center text-xs text-slate-400">
        Tap a conversation to open it.
      </p>
    </div>
  );
}
