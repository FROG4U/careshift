import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { requireScope } from "@/lib/tenant";
import { opsWhere } from "@/lib/scope";
import { isSuperAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { qrUrlFor } from "@/lib/qrClock";
import { renderQrCardPdf } from "@/lib/qrCardPdf";
import { tzForState, fmtInTz } from "@/lib/timezone";

/**
 * GET /clients/[id]/qr/pdf - the printable clock-in card for a participant.
 * A straight download: whoever is going out there next prints it.
 */
export const dynamic = "force-dynamic";

const BUSINESS = [
  "Pristine Care Group Pty Ltd",
  "80 The Esplanade, Surfers Paradise QLD 4217",
  "ABN 42 664 650 784",
  "02 9146 6547",
];

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireScope().catch(() => null);
  if (!ctx) return new NextResponse("Not signed in", { status: 401 });
  const { tenant, session, scope } = ctx;
  // Super admin only - see the note on the page this is downloaded from.
  if (!isSuperAdmin(session.role)) {
    return new NextResponse("Not authorised", { status: 403 });
  }

  const { id } = await params;
  const client = await prisma.client.findFirst({
    where: { id, tenantId: tenant.id, ...opsWhere(scope) },
    select: {
      firstName: true,
      lastName: true,
      address: true,
      qrToken: true,
      qrIssuedAt: true,
      branch: { select: { state: true } },
    },
  });
  if (!client) return new NextResponse("Not found", { status: 404 });
  if (!client.qrToken) {
    return new NextResponse("No card has been created for this participant yet", {
      status: 404,
    });
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : "https://shift.pristinecaregroup.au";

  const tz = tzForState(client.branch?.state ?? null);
  const issued = client.qrIssuedAt ?? new Date();

  const buf = await renderQrCardPdf({
    participantName: `${client.firstName} ${client.lastName}`,
    address: client.address,
    url: qrUrlFor(origin, client.qrToken),
    reference: client.qrToken.slice(-6),
    issuedLabel: fmtInTz(issued, tz, {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    tenantName: tenant.name || "PCG Shift Care",
    brand: tenant.brandColor || "#003146",
    businessLines: BUSINESS,
  });

  const slug = `${client.firstName}-${client.lastName}`
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase();
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="clock-in-card-${slug}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
