import { prisma } from "./prisma";

const DAY = 86_400_000;

export const LEAVE_TYPES = ["ANNUAL", "SICK", "OTHER"] as const;
export const LEAVE_LABELS: Record<string, string> = {
  ANNUAL: "Annual leave",
  SICK: "Sick leave",
  OTHER: "Other / unpaid",
};

/** How many days an availability spans (inclusive; a day+time counts as 1). */
export function daysOf(a: {
  startDate: Date;
  endDate: Date;
}): number {
  const s = new Date(a.startDate);
  s.setHours(0, 0, 0, 0);
  const e = new Date(a.endDate);
  e.setHours(0, 0, 0, 0);
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / DAY) + 1);
}

export type LeaveBalance = { annualTaken: number; sickTaken: number };

/** Approved leave days taken this calendar year, split by type. */
export async function leaveTaken(
  tenantId: string,
  staffId: string,
  year: number,
): Promise<LeaveBalance> {
  const jan1 = new Date(year, 0, 1);
  const dec31 = new Date(year, 11, 31, 23, 59, 59);
  const rows = await prisma.availability.findMany({
    where: {
      tenantId,
      staffId,
      status: "APPROVED",
      startDate: { gte: jan1, lte: dec31 },
    },
    select: { startDate: true, endDate: true, leaveType: true },
  });
  let annualTaken = 0;
  let sickTaken = 0;
  for (const r of rows) {
    const d = daysOf(r);
    if (r.leaveType === "SICK") sickTaken += d;
    else if (r.leaveType === "ANNUAL") annualTaken += d;
  }
  return { annualTaken, sickTaken };
}
