import { prisma } from "./prisma";

/** Hours a worker has to fill their shift notes before the shift is withheld
 *  from payroll and they're blocked from starting new shifts. */
export const NOTES_WINDOW_H = 24;

export type NoteDue = {
  shiftId: string;
  client: string;
  clockOutIso: string | null;
  overdue: boolean;
};

/** Completed shifts belonging to this worker that still have no progress note. */
export async function notesDueFor(
  tenantId: string,
  staffId: string,
): Promise<NoteDue[]> {
  const shifts = await prisma.shift.findMany({
    where: {
      tenantId,
      staffId,
      status: "COMPLETED",
      OR: [{ progressNote: null }, { progressNote: "" }],
    },
    include: { client: { select: { firstName: true, lastName: true } } },
    orderBy: { clockOutAt: "asc" },
  });

  const now = Date.now();
  return shifts.map((s) => {
    const base = s.clockOutAt ?? s.end;
    const hoursSince = (now - new Date(base).getTime()) / 3_600_000;
    return {
      shiftId: s.id,
      client: `${s.client.firstName} ${s.client.lastName}`,
      clockOutIso: (s.clockOutAt ?? s.end).toISOString(),
      overdue: hoursSince >= NOTES_WINDOW_H,
    };
  });
}

export function hasOverdueNotes(dues: NoteDue[]) {
  return dues.some((d) => d.overdue);
}
