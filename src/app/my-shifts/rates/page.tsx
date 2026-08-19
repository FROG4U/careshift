import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { effectiveRates } from "@/lib/rates";
import { hourlyRate } from "@/lib/payroll";
import {
  DAY_TYPES,
  DAY_TYPE_LABELS,
  DAY_TYPE_HINTS,
  STREAM_LABELS,
  CASUAL_LOADING,
  type DayType,
  type StaffStream,
} from "@/lib/constants";

const money = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

/**
 * "My pay rates" — what the office has this worker on. Read-only: rates are
 * set by admin, this is purely so a worker can see them without asking.
 */
export default async function MyRatesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.staffId) redirect("/dashboard");

  const staff = await prisma.staff.findUnique({
    where: { id: session.staffId },
    include: { payLevel: { include: { rates: true } }, rateOverrides: true },
  });
  if (!staff) redirect("/my-shifts");

  const { grid, overriddenKeys, levelName, mileageRate } =
    effectiveRates(staff);
  const casual = staff.employmentType === "CASUAL";

  // Only show streams the worker actually has rates for.
  const streams = (["NDIS", "AGED_CARE", "DVA", "CLEANING"] as StaffStream[]).filter(
    (s) => DAY_TYPES.some((d) => (grid[`${s}_${d}`] ?? 0) > 0),
  );

  return (
    <div className="space-y-4 p-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-lg font-bold text-slate-900">My pay rates</h1>
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Pay level</span>
            <span className="font-semibold text-slate-900">
              {levelName ?? "Not set"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Employment</span>
            <span className="font-semibold text-slate-900">
              {casual ? "Casual" : "Permanent"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Mileage</span>
            <span className="font-semibold text-slate-900">
              {mileageRate > 0 ? `${money(mileageRate)} / km` : "—"}
            </span>
          </div>
        </div>

        {casual && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            You&apos;re casual, so the {Math.round(CASUAL_LOADING * 100)}% casual
            loading is already included in every rate below.
          </p>
        )}
      </div>

      {streams.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
          No pay rates set yet. Ask the office to assign your pay level.
        </div>
      ) : (
        streams.map((stream) => (
          <div
            key={stream}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 className="font-semibold text-slate-900">
                {STREAM_LABELS[stream]}
              </h2>
              {DAY_TYPES.some((d) => overriddenKeys.has(`${stream}_${d}`)) && (
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                  Agreed rate
                </span>
              )}
            </div>
            <ul className="divide-y divide-slate-50">
              {DAY_TYPES.map((d) => {
                const rate = hourlyRate(grid, stream, d as DayType);
                if (!rate) return null;
                return (
                  <li
                    key={d}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-800">
                        {DAY_TYPE_LABELS[d as DayType]}
                      </div>
                      <div className="text-xs text-slate-400">
                        {DAY_TYPE_HINTS[d as DayType]}
                      </div>
                    </div>
                    <div className="text-base font-bold text-slate-900">
                      {money(rate)}
                      <span className="text-xs font-medium text-slate-400">
                        {" "}
                        /hr
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}

      <p className="px-1 pb-2 text-center text-xs text-slate-400">
        Rates are set by the office. If something looks wrong, message your
        manager — don&apos;t rely on this page for a payslip.
      </p>
    </div>
  );
}
