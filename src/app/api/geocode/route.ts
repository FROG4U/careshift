import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Address lookup for the participant form.
 *
 * Proxied through our own server rather than called from the browser so we
 * can identify ourselves properly to OpenStreetMap, cache repeats, and — most
 * importantly — retry the query in simpler forms.
 *
 * People type real addresses like "U7 59-61 Anne street QLD 4215". OpenStreetMap
 * returns NOTHING for that, because of the unit prefix. The admin then sees no
 * suggestions, types it by hand, and the participant ends up with no clock-in
 * point at all — which is exactly how four participants ended up with a
 * geofence on another continent.
 */

type Hit = { display_name: string; lat: string; lon: string };

const cache = new Map<string, { at: number; hits: Hit[] }>();
const CACHE_MS = 10 * 60_000;

/** Progressively simpler forms of what the user typed. */
function variants(raw: string): string[] {
  const q = raw.trim().replace(/\s+/g, " ");
  const out = [q];

  // Drop a leading unit/apartment/level token: "U7 ", "8D/2 ", "Unit 3, ",
  // "Apt 12 ", "L2/45 ". The street number after it is what OSM can match.
  const noUnit = q
    .replace(/^\s*(unit|apt|apartment|flat|level|lvl|u|l)\s*\.?\s*\d+[a-z]?\s*[,/-]?\s*/i, "")
    .replace(/^\s*\d+[a-z]?\s*\/\s*/, "");
  if (noUnit !== q) out.push(noUnit);

  // Then without the street number at all — the street + suburb is usually
  // enough to place the geofence within a house or two.
  const noNumber = noUnit.replace(/^\s*[\d-]+[a-z]?\s+/i, "");
  if (noNumber !== noUnit) out.push(noNumber);

  return [...new Set(out)].filter((v) => v.length >= 4);
}

async function lookup(q: string): Promise<Hit[]> {
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.hits;

  const url =
    "https://nominatim.openstreetmap.org/search" +
    `?format=json&addressdetails=1&limit=5&countrycodes=au&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "CareShift/1.0 (care rostering; +https://shift.pristinecaregroup.au)",
      "Accept-Language": "en",
    },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) return [];
  const hits = (await res.json()) as Hit[];

  if (cache.size > 500) cache.clear();
  cache.set(key, { at: Date.now(), hits });
  return hits;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ results: [] }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (q.trim().length < 4) return NextResponse.json({ results: [] });

  for (const v of variants(q)) {
    try {
      const hits = await lookup(v);
      if (hits.length > 0) {
        return NextResponse.json({
          results: hits.map((h) => ({
            label: h.display_name,
            lat: Number(h.lat),
            lng: Number(h.lon),
          })),
          // Tell the UI we had to simplify, so it can say so.
          matchedOn: v === q.trim() ? null : v,
        });
      }
    } catch {
      /* try the next variant */
    }
  }

  return NextResponse.json({ results: [], matchedOn: null });
}
