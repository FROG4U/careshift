import "server-only";

/**
 * Turn a participant's address into map coordinates, on the SERVER.
 *
 * Why this exists: the participant form also has a "use current location"
 * button, which captures the BROWSER's position. That's right when an admin
 * is standing in someone's home, but this team schedules from around the
 * world — an admin in South Africa setting up Sydney participants saved her
 * own position, putting every clock-in geofence 11,000 km from the client.
 *
 * So the address is the source of truth. A hand-captured position is only
 * kept when it's near the address (fine-tuning a driveway or a back
 * entrance); anything further away is treated as a mistake.
 */

const NEAR_ENOUGH_KM = 2;

export type GeocodeResult = {
  lat: number;
  lng: number;
  label: string;
} | null;

export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const q = address.trim();
  if (q.length < 6) return null;

  try {
    const url =
      "https://nominatim.openstreetmap.org/search" +
      `?format=json&limit=1&countrycodes=au&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: {
        // Nominatim requires identifying the caller.
        "User-Agent": "CareShift/1.0 (care rostering; +https://shift.pristinecaregroup.au)",
        "Accept-Language": "en",
      },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      lat: string;
      lon: string;
      display_name: string;
    }[];
    if (!data?.length) return null;
    return {
      lat: Number(data[0].lat),
      lng: Number(data[0].lon),
      label: data[0].display_name,
    };
  } catch {
    return null; // offline or rate-limited — keep whatever we had
  }
}

export function kmBetween(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(toRad(aLat)) * Math.cos(toRad(bLat));
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Decide the coordinates to store for a participant.
 *
 * Returns what to save plus whether the submitted position was rejected, so
 * the caller can tell the admin rather than silently overriding them.
 */
export async function resolveClientCoords(
  address: string | null,
  submittedLat: number | null,
  submittedLng: number | null,
): Promise<{
  lat: number | null;
  lng: number | null;
  correctedFromKm: number | null;
}> {
  if (!address) return { lat: submittedLat, lng: submittedLng, correctedFromKm: null };

  const geo = await geocodeAddress(address);
  if (!geo) {
    // Couldn't look the address up — keep whatever was submitted.
    return { lat: submittedLat, lng: submittedLng, correctedFromKm: null };
  }

  if (submittedLat == null || submittedLng == null) {
    return { lat: geo.lat, lng: geo.lng, correctedFromKm: null };
  }

  const away = kmBetween(submittedLat, submittedLng, geo.lat, geo.lng);
  if (away <= NEAR_ENOUGH_KM) {
    // Close to the address — respect the precise point someone captured.
    return { lat: submittedLat, lng: submittedLng, correctedFromKm: null };
  }

  // Miles away from the address: almost certainly the admin's own location.
  return { lat: geo.lat, lng: geo.lng, correctedFromKm: Math.round(away) };
}
