import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { HolidaysClient, type HolidayRow } from "./HolidaysClient";

import { isManager } from "@/lib/roles";
export default async function HolidaysPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; state?: string }>;
}) {
  const { tenant, session } = await requireTenant();
  if (!isManager(session.role)) {
    redirect("/dashboard");
  }

  const { year, state } = await searchParams;
  const all = await prisma.publicHoliday.findMany({
    where: { tenantId: tenant.id },
    orderBy: { date: "asc" },
  });

  const years = [...new Set(all.map((h) => h.date.getFullYear()))].sort();
  const activeYear = year ? Number(year) : (years.at(-1) ?? new Date().getFullYear());

  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const rows: HolidayRow[] = all
    .filter((h) => h.date.getFullYear() === activeYear)
    .filter((h) =>
      !state ? true : state === "NATIONAL" ? h.state === null : h.state === state,
    )
    .map((h) => ({
      id: h.id,
      date: iso(h.date),
      dateLabel: h.date.toLocaleDateString("en-AU", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      name: h.name,
      state: h.state ?? "",
    }));

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <Link
        href="/settings"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <span className="material-symbols-rounded text-[18px]">arrow_back</span>
        Settings
      </Link>

      <HolidaysClient
        rows={rows}
        years={years.length ? years : [activeYear]}
        activeYear={activeYear}
        activeState={state ?? ""}
        total={all.length}
      />
    </div>
  );
}
