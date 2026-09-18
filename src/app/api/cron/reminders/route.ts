import { NextRequest, NextResponse } from "next/server";
import { runTaskReminders } from "@/lib/taskReminders";
import { runLiveChecks } from "@/lib/liveShifts";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Fires due task reminders. Called every few minutes by cron on the server.
 *
 * Guarded by CRON_SECRET so it can't be triggered from outside — without the
 * secret set the endpoint refuses entirely rather than running unauthenticated.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET not configured" },
      { status: 503 },
    );
  }
  const provided =
    req.headers.get("x-cron-key") ?? req.nextUrl.searchParams.get("key");
  if (provided !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const result = await runTaskReminders();

  // Late and overrun alerts. These only ran when someone had Live Shifts open,
  // so a shift overrunning at 8pm wasn't flagged until an admin looked the next
  // morning. Each alert still fires once per shift.
  const tenants = await prisma.tenant.findMany({
    select: { id: true, lateGraceMin: true },
  });
  let liveShifts = 0;
  for (const t of tenants) {
    try {
      liveShifts += (await runLiveChecks(t.id, t.lateGraceMin ?? 5)).length;
    } catch (e) {
      console.error("[cron] live checks failed", e);
    }
  }

  return NextResponse.json({ ok: true, ...result, liveShifts });
}
