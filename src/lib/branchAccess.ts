import "server-only";
import { prisma } from "./prisma";

/** One row of ticks from the Admin page: "HQ" or a branch id. */
export type GroupTicks = { key: string; ops?: boolean; finance?: boolean; message?: boolean };

/** Read a JSON list of group ticks, or null if it isn't one. */
export function parseGroups(raw: unknown): GroupTicks[] | null {
  try {
    const parsed = JSON.parse(String(raw ?? "[]"));
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((g) => g && typeof g.key === "string");
  } catch {
    return null;
  }
}

/**
 * The BranchAccess rows for these ticks: only real branches of this company
 * (or the whole of HQ), and only rows with something ticked.
 */
export async function accessRows(tenantId: string, userId: string, groups: GroupTicks[]) {
  const real = new Set(
    (await prisma.branch.findMany({ where: { tenantId }, select: { id: true } })).map((b) => b.id),
  );
  return groups
    .filter((g) => g.ops || g.finance || g.message)
    .filter((g) => g.key === "HQ" || real.has(g.key))
    .map((g) => ({
      tenantId,
      userId,
      hqGroup: g.key === "HQ",
      branchId: g.key === "HQ" ? null : g.key,
      ops: Boolean(g.ops),
      finance: Boolean(g.finance),
      message: Boolean(g.message),
    }));
}
