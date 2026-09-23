import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin, isSuperAdmin } from "@/lib/roles";
import { clauseCount } from "@/lib/terms";
import { fmtDateTime } from "@/lib/format";
import { StartTemplateButton, NewVersionButton } from "./Buttons";

/**
 * Terms and conditions: every version, newest first.
 *
 * The office's view of what workers have agreed to. One version is live at a
 * time; editing the wording always means a new version, which everyone has to
 * agree to again.
 */
export default async function TermsPage() {
  const { tenant } = await requireTenant();
  const session = await getSession();
  if (!session || !isAdmin(session.role)) redirect("/dashboard");

  const versions = await prisma.termsVersion.findMany({
    where: { tenantId: tenant.id },
    orderBy: { version: "desc" },
    include: { _count: { select: { acceptances: true } } },
  });

  const workerCount = await prisma.user.count({
    where: {
      tenantId: tenant.id,
      status: "APPROVED",
      role: "WORKER",
      staff: { active: true },
    },
  });

  const live = versions.find((v) => v.status === "PUBLISHED");
  const draft = versions.find((v) => v.status === "DRAFT");

  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Terms &amp; Conditions
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            The terms your support workers agree to. Every change creates a new
            version, and everyone has to agree again before their next shift.
          </p>
        </div>
        {versions.length === 0 ? (
          <StartTemplateButton />
        ) : !draft ? (
          <NewVersionButton />
        ) : null}
      </header>

      {versions.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-white p-8 text-center">
          <span className="material-symbols-rounded text-[40px] text-[var(--brand)]">
            contract
          </span>
          <h2 className="mt-2 text-lg font-bold text-[var(--text-primary)]">
            No terms yet
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-[var(--text-secondary)]">
            Start from the PCG template: 23 clauses covering the NDIS Code of
            Conduct, Fair Work, attendance, pay, confidentiality, what the app
            records and what to do in an emergency. You can edit every word
            before anyone sees it.
          </p>
          <div className="mt-4 flex justify-center">
            <StartTemplateButton />
          </div>
        </div>
      )}

      {live && (
        <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Live now
              </p>
              <p className="text-sm font-bold text-emerald-900">
                Version {live.version} · {live._count.acceptances} of{" "}
                {workerCount} worker{workerCount === 1 ? "" : "s"} agreed
              </p>
            </div>
            <Link
              href={`/terms/${live.id}`}
              className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              Who has agreed
            </Link>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--background)] text-left text-xs uppercase tracking-wide text-[var(--text-secondary)]">
            <tr>
              <th className="px-4 py-3 font-medium">Version</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Last updated</th>
              <th className="px-4 py-3 font-medium">Published by</th>
              <th className="px-4 py-3 text-right font-medium">Agreed</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id} className="border-b border-[var(--border)] last:border-0">
                <td className="px-4 py-3">
                  <div className="font-semibold text-[var(--text-primary)]">
                    Version {v.version}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)]">
                    {clauseCount(v.content)} clauses
                    {v.changeNote ? ` · ${v.changeNote}` : ""}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      v.status === "PUBLISHED"
                        ? "bg-emerald-50 text-emerald-700"
                        : v.status === "DRAFT"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {v.status === "PUBLISHED"
                      ? "live"
                      : v.status === "DRAFT"
                        ? "draft"
                        : "superseded"}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">
                  {fmtDateTime(v.updatedAt)}
                </td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">
                  {v.publishedByName ?? "-"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-[var(--text-secondary)]">
                  {v.status === "DRAFT" ? "-" : v._count.acceptances}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/terms/${v.id}`}
                    className="text-sm font-semibold text-[var(--brand)] hover:underline"
                  >
                    {v.status === "DRAFT" ? "Edit" : "Open"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {draft && (
        <p className="mt-3 text-sm text-amber-700">
          Version {draft.version} is a draft. Nobody sees it until it is
          published{isSuperAdmin(session.role) ? "" : ", which a super admin does"}.
        </p>
      )}
    </div>
  );
}
