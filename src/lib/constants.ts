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
