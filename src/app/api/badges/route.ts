import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { loadScope } from "@/lib/scope";
import { loadSidebarCounts } from "@/lib/sidebarCounts";

/**
 * GET /api/badges - the sidebar counts, live.
 *
 * The layout works these out when the app shell loads and then never again,
 * because a layout does not re-render as you move between pages. So a worker
 * signing up while an admin sits on the Schedule left the Approvals badge
 * dark until the next hard refresh - which is exactly when a badge is
 * supposed to earn its keep.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session || session.status !== "APPROVED") {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const scope = await loadScope(session);
  const counts = await loadSidebarCounts(session, scope);

  return NextResponse.json(counts, {
    headers: { "Cache-Control": "no-store" },
  });
}
