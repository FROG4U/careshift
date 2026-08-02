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
  const judged = shifts.filter((s) => s.clockInAt && s.clockOutAt);
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

  const base = total === 0 ? 100 : (clean / total) * 100;
  const penalty = lateNotices * cfg.lateNoticePenalty;
  const score = Math.max(0, Math.min(100, Math.round(base - penalty)));

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
