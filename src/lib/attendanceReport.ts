import "server-only";
import { prisma } from "./prisma";
import { opsWhere, type BranchScope } from "./scope";
import {
  reliabilityOf,
  flagShift,
  fmtMins,
  type AttendanceSettings,
} from "./reliability";
import { fmtInTz, tzForState } from "./timezone";

/**
 * The attendance picture: one row per worker, with the shifts behind it.
 *
 * Built in one place because the screen and the PDF must agree. A worker
 * being shown a score in a meeting will have the printout in front of them,
 * and the two disagreeing is the end of that conversation.
 */

export type AttendanceShift = {
  id: string;
  dateLabel: string;
  clientName: string;
  rostered: string;
  actual: string;
  startDelta: string;
  endDelta: string;
  lateStart: boolean;
  earlyFinish: boolean;
  stayedLate: boolean;
};

export type AttendanceRow = {
  id: string;
  name: string;
  branch: string;
  score: number;
  band: "GREEN" | "AMBER" | "RED";
  total: number;
  clean: number;
  lateStarts: number;
  earlyFinishes: number;
  stayedLate: number;
  lateNotices: number;
  avgLateLabel: string;
  lines: AttendanceShift[];
};

export async function loadAttendance(
  tenantId: string,
  scope: BranchScope,
  cfg: AttendanceSettings,
): Promise<AttendanceRow[]> {
  const staff = await prisma.staff.findMany({
    where: { tenantId, active: true, ...opsWhere(scope) },
    include: {
      branch: true,
      shifts: {
        where: { status: "COMPLETED" },
        select: {
          id: true,
          start: true,
          end: true,
          clockInAt: true,
          clockOutAt: true,
          client: { select: { firstName: true, lastName: true } },
        },
        orderBy: { start: "desc" },
      },
      _count: { select: { lateNotices: true } },
    },
    orderBy: { firstName: "asc" },
  });

  /** "6m late" / "on time" / "12m early" */
  const delta = (mins: number | null, lateWord: string, earlyWord: string) => {
    if (mins == null) return "-";
    if (mins > 0) return `${fmtMins(mins)} ${lateWord}`;
    if (mins < 0) return `${fmtMins(mins)} ${earlyWord}`;
    return "on time";
  };

  return staff
    .map((s) => {
      const tz = tzForState(s.branch?.state ?? null);
      const t = (d: Date | null) =>
        d ? fmtInTz(d, tz, { hour: "numeric", minute: "2-digit" }) : "-";
      const rating = reliabilityOf(s.shifts, s._count.lateNotices, cfg);

      return {
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        branch: s.branch?.name ?? "",
        score: rating.score,
        band: rating.band,
        total: rating.total,
        clean: rating.clean,
        lateStarts: rating.lateStarts,
        earlyFinishes: rating.earlyFinishes,
        stayedLate: rating.stayedLate,
        lateNotices: rating.lateNotices,
        avgLateLabel: rating.avgLateMin ? fmtMins(rating.avgLateMin) : "-",
        lines: s.shifts
          .filter((sh) => sh.clockInAt && sh.clockOutAt)
          .map((sh) => {
            const f = flagShift(sh, cfg);
            return {
              id: sh.id,
              dateLabel: fmtInTz(sh.start, tz, {
                weekday: "short",
                day: "numeric",
                month: "short",
              }),
              clientName: `${sh.client.firstName} ${sh.client.lastName}`,
              rostered: `${t(sh.start)} - ${t(sh.end)}`,
              actual: `${t(sh.clockInAt)} - ${t(sh.clockOutAt)}`,
              startDelta: delta(f.startDeltaMin, "late", "early"),
              endDelta: delta(f.endDeltaMin, "over", "early"),
              lateStart: f.lateStart,
              earlyFinish: f.earlyFinish,
              stayedLate: f.lateFinish && !f.lateStart,
            };
          }),
      };
    })
    .sort((a, b) => a.score - b.score); // worst first, the ones to talk about
}
