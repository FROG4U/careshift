import "server-only";

/**
 * Real road distance for a recorded trip.
 *
 * Mileage was summed as straight lines between GPS samples. That's fine when
 * samples are dense, but browsers suspend background work, so real trips came
 * back with four points across eighteen minutes — three straight lines cutting
 * across suburbs instead of the roads actually driven. Mileage is paid, so
 * that undercounts what a worker is owed.
 *
 * OSRM snaps the sparse points to the road network and returns the driving
 * distance along it. Best-effort: if OSRM is slow, down, or returns something
 * implausible, the caller keeps the straight-line figure rather than replacing
 * a slight underestimate with a wrong number.
 */

const OSRM = "https://router.project-osrm.org";

/** OSRM's public server caps a request; more than this and we don't ask. */
const MAX_POINTS = 100;

/**
 * A snapped route this much longer than the straight-line distance means OSRM
 * matched the wrong roads (a common failure with widely spaced points), so the
 * result is rejected.
 */
const MAX_PLAUSIBLE_RATIO = 3;

export type TripPoint = { lat: number; lng: number };

/**
 * Driving distance in km along real roads, or null when it can't be trusted.
 */
export async function roadDistanceKm(
  points: TripPoint[],
  straightLineKm: number,
): Promise<number | null> {
  if (points.length < 2 || points.length > MAX_POINTS) return null;

  const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
  const url = `${OSRM}/route/v1/driving/${coords}?overview=false`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      code?: string;
      routes?: { distance?: number }[];
    };
    if (data.code !== "Ok") return null;

    const metres = data.routes?.[0]?.distance;
    if (typeof metres !== "number" || !Number.isFinite(metres)) return null;

    const km = metres / 1000;
    if (km <= 0) return null;

    // Roads are always at least as long as the crow flies. A snapped route
    // SHORTER than the straight line means the match went wrong.
    if (straightLineKm > 0) {
      if (km < straightLineKm * 0.9) return null;
      if (km > straightLineKm * MAX_PLAUSIBLE_RATIO) return null;
    }

    return Math.round(km * 10) / 10;
  } catch {
    // Timeout, network, malformed response — keep the straight-line figure.
    return null;
  }
}
