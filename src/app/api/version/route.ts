import { NextResponse } from "next/server";
import { buildId } from "@/lib/buildId";

export const dynamic = "force-dynamic";

/** Which deploy the server is running, so open pages know when to refresh. */
export function GET() {
  return NextResponse.json(
    { id: buildId() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
