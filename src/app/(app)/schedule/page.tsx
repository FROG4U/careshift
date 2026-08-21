import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import {
  ScheduleGrid,
  type GridShift,
  type GridDay,
} from "@/components/ScheduleGrid";
import { ScheduleBranchBar } from "@/components/ScheduleBranchBar";

/** Monday of the week containing `d`, at local midnight. */
function weekStart(d: Date) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = (date.getDay() + 6) % 7; // 0 = Monday
  date.setDate(date.getDate() - day);
  return date;
}

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Compact time for the narrow grid cells: "9am", "9:30am". */
function compactTime(d: Date) {
  return d
    .toLocaleTimeString("en-AU", {
      hour: "numeric",
      minute: d.getMinutes() ? "2-digit" : undefined,
    })
    .replace(/\s/g, "")
    .toLowerCase();
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{
    week?: string;
    branch?: string;
    from?: string;
    to?: string;
    staff?: string;
    client?: string;
  }>;
}) {
  const { tenant, session } = await requireTenant();
  const { week, branch, from, to, staff: staffFilter, client: clientFilter } =
    await searchParams;
  const isAdmin =
    session.role === "ADMIN" || session.role === "SUPER_ADMIN";
  const canAuthorise = isAdmin || session.role === "COORDINATOR";

  // Date range: a custom from/to wins over the week view. Capped at 31 days so
  // the grid can't become unusably wide.
  const MAX_DAYS = 31;
  const customRange = Boolean(from && to);
  let start: Date;
  let dayCount: number;
  if (customRange) {
    start = new Date(`${from}T00:00:00`);
    const last = new Date(`${to}T00:00:00`);
    const span = Math.floor((last.getTime() - start.getTime()) / 86_400_000) + 1;
    dayCount = Math.min(Math.max(span, 1), MAX_DAYS);
  } else {
    const base = week ? new Date(`${week}T00:00:00`) : new Date();
    start = weekStart(base);
    dayCount = 7;
  }
  const end = addDays(start, dayCount);
  const todayIso = isoDate(new Date());

  const branchRecords = await prisma.branch.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "asc" },
  });
  const branches = branchRecords.map((b) => ({ id: b.id, name: b.name }));

  // Selected branch schedule: the ?branch= param, else the first branch.
  const selected =
    branch && branches.some((b) => b.id === branch)
      ? branch
      : (branches[0]?.id ?? "");
  const selectedBranch = branches.find((b) => b.id === selected) ?? null;

  const prevWeek = isoDate(addDays(start, -7));
  const nextWeek = isoDate(addDays(start, 7));
  // Week navigation keeps the worker/participant filters, but drops a custom
  // date range (you're back to browsing week by week).
  const nav = (w?: string) => {
    const params: string[] = [];
    if (selected) params.push(`branch=${selected}`);
    if (w) params.push(`week=${w}`);
    if (staffFilter) params.push(`staff=${staffFilter}`);
    if (clientFilter) params.push(`client=${clientFilter}`);
    return `/schedule${params.length ? `?${params.join("&")}` : ""}`;
  };
  const rangeLabel = `${start.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  })} – ${addDays(start, dayCount - 1).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;

  const days: GridDay[] = Array.from({ length: dayCount }, (_, i) => {
    const d = addDays(start, i);
    return {
      iso: isoDate(d),
      weekday: d.toLocaleDateString("en-AU", { weekday: "short" }),
      dayNum: d.toLocaleDateString("en-AU", { day: "numeric", month: "short" }),
      isToday: isoDate(d) === todayIso,
    };
  });

  // Everything on this page is scoped to the selected branch. When there is no
  // branch yet, `selected` is "" and these queries return nothing (the grid is
  // not rendered in that case).
  const [rawShifts, allStaff, allClients] = await Promise.all([
    prisma.shift.findMany({
      where: {
        tenantId: tenant.id,
        branchId: selected,
        start: { gte: start, lt: end },
        ...(staffFilter ? { staffId: staffFilter } : {}),
        ...(clientFilter ? { clientId: clientFilter } : {}),
      },
      include: {
        client: true,
        staff: true,
        tasks: { orderBy: [{ dueTime: "asc" }, { sortOrder: "asc" }] },
      },
      orderBy: { start: "asc" },
    }),
    prisma.staff.findMany({
      where: { tenantId: tenant.id, active: true, branchId: selected },
      orderBy: { firstName: "asc" },
    }),
    prisma.client.findMany({
      where: {
        tenantId: tenant.id,
        active: true,
        OR: [{ branchId: selected }, { branchId: null }],
      },
      orderBy: { firstName: "asc" },
    }),
  ]);

  // Narrow the grid rows to match the filters (full lists stay for the
  // dropdowns and the add-shift dialog).
  const staff = staffFilter
    ? allStaff.filter((s) => s.id === staffFilter)
    : allStaff;
  const clients = clientFilter
    ? allClients.filter((c) => c.id === clientFilter)
    : allClients;
  const filtersOn = Boolean(customRange || staffFilter || clientFilter);

  const shifts: GridShift[] = rawShifts.map((s) => ({
    id: s.id,
    staffId: s.staffId,
    clientId: s.clientId,
    dayIso: isoDate(new Date(s.start)),
    timeLabel: `${compactTime(new Date(s.start))}–${compactTime(new Date(s.end))}`,
    startHm: `${String(new Date(s.start).getHours()).padStart(2, "0")}:${String(new Date(s.start).getMinutes()).padStart(2, "0")}`,
    endHm: `${String(new Date(s.end).getHours()).padStart(2, "0")}:${String(new Date(s.end).getMinutes()).padStart(2, "0")}`,
    clientName: `${s.client.firstName} ${s.client.lastName}`,
    staffName: s.staff ? `${s.staff.firstName} ${s.staff.lastName}` : null,
    status: s.status,
    overAgreement: s.overAgreement,
    publishState: s.publishState,
    rejectionReason: s.rejectionReason,
    hours:
      (new Date(s.end).getTime() - new Date(s.start).getTime()) / 3_600_000,
    tasks: s.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      completed: t.completedAt != null,
    })),
  }));

  const usedByClient: Record<string, number> = {};
  for (const s of shifts) {
    if (s.status !== "CANCELLED")
      usedByClient[s.clientId] = (usedByClient[s.clientId] ?? 0) + s.hours;
  }

  return (
    <div className="p-6 lg:p-8">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Schedule
          </h1>
          <p className="text-sm text-slate-500">
            {selectedBranch
              ? `${selectedBranch.name} · ${customRange ? "" : "week of "}${rangeLabel}`
              : "Create a branch schedule to start rostering"}
          </p>
        </div>
        {selected && (
          <div className="flex items-center gap-2">
            <Link
              href={nav(prevWeek)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              ←
            </Link>
            <Link
              href={nav()}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Today
            </Link>
            <Link
              href={nav(nextWeek)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              →
            </Link>
          </div>
        )}
      </header>

      <ScheduleBranchBar
        branches={branches}
        selected={selected}
        week={week}
        isAdmin={isAdmin}
      />

      {/* Filters: date range, worker, participant */}
      {selected && (
        <form
          method="get"
          action="/schedule"
          className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
        >
          <input type="hidden" name="branch" value={selected} />

          <label className="text-xs font-medium text-slate-500">
            From
            <input
              type="date"
              name="from"
              defaultValue={from ?? ""}
              className="mt-1 block rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:border-[var(--brand)]"
            />
          </label>
          <label className="text-xs font-medium text-slate-500">
            To
            <input
              type="date"
              name="to"
              defaultValue={to ?? ""}
              className="mt-1 block rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:border-[var(--brand)]"
            />
          </label>

          <label className="text-xs font-medium text-slate-500">
            Worker
            <select
              name="staff"
              defaultValue={staffFilter ?? ""}
              className="mt-1 block min-w-40 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:border-[var(--brand)]"
            >
              <option value="">All workers</option>
              {allStaff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.firstName} {s.lastName}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-medium text-slate-500">
            Participant
            <select
              name="client"
              defaultValue={clientFilter ?? ""}
              className="mt-1 block min-w-40 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:border-[var(--brand)]"
            >
              <option value="">All participants</option>
              {allClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.lastName}
                </option>
              ))}
            </select>
          </label>

          <button className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90">
            Apply
          </button>
          {filtersOn && (
            <Link
              href={`/schedule?branch=${selected}`}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50"
            >
              Clear
            </Link>
          )}
          {filtersOn && (
            <span className="ml-auto self-center text-xs text-slate-400">
              Showing {rawShifts.length} shift
              {rawShifts.length === 1 ? "" : "s"}
            </span>
          )}
        </form>
      )}

      {selected ? (
        <>
          <ScheduleGrid
            days={days}
            branchId={selected}
            staff={staff.map((s) => ({
              id: s.id,
              name: `${s.firstName} ${s.lastName}`,
            }))}
            shifts={shifts}
            clients={clients.map((c) => ({
              id: c.id,
              name: `${c.firstName} ${c.lastName}`,
              weeklyHours: c.weeklyHours ?? null,
              usedHours: usedByClient[c.id] ?? 0,
            }))}
            canAuthorise={canAuthorise}
            weekIso={isoDate(start)}
          />
          <p className="mt-3 text-xs text-slate-400">
            Tip: hover a day cell to add a shift, drag a shift between staff or
            days to reassign, and drop onto “Open shifts” to unassign. Staff rows
            show workers assigned to {selectedBranch?.name}.
          </p>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-2xl">
            🗓️
          </div>
          <h2 className="text-lg font-semibold text-slate-900">
            No schedules yet
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            {isAdmin
              ? "Click “+ Add schedule” above to create your first branch, then start adding shifts to it."
              : "Ask an admin to add a branch schedule."}
          </p>
        </div>
      )}
    </div>
  );
}
