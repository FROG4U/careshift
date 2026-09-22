import "server-only";
import { prisma } from "./prisma";
import { sendPushToUsers } from "./push";

type NotifyInput = {
  tenantId: string;
  type: string;
  title: string;
  body?: string | null;
  shiftId?: string | null;
  /**
   * The branch this is about. Manager alerts go only to managers who can see
   * it (plus head office). Worked out from shiftId when that's given.
   */
  branchId?: string | null;
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
    case "ANNOUNCEMENT":
      // The popup finds them wherever they land, so the app root is fine and
      // works for workers and admins alike.
      return "/";
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
  // Which branch it concerns: given, or read from the shift it's about.
  let branchId = n.branchId ?? null;
  if (branchId == null && n.shiftId) {
    const shift = await prisma.shift.findUnique({
      where: { id: n.shiftId },
      select: { branchId: true },
    });
    branchId = shift?.branchId ?? null;
  }

  // Every manager used to get every alert - a Perth worker running late
  // buzzed head office and every other branch. Now it goes to whoever has
  // "Shifts & people" for that group: Whole of HQ for an HQ branch, Whole of
  // Perth for Perth. Anything with no branch goes to head office. Removed or
  // pending accounts get none.
  // Is it an HQ branch (covered by "Whole of HQ") or one run separately?
  const inHq = branchId
    ? ((await prisma.branch.findUnique({ where: { id: branchId }, select: { hq: true } }))
        ?.hq ?? true)
    : true;
  const users = await prisma.user.findMany({
    where: {
      tenantId: n.tenantId,
      role: { in: roles },
      status: "APPROVED",
      OR: [
        { allBranches: true },
        ...(inHq ? [{ branchAccess: { some: { hqGroup: true, ops: true } } }] : []),
        ...(branchId && !inHq ? [{ branchAccess: { some: { branchId, ops: true } } }] : []),
      ],
    },
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
