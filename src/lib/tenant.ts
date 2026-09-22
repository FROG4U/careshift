import "server-only";
import { prisma } from "./prisma";
import { redirect } from "next/navigation";
import { getSession } from "./auth";
import { loadScope, type BranchScope } from "./scope";

/** The current user's tenant, with branding. Sends a logged-out user to the login page. */
export async function requireTenant() {
  const session = await getSession();
  // An expired login used to throw here, so saving a form crashed with a
  // server error instead of asking the admin to sign in again.
  if (!session) redirect("/login");
  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
  });
  if (!tenant) throw new Error("Tenant not found");
  return { session, tenant };
}

/**
 * The tenant plus which branches this account may see (see lib/scope).
 *
 * Use this instead of requireTenant on any screen or action that touches
 * branch-owned data - shifts, participants, workers, money - so a branch
 * manager is limited to their own branch even if they type the URL.
 */
export async function requireScope(): Promise<{
  session: Awaited<ReturnType<typeof getSession>> & object;
  tenant: NonNullable<Awaited<ReturnType<typeof prisma.tenant.findUnique>>>;
  scope: BranchScope;
}> {
  const { session, tenant } = await requireTenant();
  const scope = await loadScope(session);
  return { session, tenant, scope };
}
