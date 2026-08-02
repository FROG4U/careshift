import "server-only";
import { prisma } from "./prisma";
import { getSession } from "./auth";

/** The current user's tenant, with branding. Throws if not logged in. */
export async function requireTenant() {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
  });
  if (!tenant) throw new Error("Tenant not found");
  return { session, tenant };
}
