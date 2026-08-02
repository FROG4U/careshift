import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WorkerCalendar, type CalShift } from "@/components/worker/WorkerCalendar";

export default async function CalendarPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.staffId) redirect("/dashboard");

  const account = await prisma.user.findUnique({
    where: { id: session.id },
    select: { status: true },
  });
  if (!account || account.status !== "APPROVED") redirect("/pending");

  const me = await prisma.staff.findUnique({
    where: { id: session.staffId },
    select: { branchId: true },
  });
  const branchWhere = me?.branchId ? { branchId: me.branchId } : {};

  // A window around today so the worker can look back a month and ahead two.
  const from = new Date();
  from.setMonth(from.getMonth() - 1, 1);
  from.setHours(0, 0, 0, 0);
  const to = new Date();
  to.setMonth(to.getMonth() + 2, 1);
  to.setHours(0, 0, 0, 0);

  const shifts = await prisma.shift.findMany({
    where: {
      tenantId: session.tenantId,
      staffId: session.staffId,
      start: { gte: from, lt: to },
      publishState: { in: ["PUBLISHED", "ACCEPTED"] },
      ...branchWhere,
    },
    include: { client: true },
    orderBy: { start: "asc" },
  });

  const calShifts: CalShift[] = shifts.map((s) => ({
    id: s.id,
    startIso: s.start.toISOString(),
    endIso: s.end.toISOString(),
    client: `${s.client.firstName} ${s.client.lastName}`,
    address: s.client.address,
    publishState: s.publishState,
    status: s.status,
  }));

  return <WorkerCalendar shifts={calShifts} />;
}
