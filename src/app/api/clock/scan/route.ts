import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { applyScan, type ScanEvent, type ScanResult } from "@/lib/qrClock";

/**
 * Where scanned QR cards are sent: one scan when there's a signal, or the
 * whole queue a phone has been holding since it lost one.
 *
 * Each scan carries an id generated on the phone, so a queue that is sent
 * twice - the first reply lost on a flaky connection - is recognised rather
 * than clocking a worker out of the shift it has just clocked them into.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.staffId) {
    return NextResponse.json({ ok: false, error: "signed out" }, { status: 401 });
  }

  let body: { deviceNow?: string; events?: ScanEvent[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const events = Array.isArray(body.events) ? body.events.slice(0, 50) : [];
  if (events.length === 0) {
    return NextResponse.json({ ok: true, results: [] });
  }

  const receivedAt = new Date();
  const deviceNow = body.deviceNow ? new Date(body.deviceNow) : null;
  const who = { tenantId: session.tenantId, staffId: session.staffId };

  const results: ScanResult[] = [];
  // In the order they were scanned: an in and an out for the same shift in one
  // queue have to be applied that way round.
  for (const ev of [...events].sort((a, b) => a.at.localeCompare(b.at))) {
    if (!ev?.id || !ev?.token || !ev?.at) continue;
    try {
      results.push(
        await applyScan(
          who,
          ev,
          receivedAt,
          deviceNow && !Number.isNaN(deviceNow.getTime()) ? deviceNow : null,
        ),
      );
    } catch (e) {
      results.push({
        id: ev.id,
        ok: false,
        outcome: "ERROR",
        message:
          "Something went wrong saving that scan. It's still on your phone and will try again.",
      });
      console.error("qr scan failed", e);
    }
  }

  if (results.some((r) => r.ok)) {
    revalidatePath("/my-shifts");
    revalidatePath("/timesheets");
    revalidatePath("/live");
  }

  return NextResponse.json({ ok: true, results, serverNow: receivedAt.toISOString() });
}
