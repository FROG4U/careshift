import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { GuideContent } from "@/components/GuideContent";
import { DEFAULT_GEOFENCE_FT } from "@/lib/constants";

/**
 * The worker handbook, as admins see it.
 *
 * Same component the workers get, so an admin answering "what does it tell
 * them about pay?" is reading the exact words the worker read.
 */
export default async function AdminGuidePage() {
  const { tenant } = await requireTenant();

  const clients = await prisma.client.findMany({
    where: { tenantId: tenant.id, active: true },
    select: { geofenceFt: true },
  });
  const radii = [...new Set(clients.map((c) => c.geofenceFt))];
  const geofenceFt = radii.length === 1 ? radii[0] : DEFAULT_GEOFENCE_FT;

  return (
    <div className="mx-auto max-w-3xl p-6 lg:p-8">
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          Worker Guide
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Exactly what your support workers see in their app, under Menu → How
          this app works.
        </p>
      </header>

      <div className="mb-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-slate-700">
        <p className="font-semibold text-slate-900">Why this page exists</p>
        <p className="mt-1">
          The numbers below come from your own Settings — the clock-in radius,
          the lateness grace periods, the rating thresholds. Change them in
          Settings and this guide changes with them, for you and for the
          workers, so nobody is working from stale instructions.
        </p>
        {radii.length > 1 && (
          <p className="mt-2 text-slate-600">
            Your participants currently use different clock-in radii, so the
            guide quotes the {DEFAULT_GEOFENCE_FT} ft default. Workers see the
            radius that applies to their own participants.
          </p>
        )}
      </div>

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
