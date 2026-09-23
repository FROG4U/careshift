import { prisma } from "@/lib/prisma";
import { renderTerms } from "@/lib/terms";
import { TermsGuard } from "@/components/worker/TermsGuard";

/**
 * Local-only preview of the worker pop-up, using the real draft wording.
 * Not committed - it exists so the office can see exactly what a worker sees.
 */
export default async function TermsPreviewPage() {
  const draft = await prisma.termsVersion.findFirst({
    where: { status: "DRAFT" },
    orderBy: { version: "desc" },
  });
  if (!draft) return <p className="p-6">No draft found.</p>;

  return (
    <div style={{ ["--brand" as string]: "#003146", ["--accent" as string]: "#886949" }}>
      <TermsGuard
        terms={{
          id: "preview-only",
          version: draft.version,
          title: draft.title,
          html: renderTerms(draft.content),
          changeNote: draft.changeNote,
          publishedAt: null,
          isUpdate: false,
        }}
        suggestedName="Mahboubeh Mohammadi"
      />
    </div>
  );
}
