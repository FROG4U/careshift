import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { isManager } from "@/lib/roles";
import { TaskTemplates } from "./TaskTemplates";

export const dynamic = "force-dynamic";

export default async function ClientTasksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { tenant, session } = await requireTenant();
  if (!isManager(session.role)) redirect("/dashboard");

  const { id } = await params;
  const client = await prisma.client.findFirst({
    where: { id, tenantId: tenant.id },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!client) notFound();

  const templates = await prisma.taskTemplate.findMany({
    where: { clientId: client.id },
    orderBy: { sortOrder: "asc" },
  });

  // How many upcoming shifts these will land on, so the effect is visible.
  const upcoming = await prisma.shift.count({
    where: {
      tenantId: tenant.id,
      clientId: client.id,
      start: { gte: new Date() },
      status: { in: ["SCHEDULED", "IN_PROGRESS"] },
    },
  });

  return (
    <div className="mx-auto max-w-3xl p-6 lg:p-8">
      <Link
        href={`/clients/${client.id}`}
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <span className="material-symbols-rounded text-[18px]">arrow_back</span>
        {client.firstName} {client.lastName}
      </Link>

      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          Shift tasks
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          What workers need to do on {client.firstName}&apos;s shifts. They tick
          each one off as they go, and it&apos;s recorded on the completed shift
          and in the shift notes.
        </p>
      </header>

      <TaskTemplates
        clientId={client.id}
        templates={templates.map((t) => ({
          id: t.id,
          title: t.title,
          notes: t.notes ?? "",
          recurrence: t.recurrence,
          days: t.days,
          dueTime: t.dueTime ?? "",
          reminder: t.reminder,
          reminderMinutesBefore: t.reminderMinutesBefore,
        }))}
        upcomingShifts={upcoming}
      />
    </div>
  );
}
