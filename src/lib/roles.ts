// Role capability helpers. A SUPER_ADMIN can do everything an ADMIN can, plus
// manage other admins (invite / approve / promote). Use these everywhere
// instead of comparing role strings directly, so SUPER_ADMIN never gets locked
// out of an admin-gated screen or action.

/** The top tier — can manage other admins. */
export function isSuperAdmin(role: string): boolean {
  return role === "SUPER_ADMIN";
}

/** Admin-level access (admin or super admin). */
export function isAdmin(role: string): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

/** Management area access (admins, super admins, coordinators). */
export function isManager(role: string): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN" || role === "COORDINATOR";
}
