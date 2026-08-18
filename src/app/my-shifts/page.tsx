import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { tzForState, dateKeyInTz, fmtInTz } from "@/lib/timezone";

/**
 * The worker's shift list, grouped into Today / This week / This month /
 * Later. The buckets roll with the date — "this week" always means the rest
 * of the current week, not a fixed range. Tapping a shift opens its own page
 * with the map and the clock in/out button.
 */
export default async function MyShiftsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.staffId) redirect("/dashboard");

  const account = await prisma.user.findUnique({
    where: { id: session.id },
    select: { status: true },
  });
  if (!account || account.status !== "APPROVED") redirect("/pending");

  const me = await prisma.staff.findUnique({
    where: { id: session.staffId },
    select: { branchId: true, branch: { select: { state: true } } },
  });
  const tz = tzForState(me?.branch?.state);
  const branchWhere = me?.branchId ? { branchId: me.branchId } : {};

  // From the start of today (in the branch's timezone) out to ~3 months, so
  // every bucket below has something to draw on.
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const horizon = new Date(now);
  horizon.setMonth(horizon.getMonth() + 3);

  const shifts = await prisma.shift.findMany({
    where: {
      tenantId: session.tenantId,
      staffId: session.staffId,
      start: { gte: startOfToday, lt: horizon },
      publishState: { in: ["PUBLISHED", "ACCEPTED"] },
      ...branchWhere,
    },
    include: { client: true },
    orderBy: { start: "asc" },
  });

  const offers = shifts.filter((s) => s.publishState === "PUBLISHED");
  const mine = shifts.filter((s) => s.publishState === "ACCEPTED");

  // ── bucket boundaries, all in the branch's local calendar ──
  const todayKey = dateKeyInTz(now, tz);

  // End of this week (Sunday night), matching the admin schedule's Mon–Sun.
  const endOfWeek = new Date(now);
  endOfWeek.setHours(23, 59, 59, 999);
  endOfWeek.setDate(endOfWeek.getDate() + ((7 - endOfWeek.getDay()) % 7));

  // End of this month.
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  type Row = (typeof mine)[number];
  const today: Row[] = [];
  const thisWeek: Row[] = [];
  const thisMonth: Row[] = [];
  const later: Row[] = [];

  for (const s of mine) {
    if (dateKeyInTz(s.start, tz) === todayKey) today.push(s);
    else if (s.start <= endOfWeek) thisWeek.push(s);
    else if (s.start <= endOfMonth) thisMonth.push(s);
    else later.push(s);
  }

  // The one the worker is on, or about to start — highlighted at the top.
  const active =
    mine.find((s) => s.status === "IN_PROGRESS") ??
    mine.find((s) => s.status !== "COMPLETED");

  function ShiftRow({ s }: { s: Row }) {
    const isActive = s.id === active?.id;
    const onShift = s.status === "IN_PROGRESS";
    const done = s.status === "COMPLETED";

    return (
      <Link
        href={`/my-shifts/shift/${s.id}`}
        className={`flex items-center gap-3 rounded-2xl border bg-white p-4 shadow-sm transition active:scale-[0.99] ${
          onShift
            ? "border-emerald-300 ring-2 ring-emerald-100"
            : isActive
              ? "border-[var(--brand)]/30 ring-2 ring-[var(--brand)]/10"
              : "border-slate-200"
        }`}
      >
        {/* Day + start time, in the branch's local clock */}
        <div className="w-14 shrink-0 text-center">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
            {fmtInTz(s.start, tz, { weekday: "short" })}
          </div>
          <div className="text-lg font-bold leading-tight text-slate-900">
            {fmtInTz(s.start, tz, { day: "numeric" })}
          </div>
        </div>

        <div className="h-10 w-px shrink-0 bg-slate-100" />

        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-slate-900">
            {s.client.firstName} {s.client.lastName}
          </div>
          <div className="truncate text-sm font-medium text-slate-600">
            {fmtInTz(s.start, tz, { hour: "numeric", minute: "2-digit" })} –{" "}
            {fmtInTz(s.end, tz, { hour: "numeric", minute: "2-digit" })}
          </div>
          {s.client.address && (
            <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-400">
              <span className="material-symbols-rounded text-[14px]">place</span>
              <span className="truncate">{s.client.address}</span>
            </div>
          )}
        </div>

        {onShift ? (
          <span className="shrink-0 rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-bold text-white">
            ON SHIFT
          </span>
        ) : done ? (
          <span className="material-symbols-rounded shrink-0 text-[20px] text-emerald-500">
            task_alt
          </span>
        ) : (
          <span className="material-symbols-rounded shrink-0 text-slate-300">
            chevron_right
          </span>
        )}
      </Link>
    );
  }

  function Group({
    title,
    subtitle,
    rows,
  }: {
    title: string;
    subtitle?: string;
    rows: Row[];
  }) {
    if (rows.length === 0) return null;
    return (
      <section>
        <div className="mb-2 flex items-baseline justify-between px-1">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            {title}
          </h2>
          <span className="text-xs text-slate-400">
            {subtitle ? `${subtitle} · ` : ""}
            {rows.length} shift{rows.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="space-y-2.5">
          {rows.map((s) => (
            <ShiftRow key={s.id} s={s} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-5 p-4">
      {/* Offers waiting for a yes/no live on the Pending tab. */}
      {offers.length > 0 && (
        <Link
          href="/my-shifts/pending"
          className="flex items-center justify-between rounded-2xl border-2 border-amber-200 bg-amber-50 px-4 py-3.5 shadow-sm"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-amber-800">
            <span className="material-symbols-rounded text-[20px]">
              pending_actions
            </span>
            {offers.length} new shift offer{offers.length === 1 ? "" : "s"} to
            review
          </span>
          <span className="material-symbols-rounded text-amber-500">
            chevron_right
          </span>
        </Link>
      )}

      <Group
        title="Today"
        subtitle={fmtInTz(now, tz, { weekday: "long", day: "numeric", month: "short" })}
        rows={today}
      />
      <Group title="Rest of this week" rows={thisWeek} />
      <Group
        title="Rest of this month"
        subtitle={fmtInTz(now, tz, { month: "long" })}
        rows={thisMonth}
      />
      <Group title="Later" rows={later} />

      {mine.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
          No shifts booked in. New shifts appear here once the office sends
          them to you.
        </div>
      )}

      {today.length === 0 && mine.length > 0 && (
        <p className="px-1 text-center text-xs text-slate-400">
          Nothing on today — your next shift is further down.
        </p>
      )}
    </div>
  );
}
