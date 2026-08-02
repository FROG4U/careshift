import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AdminSidebar } from "@/components/AdminSidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { logoutAction } from "./actions";
import { totalUnread } from "@/lib/chat";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
  });
  if (!tenant) redirect("/login");

  const brand = tenant.brandColor || "#2563a8";

  const notifications = await prisma.notification.findMany({
    where: { userId: session.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  // Timesheets awaiting approval — drives the sidebar count badge.
  const pendingTimesheets = await prisma.shift.count({
    where: { tenantId: tenant.id, approval: "PENDING", status: "COMPLETED" },
  });

  // Shift swaps awaiting a manager decision.
  const pendingSwaps = await prisma.shiftSwap.count({
    where: { tenantId: tenant.id, status: "PENDING" },
  });

  // Time-off / availability requests awaiting a decision.
  const pendingLeave = await prisma.availability.count({
    where: { tenantId: tenant.id, status: "PENDING" },
  });

  // Not-yet-approved accounts never reach the management area.
  if (session.status !== "APPROVED") redirect("/pending");

  // Payroll is restricted to admins/coordinators.
  const isManager =
    session.role === "ADMIN" || session.role === "COORDINATOR";

  // Unread chat messages → Messages nav badge.
  const unreadChat = await totalUnread(tenant.id, session.id);

  // Support workers awaiting approval → Approvals nav badge (managers only).
  const pendingApprovals = isManager
    ? await prisma.user.count({
        where: { tenantId: tenant.id, status: "PENDING", role: "WORKER" },
      })
    : 0;

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
    </div>
  );
}
