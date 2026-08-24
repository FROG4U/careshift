import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  searchAddresses,
  googlePlaceDetails,
  placesConfigured,
} from "@/lib/places";

export const dynamic = "force-dynamic";

/**
 * Address suggestions for the participant form.
 *
 * ?q=      search
 * ?place=  resolve a Google suggestion to coordinates once it's picked
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ results: [] }, { status: 401 });

  const placeId = req.nextUrl.searchParams.get("place");
  if (placeId) {
    const details = await googlePlaceDetails(placeId);
    if (!details) return NextResponse.json({ ok: false }, { status: 404 });
    return NextResponse.json({ ok: true, ...details });
  }

  const q = req.nextUrl.searchParams.get("q") ?? "";
  const { results, simplifiedTo, source } = await searchAddresses(q);

  return NextResponse.json({
    results,
    matchedOn: simplifiedTo,
    source,
    // Lets the form explain why suggestions lack unit numbers.
    precise: placesConfigured(),
  });
}
