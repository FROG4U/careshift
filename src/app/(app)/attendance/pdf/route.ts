import { NextResponse } from "next/server";
import { requireScope } from "@/lib/tenant";
import { isManager } from "@/lib/roles";
import { loadAttendance } from "@/lib/attendanceReport";
import { renderAttendancePdf } from "@/lib/attendancePdf";

/** GET /attendance/pdf - the attendance record as a download. */
export const dynamic = "force-dynamic";

export async function GET() {
  const { tenant, session, scope } = await requireScope();
  if (!isManager(session.role)) {
    return new NextResponse("Not authorised", { status: 403 });
  }

  const cfg = {
    lateGraceMin: tenant.lateGraceMin,
    earlyFinishGraceMin: tenant.earlyFinishGraceMin,
    lateFinishGraceMin: tenant.lateFinishGraceMin,
    ratingGreenAt: tenant.ratingGreenAt,
    ratingAmberAt: tenant.ratingAmberAt,
    lateNoticePenalty: tenant.lateNoticePenalty,
  };
  const rows = await loadAttendance(tenant.id, scope, cfg);
  const buf = await renderAttendancePdf(rows, cfg, {
    tenantName: tenant.name,
    brand: tenant.brandColor || "#003146",
    generatedBy: session.name,
  });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="attendance-${new Date().toISOString().slice(0, 10)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
