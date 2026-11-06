import "server-only";
import { prisma } from "./prisma";
import { totalUnread } from "./chat";
import { opsWhere, opsWhereVia, type BranchScope } from "./scope";
import type { SessionUser } from "./auth";

/**
 * The numbers on the sidebar badges.
 *
 * Written once and read from two places: the layout, which renders them on a
 * full page load, and /api/badges, which the sidebar polls so a queue that
 * fills while someone is sitting in the app actually lights up.
 *
 * Two copies of these queries would drift, and a badge that disagrees with
 * the page it points at is worse than no badge: it teaches people to ignore
 * it. Hence one function.
 */
export type SidebarCounts = {
  unreadChat: number;
  pendingSwaps: number;
  pendingLeave: number;
  pendingTimesheets: number;
  pendingApprovals: number;
  pendingAdmins: number;
  openIncidents: number;
};

export async function loadSidebarCounts(
  session: SessionUser,
  scope: BranchScope,
): Promise<SidebarCounts> {
  const isManager =
    session.role === "ADMIN" ||
    session.role === "SUPER_ADMIN" ||
    session.role === "COORDINATOR";
  const superAdmin = session.role === "SUPER_ADMIN";

  // One parallel batch: the database is in Sydney and these used to run
  // back to back on every page load.
  const [
    pendingTimesheets,
    pendingSwaps,
    pendingLeave,
    unreadChat,
    pendingApprovals,
    pendingAdmins,
    openIncidents,
  ] = await Promise.all([
    prisma.shift.count({
      where: {
        tenantId: session.tenantId,
        approval: "PENDING",
        status: "COMPLETED",
        // Badges count only what this account can open.
        ...opsWhere(scope),
      },
    }),
    prisma.shiftSwap.count({
      where: { tenantId: session.tenantId, status: "PENDING", ...opsWhereVia(scope, "shift") },
    }),
    prisma.availability.count({
      where: { tenantId: session.tenantId, status: "PENDING", ...opsWhereVia(scope, "staff") },
    }),
    totalUnread(session.tenantId, session.id),
    isManager
      ? prisma.user.count({
          where: {
            tenantId: session.tenantId,
            status: "PENDING",
            role: "WORKER",
          },
        })
      : Promise.resolve(0),
    superAdmin
      ? prisma.user.count({
          where: {
            tenantId: session.tenantId,
            status: "PENDING",
            role: { in: ["ADMIN", "SUPER_ADMIN"] },
          },
        })
      : Promise.resolve(0),
    isManager
      ? prisma.incident.count({
          where: {
            tenantId: session.tenantId,
            status: { in: ["SUBMITTED", "UNDER_REVIEW"] },
            ...opsWhere(scope),
          },
        })
      : Promise.resolve(0),
  ]);

  return {
    unreadChat,
    pendingSwaps,
    pendingLeave,
    pendingTimesheets,
    pendingApprovals,
    pendingAdmins,
    openIncidents,
  };
}
