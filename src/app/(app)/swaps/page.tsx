import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { fmtDateTime, initials } from "@/lib/format";
import { approveSwap, rejectSwap } from "./actions";

const statusStyle: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-red-50 text-red-700",
  CANCELLED: "bg-slate-100 text-slate-500",
};

export default async function SwapsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { tenant } = await requireTenant();
  const { q } = await searchParams;
  const query = (q ?? "").trim().toLowerCase();

  const all = await prisma.shiftSwap.findMany({
    where: { tenantId: tenant.id },
    include: {
      shift: { include: { client: true } },
      fromStaff: true,
      toStaff: true,
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  // Filter by participant or either worker's name.
  const swaps = query
    ? all.filter((s) =>
        `${s.shift.client.firstName} ${s.shift.client.lastName} ${s.fromStaff.firstName} ${s.fromStaff.lastName} ${s.toStaff.firstName} ${s.toStaff.lastName}`
          .toLowerCase()
          .includes(query),
      )
    : all;

  const pending = swaps.filter((s) => s.status === "PENDING");
  const decided = swaps.filter((s) => s.status !== "PENDING");

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          Shift Swaps
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Workers can hand a shift to another worker allocated to the same
          participant. Swaps only take effect once you approve them.
        </p>
      </header>

      {/* Search */}
      <form className="mb-5">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by participant or worker name…"
          className="w-full max-w-md rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--brand)]"
        />
      </form>

      {/* Pending */}
      <section className="mb-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
        <div className="border-b border-[var(--border)] px-5 py-3">
          <h2 className="font-bold text-[var(--text-primary)]">
            Awaiting approval{" "}
            <span className="font-medium text-[var(--text-muted)]">
              ({pending.length})
            </span>
          </h2>
        </div>

        {pending.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--pastel-green)]">
              <span className="material-symbols-rounded text-[28px] text-green-600">
                check_circle
              </span>
            </div>
            <p className="font-medium text-[var(--text-primary)]">
              No swap requests waiting
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {pending.map((s) => (
              <li key={s.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-[var(--text-primary)]">
                      {s.shift.client.firstName} {s.shift.client.lastName}
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {fmtDateTime(s.shift.start)}
                    </div>

                    {/* from → to */}
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">
                          {initials(s.fromStaff.firstName, s.fromStaff.lastName)}
                        </span>
                        {s.fromStaff.firstName} {s.fromStaff.lastName}
                      </span>
                      <span className="material-symbols-rounded text-[18px] text-[var(--text-muted)]">
                        arrow_forward
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--pastel-blue)] text-[10px] font-semibold text-blue-700">
                          {initials(s.toStaff.firstName, s.toStaff.lastName)}
                        </span>
                        {s.toStaff.firstName} {s.toStaff.lastName}
                      </span>
                    </div>

                    {s.reason && (
                      <p className="mt-2 text-xs text-[var(--text-secondary)]">
                        “{s.reason}”
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <form action={approveSwap}>
                      <input type="hidden" name="id" value={s.id} />
                      <button className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90">
                        Approve
                      </button>
                    </form>
                    <form action={rejectSwap}>
                      <input type="hidden" name="id" value={s.id} />
                      <button className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--background)]">
                        Decline
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* History */}
      {decided.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
          <div className="border-b border-[var(--border)] px-5 py-3">
            <h2 className="font-bold text-[var(--text-primary)]">Recent decisions</h2>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {decided.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-[var(--text-primary)]">
                    {s.shift.client.firstName} {s.shift.client.lastName} ·{" "}
                    {fmtDateTime(s.shift.start)}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {s.fromStaff.firstName} → {s.toStaff.firstName}
                    {s.decidedBy ? ` · by ${s.decidedBy}` : ""}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    statusStyle[s.status] ?? "bg-slate-100 text-slate-600"
                  }`}
                >
                  {s.status.toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
