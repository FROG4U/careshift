import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isManager, isSuperAdmin } from "@/lib/roles";
import { fmtDate, fmtTime } from "@/lib/format";
import { AUDIENCE_LABELS, FROM_LABELS, type Audience } from "@/lib/broadcast";
import { SendForm } from "./SendForm";

export default async function AnnouncementsPage() {
  const { tenant } = await requireTenant();
  const session = await getSession();
  if (!session || !isManager(session.role)) redirect("/dashboard");
  const superAdmin = isSuperAdmin(session.role);

  const [branches, sent] = await Promise.all([
    prisma.branch.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }),
    prisma.broadcast.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        branch: { select: { name: true } },
        recipients: {
          orderBy: { readAt: "asc" },
          select: {
            readAt: true,
            user: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-8">
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          Send Message
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          An announcement reaches people as a notification, then as a
          full-screen message they have to open and close. You can see exactly
          who has read it.
        </p>
      </header>

      <SendForm
        branches={branches}
        canMessageAdmins={superAdmin}
        tenantName={tenant.name}
        fromLabels={[...FROM_LABELS]}
      />

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Sent messages ({sent.length})
        </h2>

        {sent.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--text-muted)]">
            Nothing sent yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {sent.map((b) => {
              const read = b.recipients.filter((r) => r.readAt);
              const unread = b.recipients.filter((r) => !r.readAt);
              const pct = b.recipients.length
                ? Math.round((read.length / b.recipients.length) * 100)
                : 0;
              return (
                <li
                  key={b.id}
                  className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-[var(--text-primary)]">
                        {b.title}
                      </div>
                      <div className="text-xs text-[var(--text-muted)]">
                        {b.fromLabel} · {fmtDate(b.createdAt)}{" "}
                        {fmtTime(b.createdAt)} · sent by {b.createdByName}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded-full bg-[var(--background)] px-2.5 py-0.5 text-xs font-semibold text-[var(--text-secondary)]">
                        {AUDIENCE_LABELS[b.audience as Audience] ?? b.audience}
                        {b.branch ? ` · ${b.branch.name}` : " · all branches"}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          pct === 100
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {read.length}/{b.recipients.length} read
                      </span>
                    </div>
                  </div>

                  <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">
                    {b.body}
                  </p>

                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-semibold text-[var(--brand)]">
                      Who has read it
                    </summary>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      <div>
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                          Read ({read.length})
                        </div>
                        <ul className="space-y-0.5 text-xs text-[var(--text-secondary)]">
                          {read.length === 0 && <li>Nobody yet.</li>}
                          {read.map((r, i) => (
                            <li key={i}>
                              {r.user.name} ·{" "}
                              <span className="text-[var(--text-muted)]">
                                {fmtDate(r.readAt!)} {fmtTime(r.readAt!)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                          Not yet read ({unread.length})
                        </div>
                        <ul className="space-y-0.5 text-xs text-[var(--text-secondary)]">
                          {unread.length === 0 && <li>Everyone has read it.</li>}
                          {unread.map((r, i) => (
                            <li key={i}>{r.user.name}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
