import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtDate, fmtTime } from "@/lib/format";
import { IncidentForm } from "@/components/worker/IncidentForm";

export default async function NewIncidentPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Participants this worker is allocated to, plus their recent shifts, so
  // they can point the report at the right person/visit without typing.
  const [allocations, recentShifts] = await Promise.all([
    session.staffId
      ? prisma.clientWorker.findMany({
          where: { tenantId: session.tenantId, staffId: session.staffId },
          include: { client: true },
        })
      : Promise.resolve([]),
    session.staffId
      ? prisma.shift.findMany({
          where: {
            tenantId: session.tenantId,
            staffId: session.staffId,
            start: { gte: new Date(Date.now() - 14 * 24 * 3_600_000) },
          },
          include: { client: true },
          orderBy: { start: "desc" },
          take: 20,
        })
      : Promise.resolve([]),
  ]);

  const participants = allocations.map((a) => ({
    id: a.clientId,
    name: `${a.client.firstName} ${a.client.lastName}`,
  }));

  const shifts = recentShifts.map((s) => ({
    id: s.id,
    label: `${fmtDate(s.start)} ${fmtTime(s.start)} · ${s.client.firstName} ${s.client.lastName}`,
  }));

  return (
    <div className="space-y-4 p-4">
      <Link
        href="/my-shifts/incidents"
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-500"
      >
        <span className="material-symbols-rounded text-[18px]">arrow_back</span>
        My reports
      </Link>

      <div className="rounded-2xl bg-[var(--brand)]/5 p-4">
        <h1 className="text-lg font-bold text-slate-900">Report an incident</h1>
        <p className="mt-1 text-sm text-slate-600">
          Fill this in as soon as you safely can. If someone is in danger,
          call <strong>000</strong> first.
        </p>
      </div>

      <IncidentForm participants={participants} shifts={shifts} />
    </div>
  );
}
