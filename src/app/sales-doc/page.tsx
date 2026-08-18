import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/roles";
import { loadPricedShifts, groupTotals } from "@/lib/salesData";
import { aud, aud2 } from "@/lib/billing";
import {
  parsePeriod,
  parseRange,
  periodLabel,
  rangeFor,
  rangeLabel,
  type PeriodKind,
} from "@/lib/period";
import { AutoPrint } from "../payroll-doc/[id]/AutoPrint";

export const dynamic = "force-dynamic";

/**
 * Print-ready A4 sales & profit report. Lives OUTSIDE the (app) layout so
 * there's no sidebar or nav — what you see is the page that prints.
 */
export default async function SalesDoc({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    offset?: string;
    client?: string;
    branch?: string;
    from?: string;
    to?: string;
  }>;
}) {
  // These standalone doc pages sit outside the (app) layout, so a thrown
  // "Not authenticated" would surface as a 500 rather than a login prompt.
  const ctx = await requireTenant().catch(() => null);
  if (!ctx) redirect("/login");
  const { tenant, session } = ctx;
  if (!isSuperAdmin(session.role)) redirect("/dashboard");

  const sp = await searchParams;
  const period: PeriodKind = parsePeriod(sp.period);
  const offset = Math.max(0, Math.min(24, Number(sp.offset ?? 0) || 0));
  const clientId = sp.client || undefined;
  const branchId = sp.branch || undefined;
  const custom = parseRange(sp.from, sp.to);
  const { from, to } = custom ?? rangeFor(period, offset);

  const [{ shifts, totals }, client, branch] = await Promise.all([
    loadPricedShifts({ tenantId: tenant.id, from, to, clientId, branchId }),
    clientId
      ? prisma.client.findFirst({
          where: { id: clientId, tenantId: tenant.id },
          select: { firstName: true, lastName: true, agreementType: true },
        })
      : Promise.resolve(null),
    branchId
      ? prisma.branch.findFirst({
          where: { id: branchId, tenantId: tenant.id },
          select: { name: true },
        })
      : Promise.resolve(null),
  ]);

  const byClient = [...groupTotals(shifts, (s) => s.clientName)].sort(
    (a, b) => b[1].profit - a[1].profit,
  );
  const byWorker = [...groupTotals(shifts, (s) => s.staffName)].sort(
    (a, b) => b[1].cost - a[1].cost,
  );

  const brand = tenant.brandColor || "#003146";
  const superPct = Math.round(tenant.superRate * 100);
  const generated = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());

  const Cell = ({
    children,
    align = "left",
    bold = false,
  }: {
    children: React.ReactNode;
    align?: "left" | "right";
    bold?: boolean;
  }) => (
    <td
      className={`border-b border-slate-200 px-2 py-1.5 ${
        align === "right" ? "text-right tabular-nums" : ""
      } ${bold ? "font-semibold" : ""}`}
    >
      {children}
    </td>
  );

  return (
    <div className="mx-auto max-w-[900px] bg-white px-10 py-8 text-slate-900">
      <AutoPrint />

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
            <div className="text-xs text-slate-500">Sales &amp; Profit Report</div>
          </div>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div>Generated {generated}</div>
          <div>By {session.name}</div>
          <div className="mt-1 font-semibold text-slate-700">
            Commercial in confidence
          </div>
        </div>
      </header>

      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">
          {custom ? rangeLabel(from, to) : periodLabel(period, from, to)}
        </h1>
        <p className="text-sm text-slate-600">
          {client
            ? `${client.firstName} ${client.lastName} · ${client.agreementType}`
            : "All participants"}{" "}
          · {branch ? `${branch.name} branch` : "All branches"} ·{" "}
          {totals.shifts} completed shift{totals.shifts === 1 ? "" : "s"} ·{" "}
          {totals.hours.toFixed(1)} hours
        </p>
      </div>

      {/* Headline figures */}
      <div className="mb-6 grid grid-cols-4 gap-3">
        {[
          ["Income", aud(totals.revenue)],
          ["Cost", aud(totals.cost)],
          ["Profit", aud(totals.profit)],
          [
            "Margin",
            totals.marginPct != null ? `${totals.marginPct.toFixed(1)}%` : "—",
          ],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 p-3">
            <div className="text-lg font-bold">{value}</div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Cost make-up — the whole point of the report */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
          How the profit is worked out
        </h2>
        <table className="w-full border-collapse text-sm">
          <tbody>
            <tr>
              <Cell>Support hours charged ({totals.hours.toFixed(1)}h)</Cell>
              <Cell align="right">{aud2(totals.supportRevenue)}</Cell>
            </tr>
            <tr>
              <Cell>Mileage charged ({totals.km.toFixed(1)} km)</Cell>
              <Cell align="right">{aud2(totals.mileageRevenue)}</Cell>
            </tr>
            <tr className="bg-slate-50">
              <Cell bold>Total income</Cell>
              <Cell align="right" bold>
                {aud2(totals.revenue)}
              </Cell>
            </tr>
            <tr>
              <Cell>Worker wages</Cell>
              <Cell align="right">−{aud2(totals.wages)}</Cell>
            </tr>
            <tr>
              <Cell>Superannuation ({superPct}% of wages)</Cell>
              <Cell align="right">−{aud2(totals.super)}</Cell>
            </tr>
            <tr>
              <Cell>Mileage reimbursed to workers</Cell>
              <Cell align="right">−{aud2(totals.mileageCost)}</Cell>
            </tr>
            <tr className="bg-slate-50">
              <Cell bold>Profit after all costs</Cell>
              <Cell align="right" bold>
                {aud2(totals.profit)}
              </Cell>
            </tr>
          </tbody>
        </table>

        {totals.km > 0 && (
          <p className="mt-2 text-[11px] text-slate-600">
            Mileage sits on both sides: {totals.km.toFixed(1)} km charged at{" "}
            {aud2(totals.mileageRevenue)} and reimbursed at{" "}
            {aud2(totals.mileageCost)} — a{" "}
            {totals.mileageRevenue - totals.mileageCost >= 0 ? "margin" : "shortfall"}{" "}
            of {aud2(Math.abs(totals.mileageRevenue - totals.mileageCost))}.
          </p>
        )}

        <p className="mt-2 text-[11px] text-slate-500">
          Superannuation is applied to wages only — mileage is an allowance and
          is not ordinary time earnings. Figures cover completed shifts in the
          period and exclude overheads such as office costs and insurance.
        </p>
      </section>

      {/* Per participant */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
          By participant
        </h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-slate-300 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-2 font-semibold">Participant</th>
              <th className="px-2 py-2 text-right font-semibold">Shifts</th>
              <th className="px-2 py-2 text-right font-semibold">Hours</th>
              <th className="px-2 py-2 text-right font-semibold">Income</th>
              <th className="px-2 py-2 text-right font-semibold">Cost</th>
              <th className="px-2 py-2 text-right font-semibold">Profit</th>
              <th className="px-2 py-2 text-right font-semibold">Margin</th>
            </tr>
          </thead>
          <tbody>
            {byClient.map(([name, t]) => (
              <tr key={name}>
                <Cell>{name}</Cell>
                <Cell align="right">{t.shifts}</Cell>
                <Cell align="right">{t.hours.toFixed(1)}</Cell>
                <Cell align="right">{aud2(t.revenue)}</Cell>
                <Cell align="right">{aud2(t.cost)}</Cell>
                <Cell align="right" bold>
                  {aud2(t.profit)}
                </Cell>
                <Cell align="right">
                  {t.marginPct != null ? `${t.marginPct.toFixed(0)}%` : "—"}
                </Cell>
              </tr>
            ))}
            {byClient.length === 0 && (
              <tr>
                <Cell>No completed shifts in this period.</Cell>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Per worker */}
      <section className="mb-8">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
          Delivery cost by worker
        </h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-slate-300 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-2 font-semibold">Worker</th>
              <th className="px-2 py-2 text-right font-semibold">Shifts</th>
              <th className="px-2 py-2 text-right font-semibold">Hours</th>
              <th className="px-2 py-2 text-right font-semibold">Wages</th>
              <th className="px-2 py-2 text-right font-semibold">Super</th>
              <th className="px-2 py-2 text-right font-semibold">Mileage</th>
              <th className="px-2 py-2 text-right font-semibold">Total cost</th>
            </tr>
          </thead>
          <tbody>
            {byWorker.map(([name, t]) => (
              <tr key={name}>
                <Cell>{name}</Cell>
                <Cell align="right">{t.shifts}</Cell>
                <Cell align="right">{t.hours.toFixed(1)}</Cell>
                <Cell align="right">{aud2(t.wages)}</Cell>
                <Cell align="right">{aud2(t.super)}</Cell>
                <Cell align="right">{aud2(t.mileageCost)}</Cell>
                <Cell align="right" bold>
                  {aud2(t.cost)}
                </Cell>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className="border-t border-slate-200 pt-3 text-[11px] text-slate-500">
        {tenant.name} · Sales &amp; Profit · {periodLabel(period, from, to)} ·
        Generated {generated}
      </footer>
    </div>
  );
}
