import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/format";

const money = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

/**
 * "My payroll" - every pay run the office has completed for this worker.
 *
 * Reads the frozen PayrollLine written at completion, not a live
 * recalculation. That is the point: these are figures that have been paid, so
 * they must not shift if a shift is edited afterwards.
 */
export default async function MyPayrollPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.staffId) redirect("/dashboard");

  const lines = await prisma.payrollLine.findMany({
    where: {
      tenantId: session.tenantId,
      staffId: session.staffId,
      period: { status: "APPROVED" },
    },
    include: {
      period: {
        select: {
          startDate: true,
          endDate: true,
          approvedAt: true,
          branch: { select: { name: true } },
        },
      },
    },
    orderBy: { period: { startDate: "desc" } },
  });

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <h1 className="mb-1 text-xl font-bold text-slate-900">My payroll</h1>
      <p className="mb-4 text-sm text-slate-500">
        Pay runs the office has completed. These are the figures you were paid,
        fixed at the time each run was completed.
      </p>

      {lines.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <span className="material-symbols-rounded text-[32px] text-slate-300">
            payments
          </span>
          <p className="mt-2 text-sm font-medium text-slate-700">
            No completed pay runs yet
          </p>
          <p className="mt-1 text-xs text-slate-500">
            When the office completes a pay run you worked in, it appears here
            and you get a notification.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {lines.map((l) => (
            <section
              key={l.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Pay period
                  </div>
                  <div className="text-base font-semibold text-slate-900">
                    {fmtDate(l.period.startDate)} - {fmtDate(l.period.endDate)}
                  </div>
                  {l.period.branch && (
                    <div className="text-xs text-slate-500">{l.period.branch.name}</div>
                  )}
                </div>
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                  Paid
                </span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Stat label="Shifts" value={String(l.shifts)} />
                <Stat label="Hours" value={l.hours.toFixed(2)} />
                <Stat label="Mileage" value={`${l.km.toFixed(1)} km`} />
              </div>

              <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Wages</span>
                  <span className="tabular-nums">{money(l.wagePay)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Mileage allowance</span>
                  <span className="tabular-nums">{money(l.kmPay)}</span>
                </div>
                <div className="flex justify-between pt-1 text-base font-bold text-slate-900">
                  <span>Total pay</span>
                  <span className="tabular-nums">{money(l.total)}</span>
                </div>
              </div>

              {l.period.approvedAt && (
                <p className="mt-2 text-[11px] text-slate-400">
                  Completed {fmtDate(l.period.approvedAt)}. Before tax and super.
                </p>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-2 py-2">
      <div className="text-base font-bold text-slate-900">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}
