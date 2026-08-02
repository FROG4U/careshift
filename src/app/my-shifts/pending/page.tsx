import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtDate, fmtTime } from "@/lib/format";
import { ShiftOffer } from "@/components/ShiftOffer";

export default async function PendingShiftsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.staffId) redirect("/dashboard");

  const account = await prisma.user.findUnique({
    where: { id: session.id },
    select: { status: true },
  });
  if (!account || account.status !== "APPROVED") redirect("/pending");

  const me = await prisma.staff.findUnique({
    where: { id: session.staffId },
    select: { branchId: true },
  });
  const branchWhere = me?.branchId ? { branchId: me.branchId } : {};

  const offers = await prisma.shift.findMany({
    where: {
      tenantId: session.tenantId,
      staffId: session.staffId,
      publishState: "PUBLISHED",
      ...branchWhere,
    },
    include: { client: true },
    orderBy: { start: "asc" },
  });

  return (
    <div className="space-y-4 p-4">
      <div className="px-1">
        <h1 className="text-lg font-bold text-slate-900">Shift offers</h1>
        <p className="text-sm text-slate-500">
          New shifts sent to you — accept or decline.
        </p>
      </div>

      {offers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <span className="material-symbols-rounded text-[40px] text-slate-300">
            inbox
          </span>
          <p className="mt-2 text-sm font-medium text-slate-500">
            No pending shifts
          </p>
          <p className="text-xs text-slate-400">
            New shift offers from the office will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {offers.map((s) => (
            <div
              key={s.id}
              className="rounded-2xl border-2 border-amber-200 bg-amber-50/50 p-5 shadow-sm"
            >
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-amber-600">
                {fmtDate(s.start)}
              </div>
              <div className="text-lg font-semibold text-slate-900">
                {s.client.firstName} {s.client.lastName}
              </div>
              <div className="text-sm text-slate-500">
                {fmtTime(s.start)} – {fmtTime(s.end)}
              </div>
              {s.client.address && (
                <div className="mt-1 text-sm text-slate-400">
                  📍 {s.client.address}
                </div>
              )}
              <div className="mt-4">
                <ShiftOffer shiftId={s.id} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
