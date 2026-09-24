import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/tenant";
import { isManager } from "@/lib/roles";
import { loadShiftNotes } from "@/lib/shiftNotes";
import { renderShiftNotesPdf } from "@/lib/shiftNotesPdf";

/**
 * GET /timesheets-doc/pdf - the shift notes record as a straight download.
 * Same filters as the Timesheets screen, no printer involved.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await requireTenant().catch(() => null);
  if (!ctx) return new NextResponse("Not signed in", { status: 401 });
  const { tenant, session } = ctx;
  if (!isManager(session.role)) {
    return new NextResponse("Not authorised", { status: 403 });
  }

  const p = req.nextUrl.searchParams;
  const doc = await loadShiftNotes(tenant.id, {
    q: p.get("q") ?? undefined,
    from: p.get("from") ?? undefined,
    to: p.get("to") ?? undefined,
    month: p.get("month") ?? undefined,
    client: p.get("client") ?? undefined,
    staff: p.get("staff") ?? undefined,
  });

  const buf = await renderShiftNotesPdf(doc, {
    tenantName: tenant.name,
    brand: tenant.brandColor || "#003146",
    generatedBy: session.name,
  });

  const slug = doc.rangeText.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      // attachment = the browser saves the file, no printer involved.
      "Content-Disposition": `attachment; filename="shift-notes-${slug}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
