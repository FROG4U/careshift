import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AdminSidebar } from "@/components/AdminSidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { logoutAction } from "./actions";
import { totalUnread } from "@/lib/chat";
import { InstallPrompt } from "@/components/InstallPrompt";

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
    session.role === "ADMIN" || session.role === "COORDINATOR";

  // Fetch everything the layout needs in ONE parallel batch. These used to run
  // sequentially — with the DB in Sydney and the app abroad, ~7 round-trips
  // stacked back-to-back on every page load (~10s). Running them together
  // collapses that to a single round-trip. All scope by session.tenantId so
  // none has to wait for the tenant lookup first.
  const [
    tenant,
    notifications,
    pendingTimesheets,
    pendingSwaps,
    pendingLeave,
    unreadChat,
    pendingApprovals,
  ] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.tenantId } }),
    prisma.notification.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.shift.count({
      where: {
        tenantId: session.tenantId,
        approval: "PENDING",
        status: "COMPLETED",
      },
    }),
    prisma.shiftSwap.count({
      where: { tenantId: session.tenantId, status: "PENDING" },
    }),
    prisma.availability.count({
      where: { tenantId: session.tenantId, status: "PENDING" },
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
  ]);
  if (!tenant) redirect("/login");

  const brand = tenant.brandColor || "#2563a8";

  return (
    <div
      className="flex min-h-screen"
      style={{
        ["--brand" as string]: brand,
        ["--accent" as string]: tenant.accentColor || "#886949",
      }}
    >
      {/* Sidebar — grouped, collapsible, navy/bronze */}
      <AdminSidebar
        tenantName={tenant.name}
        name={session.name}
        email={session.email}
        isManager={isManager}
        counts={{
          unreadChat,
          pendingSwaps,
          pendingLeave,
          pendingTimesheets,
          pendingApprovals,
        }}
        logout={logoutAction}
      />

      {/* Main content */}
      <main className="flex-1 overflow-x-hidden bg-[var(--background)]">
        {/* Top header bar — notifications on the right */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-end gap-2 border-b border-[var(--border)] bg-[var(--background)]/80 pl-6 pr-3 backdrop-blur">
          <NotificationBell notifications={notifications} />
        </header>
        {children}
      </main>
      <InstallPrompt />
    </div>
  );
}
