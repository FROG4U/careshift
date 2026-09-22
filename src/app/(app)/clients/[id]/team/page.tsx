import { notFound } from "next/navigation";
import { requireScope } from "@/lib/tenant";
import { opsWhere } from "@/lib/scope";
import { prisma } from "@/lib/prisma";
import { TeamClient, type TeamMember, type StaffOption } from "./TeamClient";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { tenant, scope } = await requireScope();
  const { id } = await params;

  const client = await prisma.client.findFirst({
    where: { id, tenantId: tenant.id, ...opsWhere(scope) },
    include: {
      workers: {
        include: { staff: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!client) notFound();

  const allStaff = await prisma.staff.findMany({
    where: { tenantId: tenant.id, ...opsWhere(scope), active: true },
    orderBy: { firstName: "asc" },
  });

  const allocated: TeamMember[] = client.workers.map((w) => ({
    id: w.id,
    staffId: w.staffId,
    name: `${w.staff.firstName} ${w.staff.lastName}`,
    title: w.staff.title ?? "",
  }));

  const allocatedIds = new Set(allocated.map((a) => a.staffId));
  const available: StaffOption[] = allStaff
    .filter((s) => !allocatedIds.has(s.id))
    .map((s) => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName}`,
      title: s.title ?? "",
    }));

  return (
    <TeamClient
      clientId={client.id}
      clientName={`${client.firstName} ${client.lastName}`}
      allocated={allocated}
      available={available}
    />
  );
}
