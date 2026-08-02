import Link from "next/link";
import { headers } from "next/headers";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import {
  updateBranding,
  updateAttendanceSettings,
  updateLeaveSettings,
  generateJoinCode,
  clearJoinCode,
} from "./actions";
import { BranchesManager, type BranchRow } from "./BranchesManager";
import { CopyButton } from "./CopyButton";

const field =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100";

export default async function SettingsPage() {
  const { tenant, session } = await requireTenant();
  const isAdmin = session.role === "ADMIN";

  // Build the public registration link (protocol + host) so admins can share it.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3100";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const registerUrl = `${proto}://${host}/register`;

  const branchRecords = isAdmin
    ? await prisma.branch.findMany({
        where: { tenantId: tenant.id },
        orderBy: { name: "asc" },
        include: { _count: { select: { staff: true, clients: true } } },
      })
    : [];
  const branches: BranchRow[] = branchRecords.map((b) => ({
    id: b.id,
    name: b.name,
    staff: b._count.staff,
    clients: b._count.clients,
  }));

  return (
    <div className="p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Settings
        </h1>
        <p className="text-sm text-slate-500">
          White-label branding for {tenant.name}.
        </p>
      </header>

      <div className="max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-semibold text-slate-900">Branding</h2>
        <form action={updateBranding} className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Organisation name
            <input name="name" defaultValue={tenant.name} className={field} />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Brand colour
            <div className="mt-1 flex items-center gap-3">
              <input
                name="brandColor"
                type="color"
                defaultValue={tenant.brandColor}
                className="h-10 w-16 cursor-pointer rounded border border-slate-300"
              />
              <span className="text-sm text-slate-500">
                Applied across the sidebar, buttons and highlights.
              </span>
            </div>
          </label>
          <button className="rounded-lg bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white">
            Save branding
          </button>
        </form>
      </div>

      {/* Worker sign-up — company code + registration link */}
      <div className="mt-6 max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 font-semibold text-slate-900">Worker sign-up</h2>
        <p className="mb-4 text-sm text-slate-500">
          Support workers register themselves at the link below using this code.
          Each request lands in{" "}
          <Link href="/approvals" className="font-medium text-teal-700 hover:underline">
            Approvals
          </Link>{" "}
          for you to accept or decline.
        </p>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Company code
          </p>
          {tenant.joinCode ? (
            <div className="mt-1.5 flex items-center gap-3">
              <span className="font-mono text-2xl font-bold tracking-widest text-slate-900">
                {tenant.joinCode}
              </span>
              <CopyButton value={tenant.joinCode} label="Copy code" />
            </div>
          ) : (
            <p className="mt-1.5 text-sm text-slate-500">
              Not set up yet — generate a code to let workers sign up.
            </p>
          )}
        </div>

        {tenant.joinCode && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Registration link
            </p>
            <div className="mt-1.5 flex items-center gap-3">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {registerUrl}
              </code>
              <CopyButton value={registerUrl} label="Copy link" />
            </div>
          </div>
        )}

        {isAdmin ? (
          <div className="mt-5 flex flex-wrap gap-3">
            <form action={generateJoinCode}>
              <button className="rounded-lg bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white">
                {tenant.joinCode ? "Regenerate code" : "Generate code"}
              </button>
            </form>
            {tenant.joinCode && (
              <form action={clearJoinCode}>
                <button className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
                  Turn off sign-up
                </button>
              </form>
            )}
          </div>
        ) : (
          <p className="mt-4 text-xs text-slate-400">
            Only an administrator can change the sign-up code.
          </p>
        )}

        {tenant.joinCode && (
          <p className="mt-4 text-xs text-slate-400">
            Regenerating makes the old code stop working — share the new one with
            your team.
          </p>
        )}
      </div>

      {isAdmin && (
        <div className="mt-6">
          <BranchesManager branches={branches} />
        </div>
      )}

      {/* Attendance thresholds — drive the worker reliability score */}
      <div className="mt-6 max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 font-semibold text-slate-900">
          Attendance &amp; reliability
        </h2>
        <p className="mb-4 text-sm text-slate-500">
          How punctual a worker has to be before it counts against their score.
        </p>
        <form action={updateAttendanceSettings} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <label className="text-xs font-medium text-slate-600">
              Late start grace (min)
              <input
                name="lateGraceMin"
                type="number"
                min="0"
                max="120"
                defaultValue={tenant.lateGraceMin}
                className={field}
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Early finish grace (min)
              <input
                name="earlyFinishGraceMin"
                type="number"
                min="0"
                max="120"
                defaultValue={tenant.earlyFinishGraceMin}
                className={field}
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Late finish grace (min)
              <input
                name="lateFinishGraceMin"
                type="number"
                min="0"
                max="240"
                defaultValue={tenant.lateFinishGraceMin}
                className={field}
              />
            </label>
          </div>
          <p className="text-xs text-slate-400">
            Clocking in within the late-start grace still counts as on time.
            Clocking out more than the early-finish grace before the rostered
            end counts against the worker.
          </p>

          <div className="grid grid-cols-3 gap-3">
            <label className="text-xs font-medium text-slate-600">
              Green at or above (%)
              <input
                name="ratingGreenAt"
                type="number"
                min="1"
                max="100"
                defaultValue={tenant.ratingGreenAt}
                className={field}
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Amber at or above (%)
              <input
                name="ratingAmberAt"
                type="number"
                min="0"
                max="99"
                defaultValue={tenant.ratingAmberAt}
                className={field}
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              “Running late” penalty
              <input
                name="lateNoticePenalty"
                type="number"
                min="0"
                max="50"
                defaultValue={tenant.lateNoticePenalty}
                className={field}
              />
            </label>
          </div>
          <p className="text-xs text-slate-400">
            Below the amber threshold shows red. Each “running late” report
            deducts the penalty from the worker&apos;s score.
          </p>

          <button className="rounded-lg bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white">
            Save attendance settings
          </button>
        </form>
      </div>

      {/* Leave & time off */}
      <div className="mt-6 max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 font-semibold text-slate-900">Leave &amp; Time Off</h2>
        <p className="mb-4 text-sm text-slate-500">
          Yearly allowances used to work out each worker&apos;s balance.
        </p>
        <form action={updateLeaveSettings} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm font-medium text-slate-700">
              Annual leave (days/year)
              <input
                type="number"
                name="annualLeaveDays"
                min={0}
                max={365}
                defaultValue={tenant.annualLeaveDays}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Sick leave (days/year)
              <input
                type="number"
                name="sickLeaveDays"
                min={0}
                max={365}
                defaultValue={tenant.sickLeaveDays}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
              />
            </label>
          </div>
          <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
            <input
              type="checkbox"
              name="showLeaveBalance"
              defaultChecked={tenant.showLeaveBalance}
              className="h-4 w-4 rounded accent-[var(--brand)]"
            />
            <span className="text-sm font-medium text-slate-700">
              Show leave balance on workers&apos; profiles
              <span className="block text-xs font-normal text-slate-400">
                Workers see days taken vs their allowance.
              </span>
            </span>
          </label>
          <button className="rounded-lg bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white">
            Save leave settings
          </button>
        </form>
      </div>

      {/* Public holidays — drive the public-holiday pay rate */}
      <Link
        href="/settings/holidays"
        className="mt-6 flex max-w-lg items-center justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-[var(--brand)]"
      >
        <div>
          <h2 className="font-semibold text-slate-900">Public Holidays</h2>
          <p className="mt-1 text-sm text-slate-500">
            Manage the holiday calendar per state, or import it from a URL.
            Shifts on these dates are paid at the public-holiday rate.
          </p>
        </div>
        <span className="material-symbols-rounded text-[22px] text-slate-400">
          arrow_forward
        </span>
      </Link>

      <div className="mt-6 max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-2 font-semibold text-slate-900">Plan</h2>
        <p className="text-sm text-slate-500">
          You&apos;re on the{" "}
          <span className="font-medium text-slate-700">CareShift Basic</span>{" "}
          foundation — rostering, clock-in, timesheets and participant
          management. NDIS invoicing &amp; claiming arrives in the next phase.
        </p>
      </div>
    </div>
  );
}
