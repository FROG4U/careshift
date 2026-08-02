import "server-only";

/**
 * Best-effort street speed limits from OpenStreetMap (Overpass API).
 * Coverage is incomplete — roads with no `maxspeed` tag return null, and we
 * NEVER flag those as speeding. Results are cached per rounded coordinate for
 * the life of the server process to keep Overpass calls down.
 */

type LimitHit = { limitKmh: number; roadName: string | null } | null;

const cache = new Map<string, LimitHit>();

function keyOf(lat: number, lng: number) {
  // ~30 m grid — enough to reuse limits along a road without over-querying.
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

/** Parse an OSM maxspeed tag: "60", "60 km/h", "50 mph". → km/h int or null. */
function parseMaxspeed(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  if (s === "none" || s === "signals" || s === "walk") return null;
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return s.includes("mph") ? Math.round(n * 1.60934) : Math.round(n);
}

/**
 * Nearest road's speed limit to a point, or null if unknown.
 * Uses Overpass `around` to find the closest highway with a maxspeed tag.
 */
export async function speedLimitAt(
  lat: number,
  lng: number,
): Promise<LimitHit> {
  const k = keyOf(lat, lng);
  if (cache.has(k)) return cache.get(k)!;

  const query = `[out:json][timeout:8];way(around:35,${lat},${lng})["highway"]["maxspeed"];out tags center 1;`;
  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: query,
      signal: AbortSignal.timeout(9000),
      cache: "no-store",
    });
    if (!res.ok) {
      cache.set(k, null);
      return null;
    }
    const data = (await res.json()) as {
      elements?: { tags?: Record<string, string> }[];
    };
    const el = data.elements?.find((e) => parseMaxspeed(e.tags?.maxspeed) != null);
    if (!el) {
      cache.set(k, null);
      return null;
    }
    const hit: LimitHit = {
      limitKmh: parseMaxspeed(el.tags!.maxspeed)!,
      roadName: el.tags?.name ?? el.tags?.ref ?? null,
    };
    cache.set(k, hit);
    return hit;
  } catch {
    cache.set(k, null);
    return null;
  }
}

/** Only start checking above this speed (ignore walking/parking GPS jitter). */
export const MIN_DRIVING_KMH = 25;
/** Allowance over the limit before it's flagged (GPS noise + small overruns). */
export const SPEED_TOLERANCE_KMH = 7;
