// Worker award pay levels seeded from the Fair Work SCHADS pay guide
// (Social & Community Services stream, full-time/permanent ordinary rates,
// effective from the first full pay period on/after 1 July 2025).
//
// Each level stores a single weekday BASE rate. The grid is expanded with
// DAY_TYPE_MULTIPLIER for PERMANENT staff (base × multiplier). CASUAL staff
// use the award's ADDITIVE method — base × (multiplier + casual loading) —
// which reproduces the Fair Work casual table exactly.
//
// NDIS / DVA / Aged Care all use the SACS rate for now (Aged Care should later
// use the separate Home Care employee stream). Cleaning is a placeholder — it
// is not an official SCHADS classification; verify against the relevant award.

export type AwardSeedLevel = {
  name: string;
  award: string;
  mileageRate: number;
  base: number; // weekday SACS base ($/hr)
};

const MILEAGE = 0.99; // $/km — SCHADS vehicle allowance benchmark

// Permanent weekday base = official casual hourly ÷ 1.25 (1 Jul 2025 pay guide).
export const AWARD_SEED_LEVELS: AwardSeedLevel[] = [
  { name: "SCHADS L1.1", award: "SCHADS (SACS)", mileageRate: MILEAGE, base: 26.30 },
  { name: "SCHADS L2.1", award: "SCHADS (SACS)", mileageRate: MILEAGE, base: 34.58 },
  { name: "SCHADS L2.2", award: "SCHADS (SACS)", mileageRate: MILEAGE, base: 35.67 },
  { name: "SCHADS L2.3", award: "SCHADS (SACS)", mileageRate: MILEAGE, base: 36.75 },
  { name: "SCHADS L3.1", award: "SCHADS (SACS)", mileageRate: MILEAGE, base: 38.65 },
  { name: "SCHADS L3.2", award: "SCHADS (SACS)", mileageRate: MILEAGE, base: 39.77 },
  { name: "SCHADS L4.1", award: "SCHADS (SACS)", mileageRate: MILEAGE, base: 44.58 },
  { name: "SCHADS L5.1", award: "SCHADS (SACS)", mileageRate: MILEAGE, base: 51.00 },
];

/** Weekday base for a stream. NDIS/DVA/Aged Care use SACS; Cleaning placeholder. */
export function seedBase(level: AwardSeedLevel, _stream: string): number {
  return level.base;
}
