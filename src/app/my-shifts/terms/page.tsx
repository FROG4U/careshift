import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentTerms, renderTerms } from "@/lib/terms";
import { fmtDateTime } from "@/lib/format";

/**
 * The worker's own copy of the terms they agreed to.
 *
 * Shows the live version plus their own signature record, so "what did I
 * agree to, and when" is answerable without asking the office.
 */
export default async function WorkerTermsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const terms = await currentTerms(session.tenantId);
  if (!terms) {
    return (
      <div className="p-5">
        <h1 className="text-xl font-bold text-[var(--text-primary)]">
          Terms &amp; conditions
        </h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          The office has not published any terms yet.
        </p>
      </div>
    );
  }

  const mine = await prisma.termsAcceptance.findUnique({
    where: { termsId_userId: { termsId: terms.id, userId: session.id } },
  });

  return (
    <div className="mx-auto max-w-2xl p-5 pb-24">
      <header className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Version {terms.version}
          {terms.publishedAt ? ` · ${fmtDateTime(terms.publishedAt)}` : ""}
        </p>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">
          {terms.title}
        </h1>
      </header>

      {mine ? (
        <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-900">
            You agreed to this version
          </p>
          <p className="mt-0.5 text-xs text-emerald-800">
            {mine.fullName} · {fmtDateTime(mine.acceptedAt)}
          </p>
          {mine.signatureType === "DRAWN" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mine.signature}
              alt="Your signature"
              className="mt-2 h-12 w-auto max-w-[12rem] object-contain"
            />
          ) : (
            <p
              className="mt-1 text-xl text-emerald-900"
              style={{ fontFamily: "'Brush Script MT', cursive" }}
            >
              {mine.signature}
            </p>
          )}
        </div>
      ) : (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          You have not agreed to this version yet. The pop-up appears next time
          you open the app.
        </div>
      )}

      <div
        className="tc-body rounded-2xl border border-[var(--border)] bg-white p-5 text-sm shadow-sm"
        dangerouslySetInnerHTML={{ __html: renderTerms(terms.content) }}
      />
    </div>
  );
}
