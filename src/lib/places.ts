import "server-only";

/**
 * Address search for the participant form.
 *
 * Google Places is used when GOOGLE_PLACES_API_KEY is set: it's the only
 * option that reliably returns Australian addresses complete with unit and
 * house numbers ("7/59-61 Anne Street, Southport QLD 4215"), which is what
 * the clock-in geofence depends on.
 *
 * Without a key it falls back to OpenStreetMap, which is free but only
 * resolves to the street in most of Australia — good enough to place a
 * geofence roughly, not good enough to distinguish units.
 */

export type AddressHit = {
  label: string;
  /** Present for Google results — coordinates are fetched when picked. */
  placeId?: string;
  lat?: number;
  lng?: number;
};

export function placesConfigured(): boolean {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY);
}

// ── Google Places (New) ───────────────────────────────────────────────────

async function googleSuggest(input: string): Promise<AddressHit[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY!,
    },
    body: JSON.stringify({
      input,
      includedRegionCodes: ["au"],
      // Street addresses and subpremises (units), not businesses or regions.
      includedPrimaryTypes: ["street_address", "subpremise", "premise"],
    }),
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) return [];

  const data = (await res.json()) as {
    suggestions?: { placePrediction?: { placeId: string; text?: { text?: string } } }[];
  };
  return (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is { placeId: string; text?: { text?: string } } => Boolean(p))
    .map((p) => ({ label: p.text?.text ?? "", placeId: p.placeId }))
    .filter((h) => h.label);
}

/** Coordinates + the tidy full address for a Google suggestion. */
export async function googlePlaceDetails(
  placeId: string,
): Promise<{ label: string; lat: number; lng: number } | null> {
  if (!placesConfigured()) return null;
  const res = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      headers: {
        "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY!,
        "X-Goog-FieldMask": "formattedAddress,location",
      },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    },
  );
  if (!res.ok) return null;
  const d = (await res.json()) as {
    formattedAddress?: string;
    location?: { latitude: number; longitude: number };
  };
  if (!d.location) return null;
  return {
    label: d.formattedAddress ?? "",
    lat: d.location.latitude,
    lng: d.location.longitude,
  };
}

// ── OpenStreetMap fallback ────────────────────────────────────────────────

type OsmHit = { display_name: string; lat: string; lon: string };

/**
 * Progressively simpler forms of what was typed. OSM returns nothing at all
 * for a leading unit token, so strip it and try again rather than showing an
 * empty list.
 */
function variants(raw: string): string[] {
  const q = raw.trim().replace(/\s+/g, " ");
  const out = [q];
  const noUnit = q
    .replace(/^\s*(unit|apt|apartment|flat|level|lvl|u|l)\s*\.?\s*\d+[a-z]?\s*[,/-]?\s*/i, "")
    .replace(/^\s*\d+[a-z]?\s*\/\s*/, "");
  if (noUnit !== q) out.push(noUnit);
  const noNumber = noUnit.replace(/^\s*[\d-]+[a-z]?\s+/i, "");
  if (noNumber !== noUnit) out.push(noNumber);
  return [...new Set(out)].filter((v) => v.length >= 4);
}

async function osmLookup(q: string): Promise<AddressHit[]> {
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
  const hits = (await res.json()) as OsmHit[];
  return hits.map((h) => ({
    label: h.display_name,
    lat: Number(h.lat),
    lng: Number(h.lon),
  }));
}

// ── Public API ────────────────────────────────────────────────────────────

const cache = new Map<string, { at: number; hits: AddressHit[]; simplified: string | null }>();
const CACHE_MS = 10 * 60_000;

export async function searchAddresses(
  input: string,
): Promise<{ results: AddressHit[]; simplifiedTo: string | null; source: string }> {
  const q = input.trim();
  if (q.length < 4) return { results: [], simplifiedTo: null, source: "none" };

  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return {
      results: hit.hits,
      simplifiedTo: hit.simplified,
      source: placesConfigured() ? "google" : "osm",
    };
  }

  if (placesConfigured()) {
    try {
      const results = await googleSuggest(q);
      if (results.length) {
        if (cache.size > 500) cache.clear();
        cache.set(key, { at: Date.now(), hits: results, simplified: null });
        return { results, simplifiedTo: null, source: "google" };
      }
    } catch {
      /* fall through to OSM */
    }
  }

  for (const v of variants(q)) {
    try {
      const results = await osmLookup(v);
      if (results.length) {
        const simplified = v === q ? null : v;
        if (cache.size > 500) cache.clear();
        cache.set(key, { at: Date.now(), hits: results, simplified });
        return { results, simplifiedTo: simplified, source: "osm" };
      }
    } catch {
      /* try the next variant */
    }
  }

  return { results: [], simplifiedTo: null, source: placesConfigured() ? "google" : "osm" };
}
