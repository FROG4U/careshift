import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { approveWorker, rejectWorker } from "./actions";

export const dynamic = "force-dynamic";

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function ApprovalsPage() {
  const { tenant, session } = await requireTenant();
  const isManager =
    session.role === "ADMIN" ||
    session.role === "SUPER_ADMIN" ||
    session.role === "COORDINATOR";
  if (!isManager) redirect("/dashboard");

  const [pending, branches, payLevels] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: tenant.id, status: "PENDING", role: "WORKER" },
      include: { staff: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.branch.findMany({
      where: { tenantId: tenant.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.payLevel.findMany({
      where: { tenantId: tenant.id },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Worker approvals
        </h1>
        <p className="text-sm text-slate-500">
          Support workers who signed up with your company code and are waiting to
          be let in.
        </p>
      </header>

      {pending.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <span className="material-symbols-rounded text-2xl">how_to_reg</span>
          </div>
          <p className="font-medium text-slate-700">No pending sign-ups</p>
          <p className="mt-1 text-sm text-slate-500">
            New worker requests will appear here for you to approve.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {pending.map((u) => (
            <div
              key={u.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-base font-semibold text-slate-900">
                    {u.staff
                      ? `${u.staff.firstName} ${u.staff.lastName}`
                      : u.name}
                  </p>
                  <p className="text-sm text-slate-500">{u.email}</p>
                  {(u.phone || u.staff?.phone) && (
                    <p className="text-sm text-slate-500">
                      {u.phone ?? u.staff?.phone}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-slate-400">
                    Requested {fmtDate(u.createdAt)}
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                  Pending
                </span>
              </div>

              <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
                <form action={approveWorker} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="userId" value={u.id} />

                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                    Branch
                    <select
                      name="branchId"
                      defaultValue=""
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                    >
                      <option value="">Assign later</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                    Employment
                    <select
                      name="employmentType"
                      defaultValue="PERMANENT"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                    >
                      <option value="PERMANENT">Permanent</option>
                      <option value="CASUAL">Casual</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                    Pay level
                    <select
                      name="payLevelId"
                      defaultValue=""
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                    >
                      <option value="">
                        {payLevels.length ? "Set later" : "No pay levels yet"}
                      </option>
                      {payLevels.map((pl) => (
                        <option key={pl.id} value={pl.id}>
                          {pl.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="submit"
                    className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
                  >
                    Approve
                  </button>
                </form>

                <form action={rejectWorker}>
                  <input type="hidden" name="userId" value={u.id} />
                  <button
                    type="submit"
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    Decline
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
