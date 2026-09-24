import { redirect } from "next/navigation";
import Link from "next/link";
import { requireScope } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { DAY_TYPE_LABELS, STREAM_LABELS, type DayType, type StaffStream } from "@/lib/constants";
import { PayLevelsClient, type PayLevelRow } from "./PayLevelsClient";

/**
 * Which funding a worker is actually rostered for. A worker with agreed rates
 * for NDIS but none for Aged Care is paid the pay LEVEL rate the first time
 * they take an Aged Care shift - silently, and the level is often years older
 * than the agreed rates. This page is where rates live, so the gaps are
 * listed here rather than discovered in a pay run.
 */
async function rateGaps(tenantId: string) {
  const staff = await prisma.staff.findMany({
    where: { tenantId, active: true },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      rateOverrides: { select: { stream: true, dayType: true } },
      shifts: {
        where: { status: { not: "CANCELLED" } },
        select: { client: { select: { agreementType: true } } },
        take: 400,
        orderBy: { start: "desc" },
      },
    },
    orderBy: { firstName: "asc" },
  });

  return staff
    .map((s) => {
      // Only meaningful for workers who have agreed rates at all: everyone
      // else is on the level for everything, which is a deliberate setup.
      if (s.rateOverrides.length === 0) return null;
      const have = new Set(s.rateOverrides.map((o) => `${o.stream}_${o.dayType}`));
      const streams = [...new Set(s.shifts.map((sh) => sh.client.agreementType))];
      const missing: string[] = [];
      for (const stream of streams) {
        for (const dayType of Object.keys(DAY_TYPE_LABELS) as DayType[]) {
          if (!have.has(`${stream}_${dayType}`)) {
            missing.push(
              `${STREAM_LABELS[stream as StaffStream] ?? stream} ${(
                DAY_TYPE_LABELS[dayType] ?? dayType
              ).toLowerCase()}`,
            );
          }
        }
      }
      return missing.length
        ? { name: `${s.firstName} ${s.lastName}`, missing }
        : null;
    })
    .filter((x): x is { name: string; missing: string[] } => x !== null);
}

export default async function PayLevelsPage() {
  const { tenant , scope } = await requireScope();
  // Company-wide settings: head office only.
  if (!scope.headOffice) redirect("/dashboard");
  const [levels, gaps] = await Promise.all([
    prisma.payLevel.findMany({
      where: { tenantId: tenant.id },
      include: { rates: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    rateGaps(tenant.id),
  ]);

  const rows: PayLevelRow[] = levels.map((l) => {
    const grid: Record<string, number> = {};
    for (const r of l.rates) grid[`${r.stream}_${r.dayType}`] = r.rate;
    return {
      id: l.id,
      name: l.name,
      award: l.award ?? "",
      mileageRate: l.mileageRate,
      seeded: l.seeded,
      grid,
    };
  });

  return (
    <>
      {gaps.length > 0 && (
        <div className="mx-auto max-w-7xl px-6 pt-6 lg:px-8">
          <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">
              {gaps.length} worker{gaps.length === 1 ? " has" : "s have"} funding
              they work without an agreed rate
            </p>
            <p className="mt-0.5 text-xs">
              These shifts fall back to the pay level below, which is usually
              older than the rates you agreed with them. Set the missing cells
              on the worker&apos;s profile in{" "}
              <Link href="/staff" className="font-semibold underline">
                Staff
              </Link>
              .
            </p>
            <ul className="mt-2 space-y-1 text-xs">
              {gaps.map((g) => (
                <li key={g.name}>
                  <span className="font-semibold">{g.name}</span>:{" "}
                  {g.missing.join(", ")}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <PayLevelsClient rows={rows} />
    </>
  );
}
