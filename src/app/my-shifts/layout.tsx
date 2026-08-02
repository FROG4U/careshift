import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { totalUnread } from "@/lib/chat";
import { notesDueFor } from "@/lib/notesDue";
import { WorkerShell } from "@/components/worker/WorkerShell";
import { NotesGuard } from "@/components/worker/NotesGuard";
import { LocationPinger } from "@/components/worker/LocationPinger";

export default async function WorkerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const [tenant, staff, notifications, chatUnread, pendingCount, notesDue] =
    await Promise.all([
      prisma.tenant.findUnique({ where: { id: session.tenantId } }),
      session.staffId
        ? prisma.staff.findUnique({
            where: { id: session.staffId },
            select: { photoUrl: true },
          })
        : Promise.resolve(null),
      prisma.notification.findMany({
        where: { userId: session.id },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      totalUnread(session.tenantId, session.id).catch(() => 0),
      session.staffId
        ? prisma.shift.count({
            where: {
              tenantId: session.tenantId,
              staffId: session.staffId,
              publishState: "PUBLISHED",
            },
          })
        : Promise.resolve(0),
      session.staffId
        ? notesDueFor(session.tenantId, session.staffId)
        : Promise.resolve([]),
    ]);

  // Ping location only while there's a shift happening around now
  // (from 10 min before the shift to 30 min after it ends).
  const now = Date.now();
  const liveShiftCount = session.staffId
    ? await prisma.shift.count({
        where: {
          tenantId: session.tenantId,
          staffId: session.staffId,
          publishState: "ACCEPTED",
          status: { not: "COMPLETED" },
          start: { lte: new Date(now + 10 * 60_000) },
          OR: [
            { end: { gte: new Date(now - 30 * 60_000) } },
            { status: "IN_PROGRESS" },
          ],
        },
      })
    : 0;

  return (
    <>
      <LocationPinger enabled={liveShiftCount > 0} />
      <WorkerShell
        brand={tenant?.brandColor || "#003146"}
        accent={tenant?.accentColor || "#886949"}
        tenantName={tenant?.name ?? "CareShift"}
        firstName={session.name.split(" ")[0]}
        photoUrl={staff?.photoUrl ?? null}
        notifications={notifications}
        chatUnread={chatUnread}
        pendingCount={pendingCount}
      >
        {children}
      </WorkerShell>
      <NotesGuard dues={notesDue} />
    </>
  );
}
