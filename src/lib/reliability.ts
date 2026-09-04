import "server-only";

/** Admin-configurable attendance thresholds (stored on the tenant). */
export type AttendanceSettings = {
  lateGraceMin: number;
  earlyFinishGraceMin: number;
  lateFinishGraceMin: number;
  ratingGreenAt: number;
  ratingAmberAt: number;
  lateNoticePenalty: number;
};

export type ShiftForRating = {
  start: Date;
  end: Date;
  clockInAt: Date | null;
  clockOutAt: Date | null;
};

export type ShiftFlags = {
  lateStart: boolean;
  earlyFinish: boolean;
  lateFinish: boolean;
  /** Minutes after the rostered start the worker clocked in (negative = early). */
  startDeltaMin: number | null;
  /** Minutes after the rostered end the worker clocked out (negative = early). */
  endDeltaMin: number | null;
  clean: boolean;
};

const minsBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 60_000;

/**
 * How much each older shift counts relative to the next newer one.
 *
 * 0.85 means the shift before last carries 85% of the newest one's weight, the
 * one before that 72%, and so on. Roughly: the last four or five shifts drive
 * most of the score, and anything beyond about fifteen barely registers. Raise
 * it towards 1 to make the score more forgiving of a bad run but slower to
 * recover; lower it to react faster to recent work.
 */
const RECENCY_DECAY = 0.85;


/** Judge one shift against the thresholds. */
export function flagShift(
  s: ShiftForRating,
  cfg: AttendanceSettings,
): ShiftFlags {
  const startDeltaMin = s.clockInAt
    ? Math.round(minsBetween(new Date(s.start), new Date(s.clockInAt)))
    : null;
  const endDeltaMin = s.clockOutAt
    ? Math.round(minsBetween(new Date(s.end), new Date(s.clockOutAt)))
    : null;

  const lateStart = startDeltaMin != null && startDeltaMin > cfg.lateGraceMin;
  const earlyFinish =
    endDeltaMin != null && endDeltaMin < -cfg.earlyFinishGraceMin;
  const lateFinish =
    endDeltaMin != null && endDeltaMin > cfg.lateFinishGraceMin;

  return {
    lateStart,
    earlyFinish,
    lateFinish,
    startDeltaMin,
    endDeltaMin,
    // Finishing late is NOT a fault — staying past the rostered end is going
    // the extra mile. Only a late start or an early finish counts against.
    clean: !lateStart && !earlyFinish,
  };
}

/** Minutes → "2h 15m" / "45m". Keeps big numbers readable. */
export function fmtMins(mins: number): string {
  const m = Math.abs(Math.round(mins));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

export type Reliability = {
  score: number; // 0–100
  band: "GREEN" | "AMBER" | "RED";
  total: number;
  clean: number;
  lateStarts: number;
  earlyFinishes: number;
  /** Stayed past the rostered end — a positive, never penalised. */
  stayedLate: number;
  lateNotices: number;
  /** Average minutes late clocking in (only counting late ones). */
  avgLateMin: number;
};

/**
 * Reliability score = share of shifts with no attendance issues, minus a small
 * penalty per "running late" notice. A worker with no completed shifts yet
 * scores 100 (nothing held against them).
 */
export function reliabilityOf(
  shifts: ShiftForRating[],
  lateNotices: number,
  cfg: AttendanceSettings,
): Reliability {
  // Only shifts the worker actually clocked into can be judged.
  //
  // Sorted here rather than trusting the caller: the score weights recent work
  // more heavily, so an arbitrary order would silently produce an arbitrary
  // score. Neither caller specifies an orderBy.
  const judged = shifts
    .filter((s) => s.clockInAt && s.clockOutAt)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  const flags = judged.map((s) => flagShift(s, cfg));

  const total = judged.length;
  const clean = flags.filter((f) => f.clean).length;
  const lateStarts = flags.filter((f) => f.lateStart).length;
  const earlyFinishes = flags.filter((f) => f.earlyFinish).length;
  // Counted only when they also started on time — that's the "extra mile" case.
  const stayedLate = flags.filter((f) => f.lateFinish && !f.lateStart).length;

  const lateDeltas = flags
    .filter((f) => f.lateStart && f.startDeltaMin != null)
    .map((f) => f.startDeltaMin as number);
  const avgLateMin = lateDeltas.length
    ? Math.round(lateDeltas.reduce((a, b) => a + b, 0) / lateDeltas.length)
    : 0;

  // Recency-weighted, not a lifetime average.
  //
  // A flat average means an early mistake never fades: a worker whose first
  // shift ran late is stuck below par however well they do afterwards, which
  // is both unfair and useless as a signal - it stops tracking how they are
  // working NOW. Each older shift counts a little less than the one after it,
  // so consistent good work pulls the score up over a few shifts while a
  // recent problem still shows.
  //
  // `judged` is sorted oldest-first above, so the weight climbs towards the
  // end of the list.
  let weighted = 0;
  let weightTotal = 0;
  flags.forEach((f, i) => {
    // i = 0 is the OLDEST of the judged shifts.
    const stepsFromNewest = flags.length - 1 - i;
    const w = Math.pow(RECENCY_DECAY, stepsFromNewest);
    weightTotal += w;
    if (f.clean) weighted += w;
  });

  const base = weightTotal === 0 ? 100 : (weighted / weightTotal) * 100;
  const penalty = lateNotices * cfg.lateNoticePenalty;
  const score = Math.max(0, Math.min(100, Math.round(base - penalty)));

  // Banded straight off the score, from the first shift. The rating is meant
  // to move with how someone is working right now: do well and it says so
  // immediately, slip and it says that too.
  const band: Reliability["band"] =
    score >= cfg.ratingGreenAt
      ? "GREEN"
      : score >= cfg.ratingAmberAt
        ? "AMBER"
        : "RED";

  return {
    score,
    band,
    total,
    clean,
    lateStarts,
    earlyFinishes,
    stayedLate,
    lateNotices,
    avgLateMin,
  };
}
