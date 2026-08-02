import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { PlanClient, type PlanSlotView, type RateOption } from "./PlanClient";

export default async function PlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { tenant } = await requireTenant();
  const { id } = await params;

  const client = await prisma.client.findFirst({
    where: { id, tenantId: tenant.id },
    include: { planSlots: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] } },
  });
  if (!client) notFound();

  // Rates available to this participant = items from price lists matching
  // their agreement type (NDIS / Aged Care / DVA).
  const lists = await prisma.priceList.findMany({
    where: { tenantId: tenant.id, type: client.agreementType },
    include: { items: { orderBy: [{ category: "asc" }, { name: "asc" }] } },
  });
  const rates: RateOption[] = lists.flatMap((l) =>
    l.items.map((i) => ({
      id: i.id,
      label: `${i.name} — $${i.price.toFixed(2)}/${i.unit}`,
      price: i.price,
      unit: i.unit,
    })),
  );

  const slots: PlanSlotView[] = client.planSlots.map((s) => ({
    id: s.id,
    dayOfWeek: s.dayOfWeek,
    startTime: s.startTime,
    endTime: s.endTime,
    priceItemId: s.priceItemId ?? "",
    mileageKm: s.mileageKm ?? null,
    notes: s.notes ?? "",
  }));

  return (
    <PlanClient
      clientId={client.id}
      clientName={`${client.firstName} ${client.lastName}`}
      agreementType={client.agreementType}
      weeklyHours={client.weeklyHours ?? null}
      slots={slots}
      rates={rates}
    />
  );
}
