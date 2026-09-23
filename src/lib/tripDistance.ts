import "server-only";
import { prisma } from "./prisma";
import { roadDistanceKm } from "./roadDistance";

/**
 * How far a trip actually went, from its GPS trail.
 *
 * PCG Shift Care runs in the phone's browser, and a browser stops sending location
 * when the screen locks or another app is in front. A trip then arrives as a
 * few points with long silences between them: at home, at the beach for two
 * minutes, back at home.
 *
 * Three things used to go wrong with that:
 * - any single jump of 5 km or more was thrown away as a "GPS glitch", so a
 *   round trip to the beach was saved as 0 km;
 * - the road estimate that was meant to rescue sparse trips was checked
 *   against that already-wrong figure, so a correct 25 km was rejected for
 *   being "more than 3x 0.16 km";
 * - trips with more than 100 points never got a road estimate at all.
 *
 * Now each stretch is treated on its own. Where the phone was reporting, the
 * GPS is the measurement and is used as is. Where it went quiet, that stretch
 * alone is routed along the roads. Glitches are recognised by impossible speed,
 * not by distance, so a real 10 km drive is never discarded.
 */

export type TrackPoint = { lat: number; lng: number; at: Date | string };

/** Movement smaller than this is GPS jitter, not travel. */
const JITTER_KM = 0.015;
/** A silence longer than this means the phone wasn't reporting. */
const GAP_S = 90;
/** Faster than this between two readings is a bad fix, not a car. */
const GLITCH_KMH = 200;
/** Quiet stretches shorter than this aren't worth a road lookup. */
const MIN_ROUTED_KM = 0.3;
/** Cap on road lookups per trip, to stay polite to the public router. */
const MAX_ROUTED_LEGS = 40;

export function haversineKm(a: TrackPoint, b: TrackPoint): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const ms = (p: TrackPoint) => new Date(p.at).getTime();

type Leg = { from: TrackPoint; to: TrackPoint; km: number; quiet: boolean };

/** The trail as a series of real movements, jitter and glitches removed. */
function legsOf(points: TrackPoint[]): Leg[] {
  const sorted = [...points].sort((a, b) => ms(a) - ms(b));
  const legs: Leg[] = [];
  if (sorted.length < 2) return legs;

  let anchor = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const p = sorted[i];
    const km = haversineKm(anchor, p);
    if (km < JITTER_KM) continue;

    const hrs = (ms(p) - ms(anchor)) / 3_600_000;
    // A jump no car could make is a bad reading. Skip the point, keep the
    // anchor, and measure the next good reading from where we really were.
    if (km > 1 && (hrs <= 0 || km / hrs > GLITCH_KMH)) continue;

    const quiet = (ms(p) - ms(sorted[i - 1])) / 1000 > GAP_S;
    legs.push({ from: anchor, to: p, km, quiet });
    anchor = p;
  }
  return legs;
}

/** Straight-line distance along the cleaned trail. Never calls out. */
export function gpsPathKm(points: TrackPoint[]): number {
  return legsOf(points).reduce((sum, l) => sum + l.km, 0);
}

async function roadKm(leg: Leg): Promise<number | null> {
  const pair = [leg.from, leg.to];
  for (let attempt = 0; attempt < 2; attempt++) {
    const km = await roadDistanceKm(pair, leg.km);
    if (km != null) return km;
  }
  return null;
}

/**
 * The trip's distance: measured where the phone reported, road-routed where it
 * went quiet. Falls back to the straight line for any stretch the router can't
 * answer, so the result is never below the GPS trail itself.
 */
export async function measuredTripKm(
  points: TrackPoint[],
): Promise<{ km: number; routed: number; unrouted: number }> {
  const legs = legsOf(points);
  const toRoute = new Set(
    legs.filter((l) => l.quiet && l.km >= MIN_ROUTED_KM).slice(0, MAX_ROUTED_LEGS),
  );

  let km = 0;
  let routed = 0;
  let unrouted = 0;
  const queue = [...legs];
  // A few lookups at a time: fast enough, and gentle on a public server.
  while (queue.length) {
    const batch = queue.splice(0, 4);
    const results = await Promise.all(
      batch.map(async (l) => {
        if (!toRoute.has(l)) return l.km;
        const road = await roadKm(l);
        if (road == null) {
          unrouted += 1;
          return l.km;
        }
        routed += 1;
        return Math.max(road, l.km);
      }),
    );
    km += results.reduce((a, b) => a + b, 0);
  }

  if (unrouted > 0) {
    console.warn(
      `[trip distance] road estimate unavailable for ${unrouted} stretch(es); used the straight line`,
    );
  }
  return { km, routed, unrouted };
}

/**
 * Work out a finished trip's distance and save it if it's more than recorded.
 *
 * Only ever raises the figure: the running total during the trip is a series of
 * straight lines, which can only undercount. A trip an admin has corrected by
 * hand is left exactly as they set it.
 */
export async function finaliseTripKm(transportId: string): Promise<number | null> {
  const trip = await prisma.transport.findUnique({
    where: { id: transportId },
    select: {
      km: true,
      kmEditedAt: true,
      points: { select: { lat: true, lng: true, at: true } },
    },
  });
  if (!trip) return null;
  if (trip.kmEditedAt) return trip.km;

  const { km } = await measuredTripKm(trip.points);
  const best = Math.round(Math.max(trip.km, km) * 100) / 100;
  if (best > trip.km + 0.01) {
    await prisma.transport.update({ where: { id: transportId }, data: { km: best } });
  }
  return best;
}
