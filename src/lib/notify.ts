import "server-only";
import { prisma } from "./prisma";
import { sendPushToUsers } from "./push";

type NotifyInput = {
  tenantId: string;
  type: string;
  title: string;
  body?: string | null;
  shiftId?: string | null;
  /** Where tapping the phone notification should land. Defaults by type. */
  url?: string;
};

/**
 * Where a notification should take you when tapped. Workers land in the
 * worker app, managers in the admin screens.
 */
function urlFor(n: NotifyInput): string {
  if (n.url) return n.url;
  switch (n.type) {
    case "SHIFT_PUBLISHED":
      return "/my-shifts/pending";
    case "SHIFT_ACCEPTED":
    case "SHIFT_REJECTED":
    case "SHIFT_REASSIGNED":
      return "/schedule";
    case "MESSAGE":
    case "MENTION":
      return "/messages";
    case "SWAP_REQUESTED":
      return "/swaps";
    case "WORKER_REGISTERED":
      return "/approvals";
    case "LEAVE_REQUESTED":
      return "/leave";
    default:
      return "/";
  }
}

/** Notify a single user — saved in-app, and pushed to their devices. */
export async function notifyUser(userId: string, n: NotifyInput) {
  await prisma.notification.create({
    data: {
      tenantId: n.tenantId,
      userId,
      type: n.type,
      title: n.title,
      body: n.body ?? null,
      shiftId: n.shiftId ?? null,
    },
  });
  await sendPushToUsers([userId], {
    title: n.title,
    body: n.body,
    url: urlFor(n),
  });
}

/** Notify the worker whose login is linked to this staff member (if any). */
export async function notifyWorker(staffId: string, n: NotifyInput) {
  const user = await prisma.user.findFirst({
    where: { tenantId: n.tenantId, staffId },
    select: { id: true },
  });
  if (user) await notifyUser(user.id, n);
}

async function notifyRoles(roles: string[], n: NotifyInput) {
  const users = await prisma.user.findMany({
    where: { tenantId: n.tenantId, role: { in: roles } },
    select: { id: true },
  });
  if (users.length === 0) return;
  await prisma.notification.createMany({
    data: users.map((m) => ({
      tenantId: n.tenantId,
      userId: m.id,
      type: n.type,
      title: n.title,
      body: n.body ?? null,
      shiftId: n.shiftId ?? null,
    })),
  });
  await sendPushToUsers(
    users.map((m) => m.id),
    { title: n.title, body: n.body, url: urlFor(n) },
  );
}

/** Notify every super admin / admin / coordinator in the tenant. */
export async function notifyManagers(n: NotifyInput) {
  await notifyRoles(["SUPER_ADMIN", "ADMIN", "COORDINATOR"], n);
}

/** Notify only super admins (e.g. an admin invite was accepted / needs approval). */
export async function notifySuperAdmins(n: NotifyInput) {
  await notifyRoles(["SUPER_ADMIN"], n);
}
