import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { isManager, isSuperAdmin } from "@/lib/roles";
import { fmtDate } from "@/lib/format";
import { budgetFor, loadPricedShifts } from "@/lib/salesData";
import { aud, aud2, chargeRatesFor } from "@/lib/billing";
import { tzForState, fmtInTz } from "@/lib/timezone";
import {
  AGREEMENT_LABELS,
  DAY_TYPE_LABELS,
  type AgreementType,
  type DayType,
} from "@/lib/constants";

export const dynamic = "force-dynamic";

/** The participant's whole picture on one page: plan, budget, team, activity. */
export default async function ClientProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { tenant, session } = await requireTenant();
  if (!isManager(session.role)) redirect("/dashboard");
  const showMoney = isSuperAdmin(session.role);

  const { id } = await params;

  const client = await prisma.client.findFirst({
    where: { id, tenantId: tenant.id },
    include: {
      branch: { select: { name: true, state: true } },
      carePlan: true,
      workers: { include: { staff: true } },
      _count: { select: { shifts: true } },
    },
  });
  if (!client) notFound();

  const tz = tzForState(client.branch?.state);

  const [budget, defaults, recent, upcoming] = await Promise.all([
    budgetFor(tenant.id, client.id),
    prisma.chargeDefault.findMany({ where: { tenantId: tenant.id } }),
    loadPricedShifts({
      tenantId: tenant.id,
      clientId: client.id,
      from: new Date(Date.now() - 90 * 24 * 3_600_000),
      to: new Date(),
    }),
    prisma.shift.findMany({
      where: {
        tenantId: tenant.id,
        clientId: client.id,
        start: { gte: new Date() },
        status: { in: ["SCHEDULED", "IN_PROGRESS"] },
      },
      include: { staff: true },
      orderBy: { start: "asc" },
      take: 5,
    }),
  ]);

  const { grid, mileageRate, overridden } = chargeRatesFor(client, defaults);
  const noRates = grid.WEEKDAY_DAY === 0;

  const used = budget.usedPct;
  const barColour =
    used == null
      ? "bg-slate-300"
      : used >= 90
        ? "bg-red-500"
        : used >= 75
          ? "bg-amber-500"
          : "bg-emerald-500";

  const Stat = ({
    label,
    value,
    sub,
    tone = "default",
  }: {
    label: string;
    value: string;
    sub?: string;
    tone?: "default" | "good" | "warn";
  }) => (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </div>
      <div
        className={`mt-1 text-2xl font-bold ${
          tone === "good"
            ? "text-emerald-600"
            : tone === "warn"
              ? "text-red-600"
              : "text-[var(--text-primary)]"
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-[var(--text-secondary)]">{sub}</div>}
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl p-6 lg:p-8">
      <Link
        href="/clients"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <span className="material-symbols-rounded text-[18px]">arrow_back</span>
        Participants
      </Link>

      {/* Header */}
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--brand)] text-lg font-bold text-white">
            {client.firstName[0]}
            {client.lastName[0]}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              {client.firstName} {client.lastName}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
              <span className="rounded-full bg-[var(--background)] px-2 py-0.5 text-xs font-semibold">
                {AGREEMENT_LABELS[client.agreementType as AgreementType] ??
                  client.agreementType}
              </span>
              {client.ndisNumber && <span>{client.ndisNumber}</span>}
              {client.branch?.name && <span>· {client.branch.name}</span>}
              {!client.active && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                  Archived
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/clients/${client.id}/plan`}
            className="rounded-xl border border-[var(--border)] bg-white px-3.5 py-2 text-sm font-semibold text-[var(--text-primary)]"
          >
            Weekly plan
          </Link>
          <Link
            href={`/clients/${client.id}/care-plan`}
            className="rounded-xl border border-[var(--border)] bg-white px-3.5 py-2 text-sm font-semibold text-[var(--text-primary)]"
          >
            Care plan
          </Link>
          <Link
            href={`/clients/${client.id}/team`}
            className="rounded-xl border border-[var(--border)] bg-white px-3.5 py-2 text-sm font-semibold text-[var(--text-primary)]"
          >
            Team
          </Link>
        </div>
      </header>

      {/* ── Budget ── */}
      <section className="mb-6 rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold text-[var(--text-primary)]">
              Plan budget
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              {budget.planStart && budget.planEnd
                ? `${fmtDate(budget.planStart)} – ${fmtDate(budget.planEnd)}`
                : "No plan dates set"}
            </p>
          </div>
          {used != null && (
            <div className="text-right">
              <div className="text-3xl font-bold text-[var(--text-primary)]">
                {used.toFixed(1)}%
              </div>
              <div className="text-xs text-[var(--text-secondary)]">used</div>
            </div>
          )}
        </div>

        {budget.budget > 0 ? (
          <>
            <div className="h-3 w-full overflow-hidden rounded-full bg-[var(--background)]">
              <div
                className={`h-full rounded-full transition-all ${barColour}`}
                style={{ width: `${Math.min(100, used ?? 0)}%` }}
              />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Stat label="Budget" value={aud(budget.budget)} />
              <Stat
                label="Delivered"
                value={aud(budget.spent)}
                sub={`${budget.totals.shifts} shift${budget.totals.shifts === 1 ? "" : "s"} · ${budget.totals.hours.toFixed(1)}h`}
              />
              <Stat
                label="Remaining"
                value={aud(budget.remaining)}
                tone={budget.remaining < 0 ? "warn" : "good"}
                sub={
                  budget.upcomingShifts > 0
                    ? `${budget.upcomingShifts} shift${budget.upcomingShifts === 1 ? "" : "s"} still booked`
                    : undefined
                }
              />
            </div>

            {budget.remaining < 0 && (
              <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                This plan is over budget by {aud(Math.abs(budget.remaining))}.
              </p>
            )}
            {used != null && used >= 90 && budget.remaining >= 0 && (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                Nearly exhausted — {aud(budget.remaining)} left.
              </p>
            )}
          </>
        ) : (
          <p className="rounded-xl bg-[var(--background)] px-4 py-3 text-sm text-[var(--text-secondary)]">
            No plan budget set. Add one on the participant&apos;s details to
            track drawdown.
          </p>
        )}

        {noRates && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
            No charge rate set for{" "}
            {AGREEMENT_LABELS[client.agreementType as AgreementType]} — delivered
            support is counting as $0. Set rates in{" "}
            <Link href="/settings" className="font-semibold underline">
              Settings
            </Link>
            , or on this participant.
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* ── Recent activity ── */}
        <section className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-semibold text-[var(--text-primary)]">
            Recent support (90 days)
          </h2>

          {recent.shifts.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">
              No completed shifts yet.
            </p>
          ) : (
            <div className="space-y-2">
              {recent.shifts
                .slice()
                .reverse()
                .slice(0, 12)
                .map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[var(--text-primary)]">
                        {s.staffName}
                      </div>
                      <div className="text-xs text-[var(--text-secondary)]">
                        {fmtInTz(s.start, tz, {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}{" "}
                        ·{" "}
                        {fmtInTz(s.start, tz, {
                          hour: "numeric",
                          minute: "2-digit",
                        })}{" "}
                        · {s.margin.hours.toFixed(2)}h ·{" "}
                        {DAY_TYPE_LABELS[s.margin.dayType as DayType]}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-[var(--text-primary)]">
                        {aud2(s.margin.revenue)}
                      </div>
                      {showMoney && (
                        <div className="text-[11px] text-[var(--text-muted)]">
                          cost {aud2(s.margin.cost)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </section>

        {/* ── Side column ── */}
        <div className="space-y-6">
          <section className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm">
            <h2 className="mb-3 font-semibold text-[var(--text-primary)]">
              Charge rates
              {overridden && (
                <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                  custom
                </span>
              )}
            </h2>
            <ul className="space-y-1.5 text-sm">
              {(Object.keys(grid) as DayType[]).map((d) => (
                <li key={d} className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">
                    {DAY_TYPE_LABELS[d]}
                  </span>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {grid[d] > 0 ? `${aud2(grid[d])}/hr` : "—"}
                  </span>
                </li>
              ))}
              <li className="flex justify-between border-t border-[var(--border)] pt-1.5">
                <span className="text-[var(--text-secondary)]">Mileage</span>
                <span className="font-semibold text-[var(--text-primary)]">
                  {mileageRate > 0 ? `${aud2(mileageRate)}/km` : "—"}
                </span>
              </li>
            </ul>
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm">
            <h2 className="mb-3 font-semibold text-[var(--text-primary)]">
              Support team
            </h2>
            {client.workers.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">
                No workers allocated yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {client.workers.map((w) => (
                  <li key={w.id} className="flex items-center gap-2 text-sm">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--background)] text-[11px] font-bold text-[var(--text-secondary)]">
                      {w.staff.firstName[0]}
                      {w.staff.lastName[0]}
                    </span>
                    {w.staff.firstName} {w.staff.lastName}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm">
            <h2 className="mb-3 font-semibold text-[var(--text-primary)]">
              Coming up
            </h2>
            {upcoming.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">
                Nothing booked in.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {upcoming.map((s) => (
                  <li key={s.id} className="flex justify-between gap-2">
                    <span className="text-[var(--text-secondary)]">
                      {fmtInTz(s.start, tz, {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="font-medium text-[var(--text-primary)]">
                      {s.staff
                        ? `${s.staff.firstName} ${s.staff.lastName}`
                        : "Unassigned"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm">
            <h2 className="mb-3 font-semibold text-[var(--text-primary)]">
              Details
            </h2>
            <dl className="space-y-2 text-sm">
              {client.address && (
                <div>
                  <dt className="text-xs text-[var(--text-muted)]">Address</dt>
                  <dd className="text-[var(--text-primary)]">{client.address}</dd>
                </div>
              )}
              {client.phone && (
                <div>
                  <dt className="text-xs text-[var(--text-muted)]">Phone</dt>
                  <dd>
                    <a
                      href={`tel:${client.phone}`}
                      className="font-medium text-[var(--brand)]"
                    >
                      {client.phone}
                    </a>
                  </dd>
                </div>
              )}
              {client.weeklyHours != null && (
                <div>
                  <dt className="text-xs text-[var(--text-muted)]">
                    Agreed weekly hours
                  </dt>
                  <dd className="text-[var(--text-primary)]">
                    {client.weeklyHours}h
                  </dd>
                </div>
              )}
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
