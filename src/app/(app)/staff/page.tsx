import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { CASUAL_LOADING } from "@/lib/constants";
import {
  StaffClient,
  type StaffRow,
  type LevelOption,
  type BranchOption,
} from "./StaffClient";

function isoDate(d: Date | null) {
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export default async function StaffPage() {
  const { tenant } = await requireTenant();
  const [staff, levels, branchRecords] = await Promise.all([
    prisma.staff.findMany({
      where: { tenantId: tenant.id },
      include: { payLevel: { include: { rates: true } }, branch: true, rateOverrides: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.payLevel.findMany({
      where: { tenantId: tenant.id },
      include: { rates: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.branch.findMany({
      where: { tenantId: tenant.id },
      orderBy: { name: "asc" },
    }),
  ]);

  const branches: BranchOption[] = branchRecords.map((b) => ({
    id: b.id,
    name: b.name,
  }));

  const toGrid = (rates: { stream: string; dayType: string; rate: number }[]) => {
    const g: Record<string, number> = {};
    for (const r of rates) g[`${r.stream}_${r.dayType}`] = r.rate;
    return g;
  };

  const levelOptions: LevelOption[] = levels.map((l) => ({
    id: l.id,
    name: l.name,
    mileageRate: l.mileageRate,
    grid: toGrid(l.rates),
  }));

  const rows: StaffRow[] = staff.map((s) => {
    const grid = s.payLevel ? toGrid(s.payLevel.rates) : {};
    // Casual staff get the loading added to every rate.
    const factor = s.employmentType === "CASUAL" ? 1 + CASUAL_LOADING : 1;
    const load = (v: number | undefined) =>
      v != null ? Math.round(v * factor * 100) / 100 : null;
    return {
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      active: s.active,
      title: s.title ?? "",
      phone: s.phone ?? "",
      email: s.email ?? "",
      branchId: s.branchId ?? "",
      branchName: s.branch?.name ?? "",
      employmentType: s.employmentType === "CASUAL" ? "CASUAL" : "PERMANENT",
      clearanceType: s.clearanceType ?? "",
      clearanceExpiry: isoDate(s.clearanceExpiry),
      payLevelId: s.payLevelId ?? "",
      payLevelName: s.payLevel?.name ?? "",
      mileageRate: s.payLevel?.mileageRate ?? null,
      // Weekday rate per stream for the table summary (loading applied).
      wkNdis: load(grid["NDIS_WEEKDAY_DAY"]),
      wkAgedCare: load(grid["AGED_CARE_WEEKDAY_DAY"]),
      wkDva: load(grid["DVA_WEEKDAY_DAY"]),
      wkCleaning: load(grid["CLEANING_WEEKDAY_DAY"]),
      // Admin-typed rate overrides, so the grid shows what's actually paid.
      overrides: Object.fromEntries(
        s.rateOverrides.map((o) => [`${o.stream}_${o.dayType}`, o.rate]),
      ),
    };
  });

  return <StaffClient rows={rows} levels={levelOptions} branches={branches} />;
}
