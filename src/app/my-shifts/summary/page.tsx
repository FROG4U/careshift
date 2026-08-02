import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Period = "day" | "week" | "month";

function rangeFor(period: Period) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (period === "week") {
    const day = (start.getDay() + 6) % 7; // Monday = 0
    start.setDate(start.getDate() - day);
  } else if (period === "month") {
    start.setDate(1);
  }
  const end = new Date(start);
  if (period === "day") end.setDate(end.getDate() + 1);
  else if (period === "week") end.setDate(end.getDate() + 7);
  else end.setMonth(end.getMonth() + 1);
  return { start, end };
}

export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.staffId) redirect("/dashboard");

  const account = await prisma.user.findUnique({
    where: { id: session.id },
    select: { status: true },
  });
  if (!account || account.status !== "APPROVED") redirect("/pending");

  const { period: rawPeriod } = await searchParams;
  const period: Period =
    rawPeriod === "day" || rawPeriod === "month" ? rawPeriod : "week";
  const { start, end } = rangeFor(period);

  // Workers only see shifts from their assigned branch (if one is set).
  const me = await prisma.staff.findUnique({
    where: { id: session.staffId },
    select: { branchId: true },
  });
  const branchWhere = me?.branchId ? { branchId: me.branchId } : {};

  const shifts = await prisma.shift.findMany({
    where: {
      tenantId: session.tenantId,
      staffId: session.staffId,
      status: "COMPLETED",
      clockInAt: { gte: start, lt: end },
      ...branchWhere,
    },
    include: { client: true, pauses: true, transports: true },
  });

  // Net worked hours = (out − in) − breaks. Mileage = Σ transport km.
  type Agg = { name: string; hours: number; km: number; shifts: number };
  const byClient = new Map<string, Agg>();
  let totalHours = 0;
  let totalKm = 0;

  for (const s of shifts) {
    if (!s.clockInAt || !s.clockOutAt) continue;
    const gross =
      (new Date(s.clockOutAt).getTime() - new Date(s.clockInAt).getTime()) /
      3_600_000;
    const breakHrs = s.pauses.reduce((sum, p) => {
      if (!p.endAt) return sum;
      return (
        sum +
        (new Date(p.endAt).getTime() - new Date(p.startAt).getTime()) /
          3_600_000
      );
    }, 0);
    const worked = Math.max(0, gross - breakHrs);
    const km = s.transports.reduce((sum, t) => sum + t.km, 0);

    totalHours += worked;
    totalKm += km;

    const key = s.clientId;
    const agg =
      byClient.get(key) ??
      {
        name: `${s.client.firstName} ${s.client.lastName}`,
        hours: 0,
        km: 0,
        shifts: 0,
      };
    agg.hours += worked;
    agg.km += km;
    agg.shifts += 1;
    byClient.set(key, agg);
  }

  const clients = [...byClient.values()].sort((a, b) => b.hours - a.hours);

  const periods: { key: Period; label: string }[] = [
    { key: "day", label: "Today" },
    { key: "week", label: "This week" },
    { key: "month", label: "This month" },
  ];

  return (
    <div className="space-y-4 p-4">
        {/* Period toggle */}
        <div className="flex gap-1 rounded-xl bg-slate-200/70 p-1">
          {periods.map((p) => (
            <Link
              key={p.key}
              href={`/my-shifts/summary?period=${p.key}`}
              className={`flex-1 rounded-lg py-2 text-center text-sm font-semibold transition ${
                period === p.key
                  ? "bg-white text-[var(--brand)] shadow-sm"
                  : "text-slate-500"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </div>

        {/* Totals */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-slate-900">
              {totalHours.toFixed(1)}
            </div>
            <div className="text-xs text-slate-500">hours worked</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-slate-900">
              {totalKm.toFixed(1)}
            </div>
            <div className="text-xs text-slate-500">km travelled</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-slate-900">
              {shifts.length}
            </div>
            <div className="text-xs text-slate-500">shifts</div>
          </div>
        </div>

        {/* Per-client breakdown */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            By participant
          </h2>
          {clients.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">
              No completed shifts in this period.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {clients.map((c) => (
                <li key={c.name} className="flex items-center justify-between py-2.5">
                  <div>
                    <div className="text-sm font-medium text-slate-800">
                      {c.name}
                    </div>
                    <div className="text-xs text-slate-400">
                      {c.shifts} shift{c.shifts === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-slate-800">
                      {c.hours.toFixed(1)} h
                    </div>
                    {c.km > 0 && (
                      <div className="text-xs text-violet-600">
                        {c.km.toFixed(1)} km
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
    </div>
  );
}
