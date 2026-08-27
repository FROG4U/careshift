import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GuideContent } from "@/components/GuideContent";
import { DEFAULT_GEOFENCE_FT } from "@/lib/constants";

export default async function WorkerGuidePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [tenant, staff] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.tenantId } }),
    session.staffId
      ? prisma.staff.findUnique({
          where: { id: session.staffId },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);
  if (!tenant) redirect("/login");

  // Show the radius this worker's own participants actually use, not the
  // default — a guide quoting a number that doesn't apply is worse than none.
  const clients = staff
    ? await prisma.client.findMany({
        where: { tenantId: tenant.id, active: true, shifts: { some: { staffId: staff.id } } },
        select: { geofenceFt: true },
      })
    : [];
  const radii = [...new Set(clients.map((c) => c.geofenceFt))];
  const geofenceFt = radii.length === 1 ? radii[0] : DEFAULT_GEOFENCE_FT;

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <h1 className="mb-1 text-xl font-bold text-slate-900">How this app works</h1>
      <p className="mb-4 text-sm text-slate-500">
        Clocking in and out, notes, pay and swaps — the short version.
      </p>
      <GuideContent
        s={{
          geofenceFt,
          lateGraceMin: tenant.lateGraceMin,
          earlyFinishGraceMin: tenant.earlyFinishGraceMin,
          lateFinishGraceMin: tenant.lateFinishGraceMin,
          ratingGreenAt: tenant.ratingGreenAt,
          ratingAmberAt: tenant.ratingAmberAt,
          lateNoticePenalty: tenant.lateNoticePenalty,
        }}
      />
    </div>
  );
}
