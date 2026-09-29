/**
 * The names of the non-participant work types.
 *
 * Free of server-only imports on purpose: the schedule band that shows these
 * is a client component, and the labels have to be the same on both sides.
 */
export const DUTY_KINDS = ["MEETING", "SUPERVISION", "TRAINING", "OTHER"] as const;
export type DutyKind = (typeof DUTY_KINDS)[number];

export const DUTY_LABELS: Record<DutyKind, string> = {
  MEETING: "Meeting",
  SUPERVISION: "Supervision",
  TRAINING: "Training",
  OTHER: "Other",
};
