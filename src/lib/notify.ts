import "server-only";
import { prisma } from "./prisma";

type NotifyInput = {
  tenantId: string;
  type: string;
  title: string;
  body?: string | null;
  shiftId?: string | null;
};

/** Notify a single user. */
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
}

/** Notify every super admin / admin / coordinator in the tenant. */
export async function notifyManagers(n: NotifyInput) {
  await notifyRoles(["SUPER_ADMIN", "ADMIN", "COORDINATOR"], n);
}

/** Notify only super admins (e.g. an admin invite was accepted / needs approval). */
export async function notifySuperAdmins(n: NotifyInput) {
  await notifyRoles(["SUPER_ADMIN"], n);
}
