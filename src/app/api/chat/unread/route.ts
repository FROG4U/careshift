import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { totalUnread } from "@/lib/chat";

export const dynamic = "force-dynamic";

/**
 * How many unread messages the signed-in user has, across every conversation.
 *
 * The sidebar and bottom nav both render this count, but they're fed by the
 * `(app)` layout — a server component, which Next only re-renders on a full
 * page load. Without this endpoint the badge shows whatever was true when the
 * tab was opened and never moves again, in either direction.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ unread: 0 }, { status: 401 });

  const unread = await totalUnread(session.tenantId, session.id);
  return NextResponse.json({ unread });
}
