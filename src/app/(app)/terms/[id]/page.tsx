import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin, isSuperAdmin } from "@/lib/roles";
import { renderTerms, clauseCount, acceptanceReport } from "@/lib/terms";
import { fmtDateTime } from "@/lib/format";
import { TermsEditor } from "./TermsEditor";
import { PublishButton } from "./PublishButton";

/**
 * One version of the worker terms.
 *
 * A draft is editable and can be published. A published or superseded version
 * is read-only and shows the signature sheet: who agreed, when, and with what
 * signature.
 */
export default async function TermsVersionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { tenant } = await requireTenant();
  const session = await getSession();
  if (!session || !isAdmin(session.role)) redirect("/dashboard");

  const { id } = await params;
  const version = await prisma.termsVersion.findFirst({
    where: { id, tenantId: tenant.id },
  });
  if (!version) notFound();

  const isDraft = version.status === "DRAFT";
  const report = isDraft ? null : await acceptanceReport(tenant.id, version.id);

  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-8">
      <Link
        href="/terms"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <span className="material-symbols-rounded text-[18px]">arrow_back</span>
        All versions
      </Link>

      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              Version {version.version}
            </h1>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                version.status === "PUBLISHED"
                  ? "bg-emerald-50 text-emerald-700"
                  : version.status === "DRAFT"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-slate-100 text-slate-500"
              }`}
            >
              {version.status === "PUBLISHED"
                ? "live"
                : version.status === "DRAFT"
                  ? "draft"
                  : "superseded"}
            </span>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            {version.title} · {clauseCount(version.content)} clauses ·{" "}
            {version.publishedAt
              ? `published ${fmtDateTime(version.publishedAt)}`
              : `last edited ${fmtDateTime(version.updatedAt)}`}
            {version.publishedByName ? ` by ${version.publishedByName}` : ""}
          </p>
        </div>
        {isDraft && isSuperAdmin(session.role) && (
          <PublishButton id={version.id} version={version.version} />
        )}
      </header>

      {isDraft ? (
        <TermsEditor
          id={version.id}
          title={version.title}
          content={version.content}
          changeNote={version.changeNote ?? ""}
          preview={renderTerms(version.content)}
          canPublish={isSuperAdmin(session.role)}
        />
      ) : (
        <>
          {report && (
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                ["Agreed", `${report.accepted.length}`],
                ["Still to agree", `${report.outstanding.length}`],
                ["Active workers", `${report.total}`],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm"
                >
                  <div className="text-xl font-bold text-[var(--text-primary)]">
                    {value}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)]">{label}</div>
                </div>
              ))}
            </div>
          )}

          {report && report.accepted.length > 0 && (
            <section className="mb-5 overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
              <div className="border-b border-[var(--border)] px-5 py-3">
                <h2 className="text-sm font-bold text-[var(--text-primary)]">
                  Signature sheet
                </h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  Each row is that person agreeing to the wording below, at that
                  moment.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead className="bg-[var(--background)] text-left text-xs uppercase tracking-wide text-[var(--text-secondary)]">
                    <tr>
                      <th className="px-5 py-3 font-medium">Worker</th>
                      <th className="px-4 py-3 font-medium">Agreed at</th>
                      <th className="px-4 py-3 font-medium">Signature</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.accepted.map((a) => (
                      <tr
                        key={a.id}
                        className="border-t border-[var(--border)] align-middle"
                      >
                        <td className="px-5 py-3">
                          <div className="font-semibold text-[var(--text-primary)]">
                            {a.fullName}
                          </div>
                          <div className="text-xs text-[var(--text-secondary)]">
                            {a.user?.email}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">
                          {fmtDateTime(a.acceptedAt)}
                        </td>
                        <td className="px-4 py-3">
                          {a.signatureType === "DRAWN" ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={a.signature}
                              alt={`Signature of ${a.fullName}`}
                              className="h-10 w-auto max-w-[10rem] object-contain"
                            />
                          ) : (
                            <span
                              className="text-lg text-[var(--text-primary)]"
                              style={{ fontFamily: "'Brush Script MT', cursive" }}
                            >
                              {a.signature}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {report && report.outstanding.length > 0 && (
            <section className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <h2 className="text-sm font-bold text-amber-900">
                Not agreed yet ({report.outstanding.length})
              </h2>
              <p className="mb-2 text-xs text-amber-800">
                They get the pop-up the next time they open the app, and cannot
                use it until they agree.
              </p>
              <ul className="flex flex-wrap gap-2">
                {report.outstanding.map((w) => (
                  <li
                    key={w.id}
                    className="rounded-full bg-white px-3 py-1 text-xs font-medium text-amber-900"
                  >
                    {w.name}
                    {w.staff?.branch?.name ? ` · ${w.staff.branch.name}` : ""}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-bold text-[var(--text-primary)]">
              {version.title}
            </h2>
            <div
              className="tc-body text-sm"
              dangerouslySetInnerHTML={{ __html: renderTerms(version.content) }}
            />
          </section>
        </>
      )}
    </div>
  );
}
