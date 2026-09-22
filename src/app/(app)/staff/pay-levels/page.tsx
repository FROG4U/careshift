import { redirect } from "next/navigation";
import { requireScope } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { PayLevelsClient, type PayLevelRow } from "./PayLevelsClient";

export default async function PayLevelsPage() {
  const { tenant , scope } = await requireScope();
  // Company-wide settings: head office only.
  if (!scope.headOffice) redirect("/dashboard");
  const levels = await prisma.payLevel.findMany({
    where: { tenantId: tenant.id },
    include: { rates: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

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

  return <PayLevelsClient rows={rows} />;
}
