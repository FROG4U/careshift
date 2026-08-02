import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/format";
import { AvailabilityForm } from "@/components/worker/AvailabilityForm";
import { cancelAvailability } from "./actions";

const STATUS: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-red-50 text-red-700",
};

function label(a: {
  startDate: Date;
  endDate: Date;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
}) {
  const same = a.startDate.getTime() === a.endDate.getTime();
  if (!a.allDay && same)
    return `${fmtDate(a.startDate)} · ${a.startTime}–${a.endTime}`;
  if (same) return `${fmtDate(a.startDate)} · all day`;
  return `${fmtDate(a.startDate)} – ${fmtDate(a.endDate)}`;
}

export default async function AvailabilityPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.staffId) redirect("/dashboard");

  const account = await prisma.user.findUnique({
    where: { id: session.id },
    select: { status: true },
  });
  if (!account || account.status !== "APPROVED") redirect("/pending");

  const requests = await prisma.availability.findMany({
    where: { tenantId: session.tenantId, staffId: session.staffId },
    orderBy: { startDate: "desc" },
  });

  return (
    <div className="space-y-4 p-4">
      <AvailabilityForm />

      <section>
        <h2 className="mb-2 px-1 text-sm font-bold text-slate-700">
          My time off
        </h2>
        {requests.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
            No time off requested yet.
          </div>
        ) : (
          <div className="space-y-2">
            {requests.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900">{label(a)}</div>
                  {a.reason && (
                    <div className="truncate text-xs text-slate-400">{a.reason}</div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS[a.status] ?? "bg-slate-100 text-slate-600"}`}
                  >
                    {a.status.charAt(0) + a.status.slice(1).toLowerCase()}
                  </span>
                  {a.status === "PENDING" && (
                    <form action={cancelAvailability}>
                      <input type="hidden" name="id" value={a.id} />
                      <button
                        className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-red-600"
                        aria-label="Cancel"
                      >
                        <span className="material-symbols-rounded text-[18px]">close</span>
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
