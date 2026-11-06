import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pendingBroadcastFor } from "@/lib/broadcast";
import { BroadcastGuard } from "@/components/BroadcastGuard";
import { AdminSidebar } from "@/components/AdminSidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { logoutAction } from "./actions";
import { InstallPrompt } from "@/components/InstallPrompt";
import { PushRegistrar } from "@/components/PushRegistrar";
import { AdminBottomNav } from "@/components/AdminBottomNav";
import { PresenceHeartbeat } from "@/components/PresenceHeartbeat";
import { CallCentre } from "@/components/CallCentre";
import { UpdateWatcher } from "@/components/UpdateWatcher";
import { buildId } from "@/lib/buildId";
import { loadScope, canSeeAnyCharges } from "@/lib/scope";
import { loadSidebarCounts } from "@/lib/sidebarCounts";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  // Not-yet-approved accounts never reach the management area.
  if (session.status !== "APPROVED") redirect("/pending");

  // Payroll etc. are restricted to admins/coordinators.
  const isManager =
    session.role === "ADMIN" ||
    session.role === "SUPER_ADMIN" ||
    session.role === "COORDINATOR";
  const adminLevel =
    session.role === "ADMIN" || session.role === "SUPER_ADMIN";
  const superAdmin = session.role === "SUPER_ADMIN";
  // Which screens their branch access opens (see lib/scope).
  const scope = await loadScope(session);
  const access = {
    payroll: scope.all || scope.ops.length > 0,
    charges: canSeeAnyCharges(scope, session.role),
    headOffice: scope.headOffice,
  };

  // Tenant, notifications and the badge counts, in one go. These used to run
  // sequentially - with the database in Sydney and the app abroad, seven
  // round-trips stacked up on every page load (~10s). Running them together
  // collapses that to one.
  //
  // The counts come from lib/sidebarCounts, which /api/badges also uses, so
  // the number on a badge and the number the poll replaces it with are worked
  // out by the same code.
  const [tenant, notifications, counts, broadcast] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.tenantId } }),
    prisma.notification.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    loadSidebarCounts(session, scope),
    pendingBroadcastFor(session.id),
  ]);
  if (!tenant) redirect("/login");

  const brand = tenant.brandColor || "#2563a8";

  return (
    <div
      // h-dvh, not min-h-screen. The sidebar's nav list is already built to
      // scroll on its own (flex-1 + overflow-y-auto), but a *minimum* height
      // gave it no ceiling: with more nav items than fit, the aside grew past
      // the viewport — 1115px against an 866px window on Danu's screen — and
      // dragged the whole row with it. The page then scrolled, and the chat
      // composer lifted off the bottom with dead space beneath it.
      className="flex h-dvh overflow-hidden"
      style={{
        ["--brand" as string]: brand,
        ["--accent" as string]: tenant.accentColor || "#886949",
      }}
    >
      {/* Sidebar — grouped, collapsible, navy/bronze */}
      <AdminSidebar
        tenantName={tenant.name}
        logoUrl={tenant.logoUrl}
        name={session.name}
        email={session.email}
        isManager={isManager}
        isAdmin={adminLevel}
        isSuperAdmin={superAdmin}
        access={access}
        counts={counts}
        logout={logoutAction}
      />

      {/* Main content */}
      {/* The app shell scrolls here, not on the page. h-dvh (a DEFINITE
          height, not min-h) is what lets a full-height child claim the space
          left over via `flex-1 min-h-0` — with min-h-dvh there's nothing for
          it to size against and it grows to fit its content instead, which is
          what pushed the chat composer off the bottom of the screen. */}
      <main className="flex h-dvh flex-1 flex-col overflow-x-hidden overflow-y-auto bg-[var(--background)] pb-28 md:pb-0">
        {/* Top header bar — notifications on the right */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-end gap-2 border-b border-[var(--border)] bg-[var(--background)] pl-6 pr-3">
          <NotificationBell notifications={notifications} />
        </header>
        {children}
      </main>
      <AdminBottomNav
        unreadChat={counts.unreadChat}
        pendingTimesheets={counts.pendingTimesheets}
      />
      {broadcast && <BroadcastGuard item={broadcast} />}
      <InstallPrompt />
      <PushRegistrar />
      <UpdateWatcher buildId={buildId()} />
      <PresenceHeartbeat />
      <CallCentre myName={session.name} />
    </div>
  );
}
