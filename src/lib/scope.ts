import "server-only";
import { cache } from "react";
import { prisma } from "./prisma";
import { isSuperAdmin } from "./roles";
import type { SessionUser } from "./auth";

/**
 * Which branches this account may see, and in what way.
 *
 * Branch was only ever a data column and a UI filter: every admin screen read
 * the whole tenant. A branch manager needs the opposite - Perth and nothing
 * else - so the scope is resolved here, per request, and the queries ask it
 * rather than each page inventing its own rule.
 *
 * Read from the database, not the login token: the token is only minted at
 * login and never refreshed, so a permission change would otherwise not take
 * effect until the person signed in again.
 */
export type BranchScope = {
  /**
   * Every branch, including records with no branch set at all. Super admins
   * always; anyone left on User.allBranches (the default, so nothing changed
   * for existing admins).
   */
  all: boolean;
  /** Branch ids for shifts, participants, workers, timesheets. */
  ops: string[];
  /** Branch ids for wages, pay runs, charges and money figures. */
  finance: string[];
  /** Branch ids whose people they may message or announce to. */
  message: string[];
};

export const ALL_BRANCHES: BranchScope = { all: true, ops: [], finance: [], message: [] };

export const loadScope = cache(async (session: SessionUser): Promise<BranchScope> => {
  if (isSuperAdmin(session.role)) return ALL_BRANCHES;

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      allBranches: true,
      branchAccess: { select: { branchId: true, ops: true, finance: true, message: true } },
    },
  });
  if (!user || user.allBranches) return ALL_BRANCHES;

  return {
    all: false,
    ops: user.branchAccess.filter((a) => a.ops).map((a) => a.branchId),
    finance: user.branchAccess.filter((a) => a.finance).map((a) => a.branchId),
    message: user.branchAccess.filter((a) => a.message).map((a) => a.branchId),
  };
});

/**
 * A `where` fragment for any model with a branchId.
 *
 * Spread it into a query: `where: { tenantId, ...opsWhere(scope) }`. For an
 * all-branches account it adds nothing. For a restricted one it limits to
 * their branches, which also hides records with no branch set - those belong
 * to nobody, so only head office should be dealing with them.
 */
export function opsWhere(scope: BranchScope) {
  return scope.all ? {} : { branchId: { in: scope.ops } };
}

export function financeWhere(scope: BranchScope) {
  return scope.all ? {} : { branchId: { in: scope.finance } };
}

/** The same, for a model that reaches a branch through a relation. */
export function opsWhereVia(scope: BranchScope, relation: string) {
  return scope.all ? {} : { [relation]: { branchId: { in: scope.ops } } };
}

export function canOps(scope: BranchScope, branchId: string | null): boolean {
  if (scope.all) return true;
  return branchId != null && scope.ops.includes(branchId);
}

export function canFinance(scope: BranchScope, branchId: string | null): boolean {
  if (scope.all) return true;
  return branchId != null && scope.finance.includes(branchId);
}

export function canMessage(scope: BranchScope, branchId: string | null): boolean {
  if (scope.all) return true;
  return branchId != null && scope.message.includes(branchId);
}

/** True when they can see money for at least one branch (gates the whole screen). */
export function hasAnyFinance(scope: BranchScope): boolean {
  return scope.all || scope.finance.length > 0;
}

/** Branch ids to show in a picker, or null for "every branch". */
export function pickableBranchIds(scope: BranchScope): string[] | null {
  return scope.all ? null : scope.ops;
}

/** For `prisma.branch.findMany`: only the branches they can see. */
export function visibleBranchWhere(scope: BranchScope) {
  return scope.all ? {} : { id: { in: scope.ops } };
}

/**
 * Participant charges and the Sales figures for a branch.
 *
 * Head office accounts left on "All branches" keep the rule they always had
 * (super admins only), so switching this feature on changed nothing for them.
 * A branch-restricted account sees money only where it has the Finances tick.
 */
export function canSeeCharges(scope: BranchScope, role: string, branchId: string | null): boolean {
  if (isSuperAdmin(role)) return true;
  if (scope.all) return false;
  return canFinance(scope, branchId);
}

/** Whether any Sales/charges view should be offered at all. */
export function canSeeAnyCharges(scope: BranchScope, role: string): boolean {
  if (isSuperAdmin(role)) return true;
  return !scope.all && scope.finance.length > 0;
}

/**
 * Payroll: managers as before; a branch-restricted account only sees pay for
 * branches with the Finances tick.
 */
export function payrollBranchIds(scope: BranchScope): string[] | null {
  return scope.all ? null : scope.finance;
}

/**
 * The branch to file a new or edited record under.
 *
 * Head office can use any branch, or none. A branch manager must use one of
 * theirs - and when they only have one, it's filled in for them, so they
 * never create a participant or worker that falls outside their own view.
 */
export function resolveBranch(
  scope: BranchScope,
  wanted: string | null,
): { ok: true; branchId: string | null } | { ok: false } {
  if (scope.all) return { ok: true, branchId: wanted };
  if (wanted && scope.ops.includes(wanted)) return { ok: true, branchId: wanted };
  if (!wanted && scope.ops.length === 1) return { ok: true, branchId: scope.ops[0] };
  return { ok: false };
}
