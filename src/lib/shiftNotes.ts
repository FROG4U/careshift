import "server-only";
import { prisma } from "./prisma";
import { netHoursOf } from "./payroll";
import { fmtInTz, tzForState } from "./timezone";

/**
 * The shift notes record: one query, used by the on-screen document and by
 * the PDF download.
 *
 * Kept in one place because the two must never disagree - a provider hands
 * this to a plan manager or an auditor, and "the screen said something else"
 * is not an answer.
 */

export type NotesFilters = {
  q?: string;
  from?: string;
  to?: string;
  month?: string;
  client?: string;
  staff?: string;
};

export type NoteRow = {
  id: string;
  dateLabel: string;
  timeLabel: string;
  clientName: string;
  ndisNumber: string | null;
  workerName: string;
  hours: number;
  note: string;
  handover: string | null;
  handoverAck: boolean;
  tasks: { title: string; done: boolean }[];
};

export type NotesDoc = {
  rows: NoteRow[];
  rangeText: string;
  clientLabel: string;
  workerLabel: string;
  totalHours: number;
  withNotes: number;
};

/** A month wins over from/to, the same way the Timesheets filters behave. */
function windowOf(f: NotesFilters) {
  let start: Date | undefined;
  let end: Date | undefined;
  if (f.month && /^\d{4}-\d{2}$/.test(f.month)) {
    const [y, m] = f.month.split("-").map(Number);
    start = new Date(y, m - 1, 1);
    end = new Date(y, m, 1);
  } else {
    if (f.from) start = new Date(`${f.from}T00:00:00`);
    if (f.to) {
      end = new Date(`${f.to}T00:00:00`);
      end.setDate(end.getDate() + 1);
    }
  }
  return { start, end };
}

export async function loadShiftNotes(
  tenantId: string,
  f: NotesFilters,
): Promise<NotesDoc> {
  const { start, end } = windowOf(f);
  const query = (f.q ?? "").trim().toLowerCase();

  const [rows, clientRow, staffRow] = await Promise.all([
    prisma.shift.findMany({
      where: {
        tenantId,
        status: "COMPLETED",
        ...(f.client ? { clientId: f.client } : {}),
        ...(f.staff ? { staffId: f.staff } : {}),
        ...(start || end
          ? {
              start: {
                ...(start ? { gte: start } : {}),
                ...(end ? { lt: end } : {}),
              },
            }
          : {}),
      },
      include: {
        client: true,
        staff: true,
        pauses: true,
        branch: { select: { state: true } },
        tasks: { orderBy: [{ dueTime: "asc" }, { sortOrder: "asc" }] },
      },
      orderBy: { start: "asc" },
    }),
    f.client
      ? prisma.client.findFirst({
          where: { id: f.client, tenantId },
          select: { firstName: true, lastName: true, ndisNumber: true },
        })
      : Promise.resolve(null),
    f.staff
      ? prisma.staff.findFirst({
          where: { id: f.staff, tenantId },
          select: { firstName: true, lastName: true },
        })
      : Promise.resolve(null),
  ]);

  const shifts = query
    ? rows.filter((s) =>
        `${s.staff?.firstName ?? ""} ${s.staff?.lastName ?? ""} ${s.client.firstName} ${s.client.lastName}`
          .toLowerCase()
          .includes(query),
      )
    : rows;

  const d = (x: Date) =>
    new Intl.DateTimeFormat("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(x);

  const rangeText = (() => {
    if (f.month && start) {
      return new Intl.DateTimeFormat("en-AU", {
        month: "long",
        year: "numeric",
      }).format(start);
    }
    if (start && end) {
      const last = new Date(end);
      last.setDate(last.getDate() - 1);
      return `${d(start)} - ${d(last)}`;
    }
    if (start) return `From ${d(start)}`;
    if (end) {
      const last = new Date(end);
      last.setDate(last.getDate() - 1);
      return `Up to ${d(last)}`;
    }
    return "All dates";
  })();

  return {
    rows: shifts.map((s) => {
      const tz = tzForState(s.branch?.state ?? null);
      const t = (x: Date) =>
        fmtInTz(x, tz, { hour: "numeric", minute: "2-digit" });
      return {
        id: s.id,
        dateLabel: fmtInTz(s.start, tz, {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
        timeLabel: `${t(s.start)} - ${t(s.end)}`,
        clientName: `${s.client.firstName} ${s.client.lastName}`,
        ndisNumber: s.client.ndisNumber ?? null,
        workerName: s.staff
          ? `${s.staff.firstName} ${s.staff.lastName}`
          : "Unassigned",
        hours: netHoursOf(s),
        note: s.progressNote?.trim() ?? "",
        handover: s.handoverNote?.trim() || null,
        handoverAck: !!s.handoverAckAt,
        tasks: s.tasks.map((t2) => ({ title: t2.title, done: !!t2.completedAt })),
      };
    }),
    rangeText,
    clientLabel: clientRow
      ? `${clientRow.firstName} ${clientRow.lastName}${clientRow.ndisNumber ? ` (${clientRow.ndisNumber})` : ""}`
      : "All participants",
    workerLabel: staffRow
      ? `${staffRow.firstName} ${staffRow.lastName}`
      : "All workers",
    totalHours: shifts.reduce((n, s) => n + netHoursOf(s), 0),
    withNotes: shifts.filter((s) => s.progressNote?.trim()).length,
  };
}
