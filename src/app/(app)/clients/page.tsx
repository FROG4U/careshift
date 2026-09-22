import { requireScope } from "@/lib/tenant";
import { opsWhere, visibleBranchWhere } from "@/lib/scope";
import { prisma } from "@/lib/prisma";
import {
  ParticipantsClient,
  type ParticipantRow,
  type BranchOption,
} from "./ParticipantsClient";

function isoDate(d: Date | null) {
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export default async function ClientsPage() {
  const { tenant, session, scope } = await requireScope();
  const [clients, branchRecords] = await Promise.all([
    prisma.client.findMany({
      where: { tenantId: tenant.id, ...opsWhere(scope) },
      include: { branch: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.branch.findMany({
      where: { tenantId: tenant.id, ...visibleBranchWhere(scope) },
      orderBy: { name: "asc" },
    }),
  ]);

  const rows: ParticipantRow[] = clients.map((c) => ({
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    agreementType: c.agreementType,
    ndisNumber: c.ndisNumber ?? "",
    budget: c.budget ?? null,
    weeklyHours: c.weeklyHours ?? null,
    chargeWeekdayDay: c.chargeWeekdayDay,
    chargeWeekdayEvening: c.chargeWeekdayEvening,
    chargeWeekdayNight: c.chargeWeekdayNight,
    chargeSaturday: c.chargeSaturday,
    chargeSunday: c.chargeSunday,
    chargePublicHoliday: c.chargePublicHoliday,
    chargeMileageRate: c.chargeMileageRate,
    planStart: isoDate(c.planStart),
    planEnd: isoDate(c.planEnd),
    address: c.address ?? "",
    phone: c.phone ?? "",
    email: c.email ?? "",
    lat: c.lat ?? null,
    lng: c.lng ?? null,
    geofenceFt: c.geofenceFt,
    branchId: c.branchId ?? "",
    branchName: c.branch?.name ?? "",
    active: c.active,
  }));

  const branches: BranchOption[] = branchRecords.map((b) => ({
    id: b.id,
    name: b.name,
  }));

  return (
    <ParticipantsClient
      rows={rows}
      branches={branches}
      financeBranchIds={
        scope.all ? (session.role === "SUPER_ADMIN" ? null : []) : scope.finance
      }
    />
  );
}
