"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { destroySession, getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

/** Heartbeat: mark the signed-in user active now (drives the chat "Online" dot). */
export async function pingPresence() {
  const session = await getSession();
  if (!session) return;
  await prisma.user.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() },
  });
}

/** Mark all of the signed-in user's notifications as read. */
export async function markNotificationsRead() {
  const session = await getSession();
  if (!session) return;
  await prisma.notification.updateMany({
    where: { userId: session.id, read: false },
    data: { read: true },
  });
  revalidatePath("/my-shifts");
  revalidatePath("/dashboard");
}
