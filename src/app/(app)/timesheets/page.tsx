import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { fmtDate, fmtTime, initials } from "@/lib/format";
import { setApproval } from "./actions";
import { ShiftDetail, type ShiftDetailData } from "./ShiftDetail";
import type { LatLng } from "@/components/ShiftMap";

function grossHours(a: Date | null, b: Date | null) {
  if (!a || !b) return 0;
  return (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;
}

function hhmm(d: Date | null) {
  if (!d) return "";
  const x = new Date(d);
  return `${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`;
}
const FT_PER_M = 3.28084;

const approvalStyle: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-red-50 text-red-700",
};

export default async function TimesheetsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    from?: string;
    to?: string;
    month?: string;
  }>;
}) {
  const { tenant } = await requireTenant();
  const { q, from, to, month } = await searchParams;
  const query = (q ?? "").trim().toLowerCase();

  // Date window: a chosen month takes precedence, else the from/to range.
  let start: Date | undefined;
  let end: Date | undefined;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    start = new Date(y, m - 1, 1);
    end = new Date(y, m, 1);
  } else {
    if (from) start = new Date(`${from}T00:00:00`);
    if (to) {
      end = new Date(`${to}T00:00:00`);
      end.setDate(end.getDate() + 1); // inclusive of the "to" day
    }
  }

  const rows = await prisma.shift.findMany({
    where: {
      tenantId: tenant.id,
      status: "COMPLETED",
      ...(start || end
        ? {
            start: {
              ...(start ? { gte: start } : {}),
              ...(end ? { lt: end } : {}),
            },
          }
        : {}),
    },
    include: {
      client: true,
      staff: true,
      pauses: true,
      transports: {
        include: {
          points: { orderBy: { at: "asc" } },
          speedEvents: { orderBy: { overByKmh: "desc" } },
        },
      },
    },
    orderBy: [{ approval: "asc" }, { start: "desc" }],
  });

  const shifts = query
    ? rows.filter((s) =>
        `${s.staff?.firstName ?? ""} ${s.staff?.lastName ?? ""} ${s.client.firstName} ${s.client.lastName}`
          .toLowerCase()
          .includes(query),
      )
    : rows;

  const pendingCount = shifts.filter((s) => s.approval === "PENDING").length;

  // Month dropdown — the last 18 months.
  const nowD = new Date();
  const monthOptions = Array.from({ length: 18 }, (_, i) => {
    const d = new Date(nowD.getFullYear(), nowD.getMonth() - i, 1);
    return {
      val: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-AU", { month: "long", year: "numeric" }),
    };
  });
  const hasFilter = !!(query || from || to || month);

  return (
    <div className="p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Timesheets
        </h1>
        <p className="text-sm text-slate-500">
          Completed shifts with actual clocked hours, breaks and mileage —{" "}
          <span className="font-medium text-amber-700">
            {pendingCount} awaiting approval
          </span>
          .
        </p>
      </header>

      {/* Filters */}
      <form className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500">Search name</label>
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Worker or participant…"
            className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">Month</label>
          <select
            name="month"
            defaultValue={month ?? ""}
            className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
          >
            <option value="">Any month</option>
            {monthOptions.map((m) => (
              <option key={m.val} value={m.val}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">From</label>
          <input type="date" name="from" defaultValue={from ?? ""} className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[var(--brand)]" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">To</label>
          <input type="date" name="to" defaultValue={to ?? ""} className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[var(--brand)]" />
        </div>
        <button className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90">
          Filter
        </button>
        {hasFilter && (
          <a href="/timesheets" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Clear
          </a>
        )}
      </form>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3 font-medium">Worker</th>
              <th className="px-5 py-3 font-medium">Participant</th>
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-5 py-3 font-medium">Clocked</th>
              <th className="px-5 py-3 font-medium">Worked</th>
              <th className="px-5 py-3 font-medium">Mileage</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shifts.map((s) => {
              const gross = grossHours(s.clockInAt, s.clockOutAt);
              const breakHrs = s.pauses.reduce(
                (sum, p) => sum + grossHours(p.startAt, p.endAt),
                0,
              );
              const net = Math.max(0, gross - breakHrs);
              const km = s.transports.reduce((sum, t) => sum + t.km, 0);
              // A completed shift isn't payable until the worker adds notes.
              const needsNotes = !s.progressNote?.trim();

              // Build the data for the "View" detail card + map.
              const pt = (
                la: number | null,
                lo: number | null,
              ): LatLng | null =>
                la != null && lo != null ? { lat: la, lng: lo } : null;
              const center = pt(s.client.lat, s.client.lng);
              const clockIn = pt(s.clockInLat, s.clockInLng);
              const clockOut = pt(s.clockOutLat, s.clockOutLng);
              const trips = s.transports.map((t) => {
                let path = t.points.map((p) => ({ lat: p.lat, lng: p.lng }));
                if (path.length === 0) {
                  // Fall back to start/end markers if no trail was recorded.
                  const a = pt(t.startLat, t.startLng);
                  const b = pt(t.endLat, t.endLng);
                  path = [a, b].filter(Boolean) as LatLng[];
                }
                return { purpose: t.purpose, km: t.km, path };
              });
              const hasMap =
                !!center ||
                !!clockIn ||
                !!clockOut ||
                trips.some((t) => t.path.length > 0);
              const detail: ShiftDetailData = {
                id: s.id,
                worker: s.staff
                  ? `${s.staff.firstName} ${s.staff.lastName}`
                  : "—",
                client: `${s.client.firstName} ${s.client.lastName}`,
                dateLabel: fmtDate(s.start),
                scheduledLabel: `${fmtTime(s.start)} – ${fmtTime(s.end)}`,
                clockInTime: hhmm(s.clockInAt),
                clockOutTime: hhmm(s.clockOutAt),
                clockInLabel: s.clockInAt ? fmtTime(s.clockInAt) : "—",
                clockOutLabel: s.clockOutAt ? fmtTime(s.clockOutAt) : "—",
                netHours: net,
                breakHours: breakHrs,
                breaks: s.pauses
                  .filter((p) => p.endAt)
                  .map(
                    (p) => `${fmtTime(p.startAt)}–${fmtTime(p.endAt)}`,
                  ),
                totalKm: km,
                driving: (() => {
                  const speeds = s.transports
                    .flatMap((t) => t.points.map((p) => p.speedKmh))
                    .filter((v): v is number => v != null && v >= 0);
                  const events = s.transports.flatMap((t) =>
                    t.speedEvents.map((e) => ({
                      at: fmtTime(e.at),
                      speedKmh: Math.round(e.speedKmh),
                      limitKmh: e.limitKmh,
                      overByKmh: Math.round(e.overByKmh),
                      roadName: e.roadName,
                    })),
                  );
                  if (speeds.length === 0 && events.length === 0) return null;
                  return {
                    maxKmh: speeds.length ? Math.round(Math.max(...speeds)) : 0,
                    avgKmh: speeds.length
                      ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length)
                      : 0,
                    events,
                  };
                })(),
                note: s.progressNote ?? "",
                approval: s.approval,
                needsNotes,
                hasMap,
                center,
                radiusM: (s.client.geofenceFt ?? 150) / FT_PER_M,
                clockIn,
                clockOut,
                trips,
                transports: s.transports.map((t) => ({
                  id: t.id,
                  purpose: t.purpose,
                  km: t.km,
                })),
              };
              return (
                <tr key={s.id} className="align-top hover:bg-slate-50">
                  <td className="px-5 py-3">
                    {s.staff ? (
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                          {initials(s.staff.firstName, s.staff.lastName)}
                        </span>
                        <span className="whitespace-nowrap text-slate-700">
                          {s.staff.firstName} {s.staff.lastName}
                        </span>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-600">
                    <div className="whitespace-nowrap">
                      {s.client.firstName} {s.client.lastName}
                    </div>
                    {s.progressNote && (
                      <div className="mt-0.5 max-w-[200px] truncate text-xs text-slate-400" title={s.progressNote}>
                        “{s.progressNote}”
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap text-slate-600">{fmtDate(s.start)}</td>
                  <td className="px-5 py-3">
                    {s.clockInAt ? (
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
                        <span
                          className="material-symbols-rounded text-[15px] leading-none"
                          style={{ fontVariationSettings: "'FILL' 0" }}
                        >
                          schedule
                        </span>
                        {fmtTime(s.clockInAt)}–
                        {s.clockOutAt ? fmtTime(s.clockOutAt) : "…"}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 font-medium text-slate-700">
                    {net.toFixed(2)}h
                    {breakHrs > 0 && (
                      <div className="text-xs font-normal text-amber-600">
                        −{breakHrs.toFixed(2)}h break
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {km > 0 ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-2.5 py-1 font-medium text-violet-700">
                        <span
                          className="material-symbols-rounded text-[15px] leading-none"
                          style={{ fontVariationSettings: "'FILL' 0" }}
                        >
                          directions_car
                        </span>
                        {km.toFixed(1)} km
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {needsNotes ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                        <span
                          className="material-symbols-rounded text-[13px] leading-none"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          warning
                        </span>
                        Notes pending
                      </span>
                    ) : (
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${approvalStyle[s.approval]}`}
                      >
                        {s.approval.toLowerCase()}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <ShiftDetail data={detail} />
                      {!needsNotes && s.approval === "PENDING" && (
                        <>
                          <form action={setApproval}>
                            <input type="hidden" name="shiftId" value={s.id} />
                            <input type="hidden" name="approval" value="APPROVED" />
                            <button className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700">
                              Approve
                            </button>
                          </form>
                          <form action={setApproval}>
                            <input type="hidden" name="shiftId" value={s.id} />
                            <input type="hidden" name="approval" value="REJECTED" />
                            <button className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                              Reject
                            </button>
                          </form>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {shifts.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-slate-400">
                  No completed shifts yet. Once a worker clocks out, timesheets
                  appear here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
