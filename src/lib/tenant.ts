import "server-only";
import { prisma } from "./prisma";
import { redirect } from "next/navigation";
import { getSession } from "./auth";

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
