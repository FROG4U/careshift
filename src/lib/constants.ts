// Allowed string-enum values (SQLite has no native enums).

export const ROLES = ["SUPER_ADMIN", "ADMIN", "COORDINATOR", "WORKER"] as const;
export type Role = (typeof ROLES)[number];

export const SHIFT_STATUS = [
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;
export type ShiftStatus = (typeof SHIFT_STATUS)[number];

export const APPROVAL = ["PENDING", "APPROVED", "REJECTED"] as const;
export type Approval = (typeof APPROVAL)[number];

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Administrator",
  COORDINATOR: "Coordinator",
  WORKER: "Support Worker",
};

/// Funding agreement / price-list streams.
export const AGREEMENT_TYPES = ["NDIS", "AGED_CARE", "DVA"] as const;
export type AgreementType = (typeof AGREEMENT_TYPES)[number];

export const AGREEMENT_LABELS: Record<AgreementType, string> = {
  NDIS: "NDIS",
  AGED_CARE: "Aged Care",
  DVA: "DVA",
};

/// Tailwind classes for the coloured agreement chip.
export const AGREEMENT_BADGE: Record<AgreementType, string> = {
  NDIS: "bg-blue-50 text-blue-700",
  AGED_CARE: "bg-violet-50 text-violet-700",
  DVA: "bg-emerald-50 text-emerald-700",
};

export const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/// Worker pay streams (used on pay levels & staff rates).
export const STAFF_STREAMS = ["NDIS", "AGED_CARE", "DVA", "CLEANING"] as const;
export type StaffStream = (typeof STAFF_STREAMS)[number];

export const STREAM_LABELS: Record<StaffStream, string> = {
  NDIS: "NDIS",
  AGED_CARE: "Aged Care",
  DVA: "DVA",
  CLEANING: "Cleaning",
};

/// Day-type / shift penalty bands (SCHADS), by when the shift runs:
///   Weekday Daytime  — 6:00am to 8:00pm, Mon–Fri
///   Weekday Evening  — 8:00pm to midnight, Mon–Fri
///   Weekday Night    — starts at/before midnight and finishes after midnight,
///                      or starts before 6:00am (active night)
///   Saturday / Sunday / Public Holiday — by the day itself
export const DAY_TYPES = [
  "WEEKDAY_DAY",
  "WEEKDAY_EVENING",
  "WEEKDAY_NIGHT",
  "SATURDAY",
  "SUNDAY",
  "PUBLIC_HOLIDAY",
] as const;
export type DayType = (typeof DAY_TYPES)[number];

export const DAY_TYPE_LABELS: Record<DayType, string> = {
  WEEKDAY_DAY: "Weekday Daytime",
  WEEKDAY_EVENING: "Weekday Evening",
  WEEKDAY_NIGHT: "Weekday Night",
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
  PUBLIC_HOLIDAY: "Public Holiday",
};

/// The hours each weekday band covers, for display.
export const DAY_TYPE_HINTS: Record<DayType, string> = {
  WEEKDAY_DAY: "6am – 8pm",
  WEEKDAY_EVENING: "8pm – midnight",
  WEEKDAY_NIGHT: "past midnight / before 6am",
  SATURDAY: "all day",
  SUNDAY: "all day",
  PUBLIC_HOLIDAY: "all day",
};

/// SCHADS permanent penalty multipliers on the weekday-daytime base. Verified
/// against the Fair Work pay guide: evening (afternoon shift) +12.5%,
/// night +15%, Sat 150%, Sun 200%, public holiday 250%.
export const DAY_TYPE_MULTIPLIER: Record<DayType, number> = {
  WEEKDAY_DAY: 1,
  WEEKDAY_EVENING: 1.125,
  WEEKDAY_NIGHT: 1.15,
  SATURDAY: 1.5,
  SUNDAY: 2,
  PUBLIC_HOLIDAY: 2.5,
};

/// Australian states & territories — public holidays differ by state, so each
/// branch declares which one it operates in.
export const AU_STATES = [
  "NSW",
  "VIC",
  "QLD",
  "WA",
  "SA",
  "TAS",
  "ACT",
  "NT",
] as const;
export type AuState = (typeof AU_STATES)[number];

/// Employment basis — drives whether casual loading is added to pay rates.
export const EMPLOYMENT_TYPES = ["PERMANENT", "CASUAL"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  PERMANENT: "Permanent",
  CASUAL: "Casual",
};

/// SCHADS casual loading (25%) added on top of a level's rates for casual
/// staff. Pay levels store permanent base rates; casual = base × (1 + loading).
export const CASUAL_LOADING = 0.25;

// ── Incident reporting ────────────────────────────────────────────────────
//
// The first six are the NDIS Commission's *reportable incidents*: a provider
// must notify the Commission (24 hours, or 5 business days depending on the
// category), so choosing one flags the report and warns the worker that it
// escalates immediately. The rest are recorded in the provider's own register.
export const INCIDENT_TYPES = [
  { value: "DEATH", label: "Death of a participant", reportable: true },
  { value: "SERIOUS_INJURY", label: "Serious injury of a participant", reportable: true },
  { value: "ABUSE_NEGLECT", label: "Abuse or neglect of a participant", reportable: true },
  {
    value: "UNLAWFUL_CONTACT",
    label: "Unlawful sexual or physical contact, or assault",
    reportable: true,
  },
  {
    value: "SEXUAL_MISCONDUCT",
    label: "Sexual misconduct against, or in front of, a participant",
    reportable: true,
  },
  {
    value: "RESTRICTIVE_PRACTICE",
    label: "Unauthorised use of a restrictive practice",
    reportable: true,
  },
  { value: "FALL", label: "Fall", reportable: false },
  { value: "MEDICATION", label: "Medication error", reportable: false },
  { value: "BEHAVIOUR", label: "Behaviour of concern", reportable: false },
  { value: "MINOR_INJURY", label: "Minor injury", reportable: false },
  { value: "ILLNESS", label: "Illness or medical episode", reportable: false },
  { value: "PROPERTY", label: "Property damage", reportable: false },
  { value: "NEAR_MISS", label: "Near miss (no harm caused)", reportable: false },
  { value: "OTHER", label: "Other", reportable: false },
] as const;

export type IncidentType = (typeof INCIDENT_TYPES)[number]["value"];

/** True when this category must be notified to the NDIS Commission. */
export function isReportableIncident(type: string): boolean {
  return INCIDENT_TYPES.some((t) => t.value === type && t.reportable);
}

export function incidentLabel(type: string): string {
  return INCIDENT_TYPES.find((t) => t.value === type)?.label ?? type;
}

export const INCIDENT_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const INCIDENT_SEVERITY_LABELS: Record<IncidentSeverity, string> = {
  LOW: "Low — no harm, no follow-up needed",
  MEDIUM: "Medium — minor harm or follow-up needed",
  HIGH: "High — significant harm or risk",
  CRITICAL: "Critical — serious harm or danger to life",
};

export const INCIDENT_STATUSES = ["SUBMITTED", "UNDER_REVIEW", "CLOSED"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  SUBMITTED: "New",
  UNDER_REVIEW: "Under review",
  CLOSED: "Closed",
};
