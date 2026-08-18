import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/roles";
import { loadPricedShifts, groupTotals } from "@/lib/salesData";
import { aud, emptyTotals, addMargin, type MarginTotals } from "@/lib/billing";
import {
  bucketsFor,
  parsePeriod,
  periodLabel,
  rangeFor,
  type PeriodKind,
} from "@/lib/period";

export const dynamic = "force-dynamic";

/**
 * Sales & Profit — super admin only.
 *
 * Revenue is what participants were charged for delivered support; cost is
 * what it took to deliver (wages + superannuation + mileage). The gap is the
 * real margin.
 */
export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; offset?: string; client?: string }>;
}) {
  const { tenant, session } = await requireTenant();
  if (!isSuperAdmin(session.role)) redirect("/dashboard");

  const sp = await searchParams;
  const period: PeriodKind = parsePeriod(sp.period);
  const offset = Math.max(0, Math.min(24, Number(sp.offset ?? 0) || 0));
  const clientId = sp.client || undefined;
  const { from, to } = rangeFor(period, offset);

  const [{ shifts, totals }, clients] = await Promise.all([
    loadPricedShifts({ tenantId: tenant.id, from, to, clientId }),
    prisma.client.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: "asc" },
    }),
  ]);

  const superPct = Math.round(tenant.superRate * 100);

  // ── chart buckets ──
  const buckets = bucketsFor(period, from, to).map((b) => {
    let t = emptyTotals();
    for (const s of shifts) {
      if (s.start >= b.from && s.start <= b.to) t = addMargin(t, s.margin);
    }
    return { ...b, totals: t };
  });
  const peak = Math.max(1, ...buckets.map((b) => Math.max(b.totals.revenue, b.totals.cost)));

  // ── breakdowns ──
  const byClient = [...groupTotals(shifts, (s) => s.clientName)].sort(
    (a, b) => b[1].profit - a[1].profit,
  );
  const byWorker = [...groupTotals(shifts, (s) => s.staffName)].sort(
    (a, b) => b[1].cost - a[1].cost,
  );

  const unratedCount = shifts.filter((s) => s.unrated).length;

  const qs = (over: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    p.set("period", String(over.period ?? period));
    if ((over.offset ?? offset) !== 0) p.set("offset", String(over.offset ?? offset));
    const c = over.client === "" ? undefined : (over.client ?? clientId);
    if (c) p.set("client", String(c));
    return `?${p.toString()}`;
  };

  const Kpi = ({
    label,
    value,
    sub,
    tone,
  }: {
    label: string;
    value: string;
    sub?: string;
    tone?: "revenue" | "cost" | "profit";
  }) => (
    <div
      className={`rounded-2xl p-5 shadow-sm ${
        tone === "profit"
          ? "bg-[var(--brand)] text-white"
          : "border border-[var(--border)] bg-white"
      }`}
    >
      <div
        className={`text-xs font-semibold uppercase tracking-wide ${
          tone === "profit" ? "text-white/70" : "text-[var(--text-muted)]"
        }`}
      >
        {label}
      </div>
      <div
        className={`mt-1 text-3xl font-bold ${
          tone === "profit"
            ? "text-white"
            : tone === "cost"
              ? "text-orange-600"
              : "text-[var(--text-primary)]"
        }`}
      >
        {value}
      </div>
      {sub && (
        <div
          className={`mt-1 text-xs ${
            tone === "profit" ? "text-white/70" : "text-[var(--text-secondary)]"
          }`}
        >
          {sub}
        </div>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl p-6 lg:p-8">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Sales &amp; Profit
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            {periodLabel(period, from, to)} · cost includes {superPct}% super
          </p>
        </div>
        <a
          href={`/sales-doc${qs({})}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm"
        >
          <span className="material-symbols-rounded text-[18px]">picture_as_pdf</span>
          Download PDF
        </a>
      </header>

      {/* Period + client filters */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {(["week", "month", "year"] as PeriodKind[]).map((p) => (
          <Link
            key={p}
            href={qs({ period: p, offset: 0 })}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
              period === p
                ? "bg-[var(--brand)] text-white"
                : "bg-white text-[var(--text-secondary)] hover:bg-[var(--background)]"
            }`}
          >
            {p === "week" ? "Weekly" : p === "month" ? "Monthly" : "Yearly"}
          </Link>
        ))}

        <span className="mx-1 h-5 w-px bg-[var(--border)]" />

        <Link
          href={qs({ offset: offset + 1 })}
          className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-[var(--text-secondary)]"
        >
          ← Previous
        </Link>
        {offset > 0 && (
          <Link
            href={qs({ offset: offset - 1 })}
            className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-[var(--text-secondary)]"
          >
            Next →
          </Link>
        )}

        <span className="mx-1 h-5 w-px bg-[var(--border)]" />

        <form method="get" className="flex items-center gap-2">
          <input type="hidden" name="period" value={period} />
          {offset > 0 && <input type="hidden" name="offset" value={offset} />}
          <select
            name="client"
            defaultValue={clientId ?? ""}
            className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm"
          >
            <option value="">All participants</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName} {c.lastName}
              </option>
            ))}
          </select>
          <button className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold">
            Apply
          </button>
        </form>
      </div>

      {/* KPIs */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Income"
          value={aud(totals.revenue)}
          sub={`${totals.shifts} shifts · ${totals.hours.toFixed(0)}h`}
          tone="revenue"
        />
        <Kpi
          label="Cost"
          value={aud(totals.cost)}
          sub={`wages ${aud(totals.wages)} + super ${aud(totals.super)}`}
          tone="cost"
        />
        <Kpi
          label="Profit"
          value={aud(totals.profit)}
          sub={
            totals.marginPct != null
              ? `${totals.marginPct.toFixed(1)}% margin`
              : "no income recorded"
          }
          tone="profit"
        />
        <Kpi
          label="Average per hour"
          value={
            totals.hours > 0 ? aud(totals.profit / totals.hours) : "—"
          }
          sub="profit per support hour"
        />
      </div>

      {unratedCount > 0 && (
        <p className="mb-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>{unratedCount}</strong> shift{unratedCount === 1 ? "" : "s"} had
          no charge rate, so they count as $0 income and drag the profit down.
          Set rates in{" "}
          <Link href="/settings" className="font-semibold underline">
            Settings → Charge rates
          </Link>
          .
        </p>
      )}

      {/* Trend */}
      <section className="mb-6 rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-[var(--text-primary)]">
            Income vs cost
          </h2>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-[var(--brand)]" />
              Income
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-orange-400" />
              Cost
            </span>
          </div>
        </div>

        <div className="flex items-end gap-2 overflow-x-auto pb-1" style={{ height: 200 }}>
          {buckets.map((b) => {
            const rH = Math.round((b.totals.revenue / peak) * 150);
            const cH = Math.round((b.totals.cost / peak) * 150);
            return (
              <div key={b.key} className="flex min-w-[38px] flex-1 flex-col items-center gap-1">
                <div className="flex h-[150px] w-full items-end justify-center gap-1">
                  <div
                    className="w-1/2 rounded-t bg-[var(--brand)] transition-all"
                    style={{ height: `${rH}px` }}
                    title={`Income ${aud(b.totals.revenue)}`}
                  />
                  <div
                    className="w-1/2 rounded-t bg-orange-400 transition-all"
                    style={{ height: `${cH}px` }}
                    title={`Cost ${aud(b.totals.cost)}`}
                  />
                </div>
                <div className="text-[11px] font-medium text-[var(--text-muted)]">
                  {b.label}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Breakdowns */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Breakdown
          title="Profit by participant"
          rows={byClient}
          metric={(t) => t.profit}
          format={(t) => aud(t.profit)}
          sub={(t) =>
            t.marginPct != null ? `${t.marginPct.toFixed(0)}% margin` : "—"
          }
        />
        <Breakdown
          title="Cost by worker"
          rows={byWorker}
          metric={(t) => t.cost}
          format={(t) => aud(t.cost)}
          sub={(t) => `${t.hours.toFixed(1)}h · ${t.shifts} shifts`}
          bar="bg-orange-400"
        />
      </div>

      {shifts.length === 0 && (
        <p className="mt-6 rounded-2xl border border-[var(--border)] bg-white p-10 text-center text-sm text-[var(--text-secondary)]">
          No completed shifts in this period.
        </p>
      )}
    </div>
  );
}

function Breakdown({
  title,
  rows,
  metric,
  format,
  sub,
  bar = "bg-[var(--brand)]",
}: {
  title: string;
  rows: [string, MarginTotals][];
  metric: (t: MarginTotals) => number;
  format: (t: MarginTotals) => string;
  sub: (t: MarginTotals) => string;
  bar?: string;
}) {
  const peak = Math.max(1, ...rows.map(([, t]) => Math.abs(metric(t))));

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm">
      <h2 className="mb-4 font-semibold text-[var(--text-primary)]">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">Nothing yet.</p>
      ) : (
        <div className="space-y-3">
          {rows.slice(0, 8).map(([name, t]) => {
            const value = metric(t);
            const pct = Math.round((Math.abs(value) / peak) * 100);
            return (
              <div key={name}>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-[var(--text-primary)]">
                    {name}
                  </span>
                  <span className="shrink-0 text-sm font-bold text-[var(--text-primary)]">
                    {format(t)}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--background)]">
                  <div
                    className={`h-full rounded-full ${value < 0 ? "bg-red-400" : bar}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                  {sub(t)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
