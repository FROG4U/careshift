import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { isManager } from "@/lib/roles";
import { netHoursOf } from "@/lib/payroll";
import { fmtInTz, tzForState } from "@/lib/timezone";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

/**
 * Print-ready A4 record of shift notes — the progress note each worker wrote,
 * with the date, times and hours of the visit.
 *
 * Care providers are asked for these during audits and by plan managers and
 * families, so it mirrors the Timesheets filters exactly: whatever is on
 * screen is what prints.
 */
export default async function TimesheetNotesDoc({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    from?: string;
    to?: string;
    month?: string;
    client?: string;
    staff?: string;
  }>;
}) {
  // Outside the (app) layout, so an auth failure would be a 500.
  const ctx = await requireTenant().catch(() => null);
  if (!ctx) redirect("/login");
  const { tenant, session } = ctx;
  if (!isManager(session.role)) redirect("/dashboard");

  const { q, from, to, month, client, staff } = await searchParams;
  const query = (q ?? "").trim().toLowerCase();

  // Same window logic as the Timesheets page: a month wins over from/to.
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
      end.setDate(end.getDate() + 1);
    }
  }

  const rows = await prisma.shift.findMany({
    where: {
      tenantId: tenant.id,
      status: "COMPLETED",
      ...(client ? { clientId: client } : {}),
      ...(staff ? { staffId: staff } : {}),
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
      branch: { select: { state: true } },
    },
    orderBy: { start: "asc" },
  });

  const shifts = query
    ? rows.filter((s) =>
        `${s.staff?.firstName ?? ""} ${s.staff?.lastName ?? ""} ${s.client.firstName} ${s.client.lastName}`
          .toLowerCase()
          .includes(query),
      )
    : rows;

  const [clientRow, staffRow] = await Promise.all([
    client
      ? prisma.client.findFirst({
          where: { id: client, tenantId: tenant.id },
          select: { firstName: true, lastName: true, ndisNumber: true },
        })
      : Promise.resolve(null),
    staff
      ? prisma.staff.findFirst({
          where: { id: staff, tenantId: tenant.id },
          select: { firstName: true, lastName: true },
        })
      : Promise.resolve(null),
  ]);

  const brand = tenant.brandColor || "#003146";
  const generated = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());

  const rangeText = (() => {
    const d = (x: Date) =>
      new Intl.DateTimeFormat("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(x);
    if (month && start) {
      return new Intl.DateTimeFormat("en-AU", {
        month: "long",
        year: "numeric",
      }).format(start);
    }
    if (start && end) {
      const last = new Date(end);
      last.setDate(last.getDate() - 1);
      return `${d(start)} – ${d(last)}`;
    }
    if (start) return `From ${d(start)}`;
    if (end) {
      const last = new Date(end);
      last.setDate(last.getDate() - 1);
      return `Up to ${d(last)}`;
    }
    return "All dates";
  })();

  const withNotes = shifts.filter((s) => s.progressNote?.trim()).length;
  const totalHours = shifts.reduce((sum, s) => sum + netHoursOf(s), 0);

  return (
    <div className="mx-auto max-w-[900px] bg-white px-10 py-8 text-slate-900">
      <PrintButton backHref="/timesheets" />

      <header
        className="mb-6 flex items-start justify-between border-b-2 pb-5"
        style={{ borderColor: brand }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl text-lg font-bold text-white"
            style={{ background: brand }}
          >
            {tenant.name[0]}
          </div>
          <div>
            <div className="text-lg font-bold leading-tight">{tenant.name}</div>
            <div className="text-xs text-slate-500">Shift Notes Record</div>
          </div>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div>Generated {generated}</div>
          <div>By {session.name}</div>
          <div className="mt-1 font-semibold text-slate-700">
            Contains participant care information
          </div>
        </div>
      </header>

      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">{rangeText}</h1>
        <p className="text-sm text-slate-600">
          {clientRow
            ? `${clientRow.firstName} ${clientRow.lastName}${clientRow.ndisNumber ? ` · ${clientRow.ndisNumber}` : ""}`
            : "All participants"}{" "}
          ·{" "}
          {staffRow
            ? `${staffRow.firstName} ${staffRow.lastName}`
            : "All workers"}{" "}
          · {shifts.length} shift{shifts.length === 1 ? "" : "s"} ·{" "}
          {totalHours.toFixed(1)} hours
        </p>
        {withNotes < shifts.length && (
          <p className="mt-1 text-xs font-semibold text-amber-700">
            {shifts.length - withNotes} of these shifts have no notes recorded.
          </p>
        )}
      </div>

      {shifts.length === 0 ? (
        <p className="rounded border border-slate-200 p-8 text-center text-sm text-slate-500">
          No completed shifts match these filters.
        </p>
      ) : (
        <div>
          {shifts.map((s) => {
            const tz = tzForState(s.branch?.state);
            const t = (d: Date) =>
              fmtInTz(d, tz, { hour: "numeric", minute: "2-digit" });

            return (
              <article
                key={s.id}
                className="break-inside-avoid border-b border-slate-200 py-3"
              >
                <div className="text-sm font-bold">
                  {fmtInTz(s.start, tz, {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  {"  "}
                  {t(s.start)} – {t(s.end)}
                </div>

                <div className="text-xs text-slate-600">
                  {s.client.firstName} {s.client.lastName} ·{" "}
                  {s.staff
                    ? `${s.staff.firstName} ${s.staff.lastName}`
                    : "Unassigned"}{" "}
                  · {netHoursOf(s).toFixed(2)} h
                </div>

                {s.progressNote?.trim() ? (
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">
                    {s.progressNote}
                  </p>
                ) : (
                  <p className="mt-1.5 text-sm italic text-slate-500">
                    No notes recorded.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}

      <footer className="mt-8 border-t border-slate-200 pt-3 text-[11px] text-slate-500">
        {tenant.name} · Shift Notes · {rangeText} · Generated {generated} ·
        Page notes are the support worker&apos;s own record of the visit.
      </footer>
    </div>
  );
}
