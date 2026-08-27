/**
 * Whether a trip's GPS trail is dense enough to say anything about speed.
 *
 * Sampling runs in the browser, and browsers suspend background work when the
 * screen locks or the tab is hidden. On real trips that produced four points
 * across eighteen minutes: enough to draw a rough line on a map, nowhere near
 * enough to judge how fast someone drove.
 *
 * Reporting "0 over limit" from that data is worse than reporting nothing —
 * it reads as "we checked and they were fine" when nothing was checked. So
 * anything sparse is labelled unreliable and no speeding claim is made either
 * way.
 */

/** Longest acceptable gap between samples, in seconds. */
const MAX_GAP_S = 90;

/** Below this many samples there is nothing meaningful to assess. */
const MIN_POINTS = 6;

export type TripPoint = { at: Date | string };

export type GpsQuality = {
  reliable: boolean;
  points: number;
  /** Longest gap between consecutive samples, in seconds. */
  worstGapS: number;
  /** Plain-English reason when it isn't reliable. */
  reason: string | null;
};

export function gpsQualityOf(points: TripPoint[]): GpsQuality {
  const times = points
    .map((p) => new Date(p.at).getTime())
    .sort((a, b) => a - b);

  let worstGapS = 0;
  for (let i = 1; i < times.length; i++) {
    worstGapS = Math.max(worstGapS, (times[i] - times[i - 1]) / 1000);
  }

  if (times.length < MIN_POINTS) {
    return {
      reliable: false,
      points: times.length,
      worstGapS: Math.round(worstGapS),
      reason:
        "Too few GPS readings on this trip to judge speed. The phone's screen was probably locked or the app was in the background.",
    };
  }

  if (worstGapS > MAX_GAP_S) {
    return {
      reliable: false,
      points: times.length,
      worstGapS: Math.round(worstGapS),
      reason: `GPS stopped reporting for ${Math.round(worstGapS / 60)} min during this trip, so speed can't be assessed for that stretch.`,
    };
  }

  return {
    reliable: true,
    points: times.length,
    worstGapS: Math.round(worstGapS),
    reason: null,
  };
}
