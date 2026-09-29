import { redirect } from "next/navigation";
import { requireScope } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { isManager } from "@/lib/roles";
import { buildCommsReport } from "@/lib/commsReport";

/**
 * The communication record: chats and calls over a period, for one or more
 * people, with the key points pulled to the front.
 *
 * A registered provider gets asked for this after an incident or at an audit.
 * Same shape as the shift notes record so there is one way to produce a
 * document here: set the filters, read it on screen, download the PDF.
 */
export default async function CommsReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    q?: string;
    people?: string | string[];
    run?: string;
  }>;
}) {
  const { tenant, session } = await requireScope();
  if (!isManager(session.role)) redirect("/dashboard");

  const sp = await searchParams;
  const people = (
    Array.isArray(sp.people) ? sp.people : sp.people ? [sp.people] : []
  ).filter(Boolean);

  const users = await prisma.user.findMany({
    where: { tenantId: tenant.id, status: "APPROVED" },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });

  // Nothing is built until the filters are set, so opening the page does not
  // pull every message the company has ever sent.
  const report = sp.run
    ? await buildCommsReport(tenant.id, {
        from: sp.from,
        to: sp.to,
        q: sp.q,
        people,
      })
    : null;

  const qs = new URLSearchParams();
  if (sp.from) qs.set("from", sp.from);
  if (sp.to) qs.set("to", sp.to);
  if (sp.q) qs.set("q", sp.q);
  for (const p of people) qs.append("people", p);

  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-8">
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          Communication report
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Every message and call over a period, for the people you choose, with
          the key points at the front. Same document an auditor or a plan
          manager would ask for.
        </p>
      </header>

      <form
        method="GET"
        className="mb-5 rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm"
      >
        <input type="hidden" name="run" value="1" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-medium text-[var(--text-secondary)]">
            From
            <input
              type="date"
              name="from"
              defaultValue={sp.from}
              className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-[var(--text-secondary)]">
            To
            <input
              type="date"
              name="to"
              defaultValue={sp.to}
              className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-[var(--text-secondary)] sm:col-span-2">
            Containing the words (optional)
            <input
              name="q"
              defaultValue={sp.q}
              placeholder="e.g. medication, Shamon, incident"
              className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>
        </div>

        <fieldset className="mt-3">
          <legend className="text-xs font-semibold text-[var(--text-secondary)]">
            People (leave empty for everyone). Choosing two gives you only the
            conversations they were both in.
          </legend>
          <div className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto">
            {users.map((u) => (
              <label
                key={u.id}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs"
              >
                <input
                  type="checkbox"
                  name="people"
                  value={u.id}
                  defaultChecked={people.includes(u.id)}
                />
                {u.name}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-3 flex flex-wrap gap-2">
          <button className="rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white">
            Build the report
          </button>
          {report && (
            <a
              href={`/comms-report/pdf?${qs}`}
              className="flex items-center gap-2 rounded-xl border border-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-[var(--brand)]"
            >
              <span className="material-symbols-rounded text-[18px]">download</span>
              Download PDF
            </a>
          )}
        </div>
      </form>

      {report && (
        <>
          <section className="mb-4 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
            <h2 className="text-sm font-bold text-[var(--text-primary)]">
              Summary · {report.rangeLabel}
            </h2>
            <ul className="mt-1 space-y-0.5 text-sm text-[var(--text-secondary)]">
              <li>
                {report.messages.length} message
                {report.messages.length === 1 ? "" : "s"} across{" "}
                {report.threads.length} conversation
                {report.threads.length === 1 ? "" : "s"}, and{" "}
                {report.calls.length} call{report.calls.length === 1 ? "" : "s"}.
              </li>
              {report.perPerson.length > 0 && (
                <li>
                  Who wrote them:{" "}
                  {report.perPerson.map((p) => `${p.name} (${p.count})`).join(", ")}.
                </li>
              )}
              <li>
                {report.keyPoints.length} flagged as key points.
              </li>
            </ul>
          </section>

          {report.keyPoints.length > 0 && (
            <section className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <h2 className="text-sm font-bold text-amber-900">Key points</h2>
              <ul className="mt-2 space-y-2">
                {report.keyPoints.map((m) => (
                  <li key={m.id} className="border-l-2 border-amber-500 pl-3">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-amber-700">
                      {m.flags.join(" · ")}
                    </div>
                    <div className="text-xs text-amber-800">
                      {m.dateLabel} {m.timeLabel} · {m.senderName} ·{" "}
                      {m.conversationTitle}
                    </div>
                    <div className="text-sm text-slate-800">{m.body}</div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-bold text-[var(--text-primary)]">
              Full record
            </h2>
            {report.messages.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--text-secondary)]">
                No messages match these filters.
              </p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {report.messages.map((m) => (
                  <li key={m.id} className="border-b border-[var(--border)] pb-1.5">
                    <span className="text-xs text-[var(--text-secondary)]">
                      {m.dateLabel} {m.timeLabel} · {m.conversationTitle}
                    </span>
                    <div>
                      <span className="font-semibold text-[var(--text-primary)]">
                        {m.senderName}:
                      </span>{" "}
                      <span
                        className={
                          m.deleted ? "italic text-[var(--text-muted)]" : ""
                        }
                      >
                        {m.body}
                      </span>
                      {m.attachment && (
                        <span className="ml-1 text-xs text-[var(--text-secondary)]">
                          (photo)
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
