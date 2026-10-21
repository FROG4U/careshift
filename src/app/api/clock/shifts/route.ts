import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashQrToken } from "@/lib/qrClock";
import { tzForState, fmtInTz } from "@/lib/timezone";

/**
 * The worker's shifts around now, in the small shape the offline clock screen
 * keeps on the phone.
 *
 * Fetched whenever the app is opened with a signal, so the screen still knows
 * which shift a scanned card belongs to when there's no signal at all. The
 * participant's code is sent as a HASH, never the code itself: the phone has
 * to be able to recognise a card it scans, but must not carry something that
 * would let anyone clock in without standing in front of one.
 */
export const dynamic = "force-dynamic";

/** How much of the roster the phone carries: yesterday to a week ahead. */
const FROM_MS = 24 * 3_600_000;
const TO_MS = 7 * 24 * 3_600_000;

export async function GET() {
  const session = await getSession();
  if (!session?.staffId) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const now = Date.now();
  const shifts = await prisma.shift.findMany({
    where: {
      tenantId: session.tenantId,
      staffId: session.staffId,
      status: { in: ["SCHEDULED", "IN_PROGRESS"] },
      start: { gte: new Date(now - FROM_MS), lte: new Date(now + TO_MS) },
    },
    select: {
      id: true,
      start: true,
      end: true,
      status: true,
      clockInAt: true,
      client: {
        select: {
          firstName: true,
          lastName: true,
          address: true,
          qrToken: true,
        },
      },
      branch: { select: { state: true } },
    },
    orderBy: { start: "asc" },
  });

  return NextResponse.json(
    {
      ok: true,
      fetchedAt: new Date().toISOString(),
      shifts: shifts.map((s) => {
        const tz = tzForState(s.branch?.state ?? null);
        return {
          id: s.id,
          clientName: `${s.client.firstName} ${s.client.lastName}`,
          address: s.client.address ?? "",
          // The card's code, one-way hashed - see the note above.
          codeHash: s.client.qrToken ? hashQrToken(s.client.qrToken) : null,
          start: s.start.toISOString(),
          end: s.end.toISOString(),
          status: s.status,
          clockInAt: s.clockInAt?.toISOString() ?? null,
          // Pre-formatted in the branch's own timezone: the offline screen has
          // no way to know whether a shift is NSW or Queensland time.
          whenLabel: `${fmtInTz(s.start, tz, {
            weekday: "short",
            day: "numeric",
            month: "short",
          })}, ${fmtInTz(s.start, tz, {
            hour: "numeric",
            minute: "2-digit",
          })} - ${fmtInTz(s.end, tz, { hour: "numeric", minute: "2-digit" })}`,
        };
      }),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
