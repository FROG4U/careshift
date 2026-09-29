import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/tenant";
import { isManager } from "@/lib/roles";
import { buildCommsReport } from "@/lib/commsReport";
import { renderCommsPdf } from "@/lib/commsReportPdf";

/** GET /messages/report/pdf - the communication record as a download. */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await requireTenant().catch(() => null);
  if (!ctx) return new NextResponse("Not signed in", { status: 401 });
  const { tenant, session } = ctx;
  if (!isManager(session.role)) {
    return new NextResponse("Not authorised", { status: 403 });
  }

  const p = req.nextUrl.searchParams;
  const report = await buildCommsReport(tenant.id, {
    from: p.get("from") ?? undefined,
    to: p.get("to") ?? undefined,
    q: p.get("q") ?? undefined,
    conversationId: p.get("conversation") ?? undefined,
    people: p.getAll("people").filter(Boolean),
  });

  const buf = await renderCommsPdf(report, {
    tenantName: tenant.name,
    brand: tenant.brandColor || "#003146",
    generatedBy: session.name,
  });

  const slug = report.rangeLabel.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="communication-record-${slug}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
