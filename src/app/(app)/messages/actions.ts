"use server";

import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notify";

const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();

/** Start (or reuse) a 1:1 DM with another user. Returns the conversation id. */
/**
 * Returns the conversation id, or null if it couldn't be started.
 *
 * Deliberately a PLAIN STRING, not an object. A browser that still has an
 * older build of the page cached calls this too, and an object would be
 * truthy there — sending it to /messages/[object Object] and a hard 404.
 * Keeping the shape stable means old and new clients both behave.
 */
export async function startDirect(
  formData: FormData,
): Promise<string | null> {
  const { tenant, session } = await requireTenant();
  const otherId = str(formData.get("userId"));
  // TEMPORARY TRACE — remove once the pencil-button 404 is understood.
  console.log(
    `[trace] startDirect caller=${session.name}<${session.email}> picked=${otherId || "(none)"}`,
  );
  if (!otherId || otherId === session.id) {
    console.log("[trace] startDirect -> null (no pick, or picked self)");
    return null;
  }

  const other = await prisma.user.findFirst({
    where: { id: otherId, tenantId: tenant.id },
  });
  if (!other) return null;

  // Reuse an existing DM between exactly these two.
  const existing = await prisma.conversation.findFirst({
    where: {
      tenantId: tenant.id,
      type: "DIRECT",
      members: { every: { userId: { in: [session.id, otherId] } } },
      AND: [
        { members: { some: { userId: session.id } } },
        { members: { some: { userId: otherId } } },
      ],
    },
  });
  if (existing) {
    console.log(`[trace] startDirect -> reusing existing ${existing.id}`);
    return existing.id;
  }

  const convo = await prisma.conversation.create({
    data: {
      tenantId: tenant.id,
      type: "DIRECT",
      createdById: session.id,
      members: {
        create: [{ userId: session.id }, { userId: otherId }],
      },
    },
  });
  revalidatePath("/messages");
  console.log(`[trace] startDirect -> created ${convo.id}`);
  return convo.id;
}

/** Create a named group with the chosen members (plus me). */
export async function createGroup(formData: FormData): Promise<string | null> {
  const { tenant, session } = await requireTenant();
  const name = str(formData.get("name"));
  const memberIds = formData.getAll("members").map((m) => String(m));
  if (!name || memberIds.length === 0) return null;

  const ids = [...new Set([session.id, ...memberIds])];
  const valid = await prisma.user.findMany({
    where: { id: { in: ids }, tenantId: tenant.id },
    select: { id: true },
  });

  const convo = await prisma.conversation.create({
    data: {
      tenantId: tenant.id,
      type: "GROUP",
      name,
      createdById: session.id,
      members: { create: valid.map((u) => ({ userId: u.id })) },
    },
  });
  revalidatePath("/messages");
  return convo.id;
}

/** Save an uploaded image and return its public URL. */
export async function uploadAttachment(
  formData: FormData,
): Promise<{ url: string; type: string } | null> {
  await requireTenant();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > 8 * 1024 * 1024) return null; // 8MB cap

  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().slice(0, 5);
  const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), bytes);
  return {
    url: `/uploads/${name}`,
    type: file.type.startsWith("image/") ? "image" : "file",
  };
}

/** Send a message: body + optional reply + optional attachment. Handles
 *  @mentions and notifies the other members. */
export async function sendMessage(formData: FormData) {
  const { tenant, session } = await requireTenant();
  const conversationId = str(formData.get("conversationId"));
  const body = str(formData.get("body"));
  const parentId = str(formData.get("parentId")) || null;
  const attachmentUrl = str(formData.get("attachmentUrl")) || null;
  const attachmentType = str(formData.get("attachmentType")) || null;
  if (!conversationId || (!body && !attachmentUrl)) return;

  // Must be a member.
  const membership = await prisma.conversationMember.findFirst({
    where: { conversationId, userId: session.id },
    include: {
      conversation: {
        include: { members: { include: { user: true } } },
      },
    },
  });
  if (!membership) return;

  const msg = await prisma.message.create({
    data: {
      tenantId: tenant.id,
      conversationId,
      senderId: session.id,
      body,
      parentId,
      attachmentUrl,
      attachmentType,
    },
  });

  // Bump conversation + mark my own read pointer to now.
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });
  await prisma.conversationMember.update({
    where: { id: membership.id },
    data: { lastReadAt: new Date() },
  });

  // Notifications: everyone else gets an unread; @mentioned members get a
  // stronger "mentioned you" alert.
  const members = membership.conversation.members.filter(
    (m) => m.userId !== session.id,
  );
  const mentioned = new Set(
    members
      .filter((m) => {
        const first = m.user.name.split(" ")[0].toLowerCase();
        const full = m.user.name.toLowerCase();
        const b = body.toLowerCase();
        return (
          b.includes(`@${full}`) ||
          b.includes(`@${first}`) ||
          b.includes("@everyone") ||
          b.includes("@all")
        );
      })
      .map((m) => m.userId),
  );

  const title = membership.conversation.name
    ? membership.conversation.name
    : session.name;
  const preview = body || (attachmentType === "image" ? "📷 Photo" : "Attachment");

  for (const m of members) {
    await notifyUser(m.userId, {
      tenantId: tenant.id,
      type: mentioned.has(m.userId) ? "CHAT_MENTION" : "CHAT_MESSAGE",
      title: mentioned.has(m.userId)
        ? `${session.name} mentioned you`
        : `New message · ${title}`,
      body: `${session.name}: ${preview}`.slice(0, 140),
    });
  }

  revalidatePath("/messages");
  revalidatePath(`/messages/${conversationId}`);
  return { id: msg.id };
}

/** Toggle a heart on a message. */
export async function toggleReaction(formData: FormData) {
  const { session } = await requireTenant();
  const messageId = str(formData.get("messageId"));
  const emoji = str(formData.get("emoji")) || "❤️";
  if (!messageId) return;

  const existing = await prisma.messageReaction.findFirst({
    where: { messageId, userId: session.id, emoji },
  });
  if (existing) {
    await prisma.messageReaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.messageReaction.create({
      data: { messageId, userId: session.id, emoji },
    });
  }
  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    select: { conversationId: true },
  });
  if (msg) revalidatePath(`/messages/${msg.conversationId}`);
}

/** Mark a conversation read up to now (clears its unread badge). */
export async function markConversationRead(conversationId: string) {
  const { session } = await requireTenant();
  await prisma.conversationMember.updateMany({
    where: { conversationId, userId: session.id },
    data: { lastReadAt: new Date() },
  });
  revalidatePath("/messages");
}
