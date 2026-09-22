import "server-only";
import { cache } from "react";
import { prisma } from "./prisma";
import { isSuperAdmin } from "./roles";
import type { SessionUser } from "./auth";

/**
 * Which branches this account may see, and in what way - from the ticks on
 * their profile (Admin page), per group: the whole of HQ, or one branch run
 * separately such as Perth.
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
   * Every branch, including records with no branch set at all. Anyone whose
   * access hasn't been set up yet (User.allBranches) - so nothing changed for
   * existing admins until their ticks are saved.
   */
  all: boolean;
  /** Branch ids for shifts, participants, workers, timesheets. */
  ops: string[];
  /** Branch ids for wages, pay runs, charges and money figures. */
  finance: string[];
  /** Branch ids whose people they may message or announce to. */
  message: string[];
  /**
   * Head office: ticked for the whole of HQ. They also see records with no
   * branch (placing those is head office's job) and handle company-wide
   * settings.
   */
  headOffice: boolean;
};

export const ALL_BRANCHES: BranchScope = {
  all: true,
  ops: [],
  finance: [],
  message: [],
  headOffice: true,
};

export const loadScope = cache(async (session: SessionUser): Promise<BranchScope> => {
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      allBranches: true,
      branchAccess: {
        select: { hqGroup: true, branchId: true, ops: true, finance: true, message: true },
      },
    },
  });
  if (!user) return { all: false, ops: [], finance: [], message: [], headOffice: false };
  if (user.allBranches) return ALL_BRANCHES;

  // "Whole of HQ" means the HQ branches as they are right now, so a branch
  // added to HQ later is covered without anyone re-ticking.
  const rows = user.branchAccess;
  const hqIds = rows.some((r) => r.hqGroup)
    ? (
        await prisma.branch.findMany({
          where: { tenantId: session.tenantId, hq: true },
          select: { id: true },
        })
      ).map((b) => b.id)
    : [];
  const idsFor = (r: (typeof rows)[number]) =>
    r.hqGroup ? hqIds : r.branchId ? [r.branchId] : [];
  const collect = (k: "ops" | "finance" | "message") => [
    ...new Set(rows.filter((r) => r[k]).flatMap(idsFor)),
  ];

  return {
    all: false,
    ops: collect("ops"),
    finance: collect("finance"),
    message: collect("message"),
    headOffice: rows.some((r) => r.hqGroup && r.ops),
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
  if (scope.all) return {};
  // Head office also sees records nobody has placed in a branch yet.
  return scope.headOffice
    ? { OR: [{ branchId: { in: scope.ops } }, { branchId: null }] }
    : { branchId: { in: scope.ops } };
}

export function financeWhere(scope: BranchScope) {
  return scope.all ? {} : { branchId: { in: scope.finance } };
}

/** The same, for a model that reaches a branch through a relation. */
export function opsWhereVia(scope: BranchScope, relation: string) {
  if (scope.all) return {};
  return { [relation]: opsWhere(scope) };
}

export function canOps(scope: BranchScope, branchId: string | null): boolean {
  if (scope.all) return true;
  if (branchId == null) return scope.headOffice;
  return scope.ops.includes(branchId);
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
 * Accounts not yet set up keep the rule they always had (super admins only),
 * so switching this feature on changed nothing for them. Once someone's ticks
 * are saved, the Finances tick decides - "Whole of HQ finances", "Whole of
 * Perth finances".
 */
export function canSeeCharges(scope: BranchScope, role: string, branchId: string | null): boolean {
  if (scope.all) return isSuperAdmin(role);
  return canFinance(scope, branchId);
}

/** Whether any Sales/charges view should be offered at all. */
export function canSeeAnyCharges(scope: BranchScope, role: string): boolean {
  if (scope.all) return isSuperAdmin(role);
  return scope.finance.length > 0;
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
  // Head office may leave a record unplaced, as before.
  if (!wanted && scope.headOffice) return { ok: true, branchId: null };
  if (!wanted && scope.ops.length === 1) return { ok: true, branchId: scope.ops[0] };
  return { ok: false };
}
