import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { fmtTime, initials } from "@/lib/format";
import { todayActivity } from "@/lib/activity";

export default async function DashboardPage() {
  const { tenant, session } = await requireTenant();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const [clientCount, staffCount, todayShifts, activity, pending] =
    await Promise.all([
      prisma.client.count({ where: { tenantId: tenant.id, active: true } }),
      prisma.staff.count({ where: { tenantId: tenant.id, active: true } }),
      prisma.shift.findMany({
        where: {
          tenantId: tenant.id,
          start: { gte: startOfDay, lt: endOfDay },
        },
        include: { client: true, staff: true },
        orderBy: { start: "asc" },
      }),
      todayActivity(tenant.id),
      prisma.shift.count({
        where: { tenantId: tenant.id, approval: "PENDING", status: "COMPLETED" },
      }),
    ]);

  const stats = [
    {
      label: "Active Participants",
      value: clientCount,
      href: "/clients",
      icon: "people",
      pastel: "bg-blue-50 text-blue-600",
      iconBg: "bg-blue-100",
    },
    {
      label: "Active Staff",
      value: staffCount,
      href: "/staff",
      icon: "badge",
      pastel: "bg-green-50 text-green-600",
      iconBg: "bg-green-100",
    },
    {
      label: "Shifts Today",
      value: todayShifts.length,
      href: "/schedule",
      icon: "calendar_today",
      pastel: "bg-yellow-50 text-yellow-600",
      iconBg: "bg-yellow-100",
    },
    {
      label: "Awaiting Approval",
      value: pending,
      href: "/timesheets",
      icon: "pending_actions",
      pastel: "bg-rose-50 text-rose-600",
      iconBg: "bg-rose-100",
    },
  ];

  const today = new Date().toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">

      {/* Page header */}
      <header className="mb-8">
        <p className="text-sm font-medium text-[var(--text-muted)] mb-1">{today}</p>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">
          Welcome back, {session.name.split(" ")[0]} 👋
        </h1>
        <p className="mt-1 text-[var(--text-secondary)]">
          Here&apos;s what&apos;s happening at{" "}
          <span className="font-semibold text-[var(--text-primary)]">{tenant.name}</span> today.
        </p>
      </header>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-8">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="card-hover rounded-2xl bg-white border border-[var(--border)] p-5 shadow-sm flex flex-col gap-3"
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.iconBg}`}>
              <span className={`material-symbols-rounded text-[20px] ${s.pastel.split(" ")[1]}`}
                style={{ fontVariationSettings: "'FILL' 1, 'wght' 400" }}>
                {s.icon}
              </span>
            </div>
            <div>
              <div className="text-3xl font-bold text-[var(--text-primary)]">{s.value}</div>
              <div className="mt-0.5 text-sm text-[var(--text-secondary)]">{s.label}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid gap-6 lg:grid-cols-3">

        {/* Today's schedule */}
        <section className="lg:col-span-2 rounded-2xl bg-white border border-[var(--border)] shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <span className="material-symbols-rounded text-[20px] text-[var(--brand)]"
                style={{ fontVariationSettings: "'FILL' 1" }}>
                calendar_today
              </span>
              <h2 className="font-bold text-[var(--text-primary)]">Today&apos;s Schedule</h2>
            </div>
            <Link
              href="/schedule"
              className="text-sm font-semibold text-[var(--brand)] hover:opacity-70 transition"
            >
              View all →
            </Link>
          </div>

          {todayShifts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--pastel-blue)]">
                <span className="material-symbols-rounded text-[28px] text-blue-500"
                  style={{ fontVariationSettings: "'FILL' 1" }}>
                  event_available
                </span>
              </div>
              <p className="text-sm font-medium text-[var(--text-secondary)]">No shifts scheduled today</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Enjoy the quiet day!</p>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {todayShifts.map((shift) => (
                <li key={shift.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-[var(--background)] transition">
                  {/* Time pill */}
                  <div className="w-16 shrink-0 rounded-lg bg-[var(--pastel-blue)] px-2 py-1 text-center">
                    <span className="text-xs font-bold text-blue-700">{fmtTime(shift.start)}</span>
                  </div>
                  {/* Client info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-[var(--text-primary)] truncate">
                      {shift.client.firstName} {shift.client.lastName}
                    </div>
                    <div className="text-xs text-[var(--text-muted)] truncate">
                      {shift.address ?? "No address set"}
                    </div>
                  </div>
                  {/* Worker avatar */}
                  {shift.staff ? (
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ background: "var(--brand)" }}
                      title={`${shift.staff.firstName} ${shift.staff.lastName}`}
                    >
                      {initials(shift.staff.firstName, shift.staff.lastName)}
                    </div>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                      Unassigned
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Right column */}
        <div className="flex flex-col gap-6">

          {/* Today's activity */}
          <section className="rounded-2xl bg-white border border-[var(--border)] shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 pt-5 pb-4 border-b border-[var(--border)]">
              <span className="material-symbols-rounded text-[20px] text-[var(--brand)]"
                style={{ fontVariationSettings: "'FILL' 1" }}>
                bolt
              </span>
              <h2 className="font-bold text-[var(--text-primary)]">Today&apos;s Activity</h2>
            </div>

            {activity.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center px-5">
                <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--background)]">
                  <span className="material-symbols-rounded text-[24px] text-[var(--text-muted)]">
                    hourglass_empty
                  </span>
                </div>
                <p className="text-sm font-medium text-[var(--text-secondary)]">No activity yet today</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">Clock-ins and updates show here.</p>
              </div>
            ) : (
              <ul className="max-h-[22rem] divide-y divide-[var(--border)] overflow-y-auto">
                {activity.map((a, i) => {
                  const toneColor: Record<string, string> = {
                    in: "text-emerald-600 bg-emerald-50",
                    out: "text-slate-500 bg-slate-100",
                    accept: "text-blue-600 bg-blue-50",
                    swap: "text-violet-600 bg-violet-50",
                    leave: "text-amber-600 bg-amber-50",
                  };
                  return (
                    <li key={i} className="flex items-start gap-3 px-5 py-3">
                      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${toneColor[a.tone]}`}>
                        <span className="material-symbols-rounded text-[16px]">{a.icon}</span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-[var(--text-primary)]">
                          <span className="font-semibold">{a.who}</span>{" "}
                          <span className="text-[var(--text-secondary)]">{a.text}</span>
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">{fmtTime(a.at)}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Quick actions */}
          <section className="rounded-2xl bg-white border border-[var(--border)] shadow-sm p-5">
            <h2 className="font-bold text-[var(--text-primary)] mb-4">Quick Actions</h2>
            <div className="flex flex-col gap-2">
              {[
                { href: "/schedule", icon: "add_circle", label: "New shift", color: "text-blue-600" },
                { href: "/clients", icon: "person_add", label: "Add participant", color: "text-green-600" },
                { href: "/staff",   icon: "group_add",  label: "Add staff member", color: "text-purple-600" },
                { href: "/timesheets", icon: "check_circle", label: "Approve timesheets", color: "text-amber-600" },
              ].map((a) => (
                <Link
                  key={a.href}
                  href={a.href}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--background)] hover:text-[var(--text-primary)] transition"
                >
                  <span className={`material-symbols-rounded text-[18px] ${a.color}`}
                    style={{ fontVariationSettings: "'FILL' 1" }}>
                    {a.icon}
                  </span>
                  {a.label}
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
