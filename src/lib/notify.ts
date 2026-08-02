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

/** Notify every admin / coordinator in the tenant. */
export async function notifyManagers(n: NotifyInput) {
  const managers = await prisma.user.findMany({
    where: { tenantId: n.tenantId, role: { in: ["ADMIN", "COORDINATOR"] } },
    select: { id: true },
  });
  if (managers.length === 0) return;
  await prisma.notification.createMany({
    data: managers.map((m) => ({
      tenantId: n.tenantId,
      userId: m.id,
      type: n.type,
      title: n.title,
      body: n.body ?? null,
      shiftId: n.shiftId ?? null,
    })),
  });
}
