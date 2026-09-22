import "server-only";
import { prisma } from "./prisma";
import { loadScope } from "./scope";
import type { SessionUser } from "./auth";

const MANAGER_ROLES = ["SUPER_ADMIN", "ADMIN", "COORDINATOR"];

/**
 * Who this person may START a conversation with, as a `where` fragment for
 * `prisma.user` (the caller adds tenantId).
 *
 * Chat used to be the whole company: a Perth worker could message anyone at
 * head office and the other way round. Now:
 * - head office accounts (all branches) - everyone, as before;
 * - a branch-restricted admin - the people in the branches they have the
 *   Messaging tick for;
 * - a worker - their own branch's colleagues, head office, and any manager
 *   with Messaging for their branch.
 *
 * It only governs starting a chat. Anyone already in a conversation can keep
 * replying in it, so head office can always open a line to a branch manager.
 */
export async function messageableWhere(session: SessionUser) {
  if (session.role !== "WORKER") {
    const scope = await loadScope(session);
    if (scope.all) return {};
    return {
      OR: [
        { staff: { branchId: { in: scope.message } } },
        // Other managers who share one of those branches.
        { branchAccess: { some: { branchId: { in: scope.message }, message: true } } },
      ],
    };
  }

  const me = session.staffId
    ? await prisma.staff.findUnique({
        where: { id: session.staffId },
        select: { branchId: true },
      })
    : null;
  const headOffice = {
    role: { in: MANAGER_ROLES },
    allBranches: true,
  };
  if (!me?.branchId) return { OR: [headOffice, { role: "SUPER_ADMIN" }] };
  return {
    OR: [
      { staff: { branchId: me.branchId } },
      headOffice,
      { role: "SUPER_ADMIN" },
      { branchAccess: { some: { branchId: me.branchId, message: true } } },
    ],
  };
}
