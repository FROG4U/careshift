import "server-only";
import { prisma } from "./prisma";
import { dayTypeFor, type RateGrid } from "./payroll";
import { STAFF_STREAMS } from "./constants";
import { DUTY_KINDS, DUTY_LABELS, type DutyKind } from "./dutyTypes";

export { DUTY_KINDS, DUTY_LABELS };
export type { DutyKind };

/**
 * Meetings, supervisions and training: the paid work that is not a
 * participant visit.
 *
 * Kept apart from shifts everywhere except the pay run, which is the one
 * place they have to meet - the hours are the worker's hours whatever the
 * reason for them.
 */

/** Scheduled length, or the office's override. */
export function dutyHours(
  a: { hours: number | null },
  duty: { start: Date; end: Date },
): number {
  if (a.hours != null && a.hours > 0) return a.hours;
  return Math.max(0, (duty.end.getTime() - duty.start.getTime()) / 3600000);
}

/**
 * Which column of the rate grid pays a meeting.
 *
 * Internal work is not funded by a participant, so there is no agreement to
 * read a stream from. The worker is simply on their ordinary rate for that
 * day, so take the funding they usually work under and fall back to whatever
 * they do have a rate for - never zero because nobody set a Cleaning rate.
 */
export function internalStream(grid: RateGrid, dayType: string): string {
  const preferred = ["NDIS", "AGED_CARE", "DVA", "CLEANING"];
  for (const stream of preferred) {
    if ((grid[`${stream}_${dayType}`] ?? 0) > 0) return stream;
  }
  return STAFF_STREAMS[0];
}

export type DutyPayLine = {
  dutyId: string;
  staffId: string;
  title: string;
  kind: string;
  start: Date;
  end: Date;
  hours: number;
  branchState: string | null;
};

/**
 * Approved duties in a pay window, for the workers in scope.
 *
 * Only APPROVED attendance is paid - the same rule as a timesheet, so an
 * invitation someone accepted and then missed never reaches a pay run.
 */
export async function payableDuties(
  tenantId: string,
  window: { gte: Date; lte: Date },
  opts: { branchId?: string | null; staffId?: string | null } = {},
): Promise<DutyPayLine[]> {
  const rows = await prisma.dutyAttendee.findMany({
    where: {
      tenantId,
      approval: "APPROVED",
      ...(opts.staffId ? { staffId: opts.staffId } : {}),
      duty: {
        start: window,
        ...(opts.branchId ? { branchId: opts.branchId } : {}),
      },
    },
    include: {
      duty: { include: { branch: { select: { state: true } } } },
      staff: { select: { id: true } },
    },
  });

  return rows.map((r) => ({
    dutyId: r.dutyId,
    staffId: r.staffId,
    title: r.duty.title,
    kind: r.duty.kind,
    start: r.duty.start,
    end: r.duty.end,
    hours: dutyHours(r, r.duty),
    branchState: r.duty.branch?.state ?? null,
  }));
}

/** Re-exported so callers do not have to reach into lib/payroll for it. */
export { dayTypeFor };
