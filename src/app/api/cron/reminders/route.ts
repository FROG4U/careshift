import { NextRequest, NextResponse } from "next/server";
import { runTaskReminders } from "@/lib/taskReminders";

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
  return NextResponse.json({ ok: true, ...result });
}
