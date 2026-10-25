import "server-only";
import { prisma } from "./prisma";
import { netHoursOf, kmOf, paidWindowOf } from "./payroll";
import { buildPayReport } from "./payReport";
import { tzForState, fmtInTz } from "./timezone";

/**
 * Everything the export API hands over.
 *
 * Built in one place, and deliberately on the same functions the app itself
 * uses - netHoursOf, kmOf, buildPayReport - so what Omexx receives is the
 * number PCG sees on its own screens. A second implementation here would
 * drift, and a drift in paid hours is someone's wages.
 *
 * Two rules the whole file follows:
 *
 *   - Ids are the match key. Every row carries the id the record has had
 *     since it was created and will keep for life.
 *   - Times go out twice: the UTC instant for anything automated, and a local
 *     string in the branch's own timezone (NSW and Queensland differ half the
 *     year) for anything a person reads.
 */

/** Rows per page unless asked otherwise. */
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 5000;

/**
 * How far back `nextSince` reaches before the moment this answer was built.
 *
 * A pull that runs for a minute can have rows change underneath it. Rather
 * than pretend otherwise, the next window deliberately overlaps this one: the
 * far end matches on id, so seeing a row twice costs nothing, and missing one
 * costs a shift.
 */
const OVERLAP_MIN = 5;

export type ExportQuery = {
  since?: Date | null;
  from?: Date | null;
  to?: Date | null;
  limit: number;
  cursor?: string | null;
  branchId?: string | null;
};

export type ExportPage = {
  rows: Record<string, unknown>[];
  hasMore: boolean;
  nextCursor: string | null;
};

export function parseQuery(params: URLSearchParams): ExportQuery | { error: string } {
  const date = (name: string) => {
    const raw = params.get(name);
    if (!raw) return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return undefined;
    return d;
  };
  const since = date("since");
  const from = date("from");
  const to = date("to");
  for (const [name, v] of [["since", since], ["from", from], ["to", to]] as const) {
    if (v === undefined) {
      return { error: `${name} is not a date I can read. Use 2026-10-01 or a full ISO timestamp.` };
    }
  }

  const rawLimit = params.get("limit");
  let limit = DEFAULT_LIMIT;
  if (rawLimit) {
    const n = Number(rawLimit);
    if (!Number.isFinite(n) || n < 1) return { error: "limit must be a positive number." };
    limit = Math.min(Math.floor(n), MAX_LIMIT);
  }

  return {
    since: since ?? null,
    from: from ?? null,
    to: to ?? null,
    limit,
    cursor: params.get("cursor"),
    branchId: params.get("branch"),
  };
}

/** The `since` the caller should send next time, overlap included. */
export function nextSince(generatedAt: Date) {
  return new Date(generatedAt.getTime() - OVERLAP_MIN * 60_000).toISOString();
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : "");
const hrs = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 3_600_000;
const round = (n: number, dp = 2) => Number(n.toFixed(dp));

/** A readable local time in a branch's own zone, e.g. "22/10/2026 06:23". */
function localStamp(d: Date, tz: string) {
  return `${fmtInTz(d, tz, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })} ${fmtInTz(d, tz, { hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

/** Keyset paging on the id, which is stable and roughly time-ordered. */
function page<T extends { id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const kept = hasMore ? rows.slice(0, limit) : rows;
  return {
    kept,
    hasMore,
    nextCursor: hasMore ? (kept.at(-1)?.id ?? null) : null,
  };
}

function cursorWhere(cursor: string | null | undefined) {
  return cursor ? { id: { gt: cursor } } : {};
}

/**
 * Anything about a shift that may have changed since `since`.
 *
 * Breaks and trips are part of what a shift is worth but live in their own
 * rows, so a trip's distance being corrected a week later has to put the
 * shift back in the feed even though the shift row itself never moved.
 */
function changedSince(since: Date | null | undefined) {
  if (!since) return {};
  return {
    OR: [
      { updatedAt: { gt: since } },
      { pauses: { some: { updatedAt: { gt: since } } } },
      { transports: { some: { updatedAt: { gt: since } } } },
    ],
  };
}

function window(from: Date | null | undefined, to: Date | null | undefined) {
  if (!from && !to) return {};
  return {
    start: {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    },
  };
}

// ── 1. Shifts ───────────────────────────────────────────────────────────

export async function exportShifts(
  tenantId: string,
  q: ExportQuery,
): Promise<ExportPage> {
  const rows = await prisma.shift.findMany({
    where: {
      tenantId,
      ...(q.branchId ? { branchId: q.branchId } : {}),
      ...changedSince(q.since),
      ...window(q.from, q.to),
      ...cursorWhere(q.cursor),
    },
    include: {
      client: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          agreementType: true,
          ndisNumber: true,
        },
      },
      staff: { select: { id: true, firstName: true, lastName: true } },
      branch: { select: { name: true, state: true } },
      priceItem: { select: { code: true, name: true } },
      pauses: { select: { startAt: true, endAt: true } },
      transports: { select: { km: true } },
    },
    orderBy: { id: "asc" },
    take: q.limit + 1,
  });

  const { kept, hasMore, nextCursor } = page(rows, q.limit);

  return {
    hasMore,
    nextCursor,
    rows: kept.map((s) => {
      const tz = tzForState(s.branch?.state ?? null);
      const paid = paidWindowOf(s);
      const breakHours = s.pauses.reduce(
        (n, p) => (p.endAt ? n + hrs(p.startAt, p.endAt) : n),
        0,
      );
      return {
        shift_id: s.id,
        updated_at: iso(s.updatedAt),
        timezone: tz,
        date_local: fmtInTz(s.start, tz, {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }),
        rostered_start_local: localStamp(s.start, tz),
        rostered_end_local: localStamp(s.end, tz),
        rostered_start_utc: iso(s.start),
        rostered_end_utc: iso(s.end),
        clock_in_utc: iso(s.clockInAt),
        clock_out_utc: iso(s.clockOutAt),
        /** The office authorised pay past the rostered finish, up to here. */
        approved_end_utc: iso(s.approvedEnd),
        rostered_hours: round(hrs(s.start, s.end)),
        /** What reaches payroll: clocked time trimmed to the roster, less breaks. */
        paid_hours: round(netHoursOf(s), 4),
        /** What the worker was actually on site, breaks included. */
        clocked_hours:
          s.clockInAt && s.clockOutAt ? round(hrs(s.clockInAt, s.clockOutAt), 4) : 0,
        break_hours: round(breakHours, 4),
        paid_from_utc: iso(paid.from),
        paid_to_utc: iso(paid.to),
        worker_id: s.staffId ?? "",
        worker_name: s.staff ? `${s.staff.firstName} ${s.staff.lastName}` : "",
        participant_id: s.clientId,
        participant_name: `${s.client.firstName} ${s.client.lastName}`,
        ndis_number: s.client.ndisNumber ?? "",
        funding_type: s.client.agreementType,
        support_item_code: s.priceItem?.code ?? "",
        support_item_name: s.priceItem?.name ?? "",
        branch: s.branch?.name ?? "",
        state: s.branch?.state ?? "",
        status: s.status,
        approval: s.approval,
        publish_state: s.publishState,
        km: round(kmOf(s), 1),
        /** Clocked by scanning the card at the participant's home. */
        clocked_by_qr: s.clockInQr || s.clockOutQr,
        /** Set when the clock was taken with no signal and sent later. */
        offline_synced_at: iso(s.offlineSyncedAt),
        entered_by_office: !!s.manualEntryBy,
      };
    }),
  };
}

// ── 2. Shift notes ──────────────────────────────────────────────────────

export async function exportShiftNotes(
  tenantId: string,
  q: ExportQuery,
): Promise<ExportPage> {
  const rows = await prisma.shift.findMany({
    where: {
      tenantId,
      ...(q.branchId ? { branchId: q.branchId } : {}),
      ...window(q.from, q.to),
      ...cursorWhere(q.cursor),
      // Both conditions are OR-shaped, so they go in an AND rather than as
      // two `OR` keys in one object, where the second would silently replace
      // the first and quietly export every shift ever written.
      AND: [
        changedSince(q.since),
        { OR: [{ progressNote: { not: null } }, { handoverNote: { not: null } }] },
      ],
    },
    select: {
      id: true,
      updatedAt: true,
      start: true,
      clientId: true,
      staffId: true,
      progressNote: true,
      progressNoteEditedAt: true,
      handoverNote: true,
      handoverAckAt: true,
      client: { select: { firstName: true, lastName: true } },
      staff: { select: { firstName: true, lastName: true } },
      branch: { select: { state: true } },
      tasks: { select: { title: true, completedAt: true } },
    },
    orderBy: { id: "asc" },
    take: q.limit + 1,
  });

  const { kept, hasMore, nextCursor } = page(rows, q.limit);

  return {
    hasMore,
    nextCursor,
    rows: kept.map((s) => {
      const tz = tzForState(s.branch?.state ?? null);
      return {
        shift_id: s.id,
        updated_at: iso(s.updatedAt),
        date_local: fmtInTz(s.start, tz, {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }),
        shift_start_utc: iso(s.start),
        worker_id: s.staffId ?? "",
        worker_name: s.staff ? `${s.staff.firstName} ${s.staff.lastName}` : "",
        participant_id: s.clientId,
        participant_name: `${s.client.firstName} ${s.client.lastName}`,
        note: s.progressNote ?? "",
        /** The worker changed the note after first submitting it. */
        note_edited_at: iso(s.progressNoteEditedAt),
        handover_note: s.handoverNote ?? "",
        handover_acknowledged_at: iso(s.handoverAckAt),
        tasks_total: s.tasks.length,
        tasks_done: s.tasks.filter((t) => t.completedAt).length,
      };
    }),
  };
}

// ── 3. Timesheets: approved hours per worker for a period ───────────────

export async function exportTimesheets(
  tenantId: string,
  q: ExportQuery,
): Promise<ExportPage> {
  if (!q.from || !q.to) {
    throw new BadRequest("timesheets needs from and to, e.g. ?from=2026-10-01&to=2026-10-15");
  }

  const shifts = await prisma.shift.findMany({
    where: {
      tenantId,
      ...(q.branchId ? { branchId: q.branchId } : {}),
      approval: "APPROVED",
      staffId: { not: null },
      start: { gte: q.from, lte: q.to },
    },
    select: {
      staffId: true,
      start: true,
      end: true,
      clockInAt: true,
      clockOutAt: true,
      approvedEnd: true,
      mileageKm: true,
      pauses: { select: { startAt: true, endAt: true } },
      transports: { select: { km: true } },
      client: { select: { agreementType: true } },
      staff: { select: { firstName: true, lastName: true } },
      branch: { select: { name: true } },
    },
  });

  const per = new Map<
    string,
    { name: string; branch: string; shifts: number; hours: number; km: number }
  >();
  for (const s of shifts) {
    const key = s.staffId!;
    const cur = per.get(key) ?? {
      name: s.staff ? `${s.staff.firstName} ${s.staff.lastName}` : "",
      branch: s.branch?.name ?? "",
      shifts: 0,
      hours: 0,
      km: 0,
    };
    cur.shifts += 1;
    cur.hours += netHoursOf(s);
    cur.km += kmOf(s);
    per.set(key, cur);
  }

  // `id` is the worker's id, carried so the shared pager can do its job, and
  // dropped from the row itself because it is already there as worker_id.
  const rows = [...per.entries()]
    .map(([id, w]) => ({
      id,
      row: {
        worker_id: id,
        worker_name: w.name,
        branch: w.branch,
        period_start: iso(q.from),
        period_end: iso(q.to),
        approved_shifts: w.shifts,
        approved_hours: round(w.hours, 4),
        km: round(w.km, 1),
      },
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // Small by nature - one row per worker - but paged like the rest so the
  // caller never has to treat one endpoint differently.
  const after = q.cursor ? rows.filter((r) => r.id > q.cursor!) : rows;
  const { kept, hasMore, nextCursor } = page(after, q.limit);
  return { hasMore, nextCursor, rows: kept.map((k) => k.row) };
}

// ── 4. Payroll: the Xero-facing lines ───────────────────────────────────

export async function exportPayroll(
  tenantId: string,
  q: ExportQuery,
): Promise<ExportPage> {
  if (!q.from || !q.to) {
    throw new BadRequest("payroll needs from and to, e.g. ?from=2026-10-01&to=2026-10-15");
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { superRate: true },
  });
  const superRate = tenant?.superRate ?? 0;

  const branches = await prisma.branch.findMany({
    where: { tenantId, ...(q.branchId ? { id: q.branchId } : {}) },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const rows: Record<string, unknown>[] = [];
  for (const b of branches) {
    // Costed branch by branch, which is how PCG runs its pay: each branch has
    // its own timezone and its own state's public holidays.
    const report = await buildPayReport(tenantId, {
      startDate: q.from,
      endDate: q.to,
      branchId: b.id,
    });

    for (const w of report.rows) {
      const earnings = new Map<string, { hours: number; rate: number }>();
      for (const line of w.lines) {
        const key = `${line.dayType}|${line.stream}|${line.rate}`;
        const cur = earnings.get(key) ?? { hours: 0, rate: line.rate };
        cur.hours += line.hours;
        earnings.set(key, cur);
      }

      for (const [key, e] of earnings) {
        const [band, stream] = key.split("|");
        rows.push({
          worker_id: w.staffId,
          worker_name: w.name,
          branch: b.name,
          period_start: iso(q.from),
          period_end: iso(q.to),
          pay_level: w.level,
          employment_type: w.employment,
          earnings_rate: `${band} (${stream})`,
          day_type: band,
          funding_stream: stream,
          // Four decimals on purpose: rounding them changes the total.
          units: round(e.hours, 4),
          unit: "HOURS",
          rate: round(e.rate, 2),
          amount_aud: round(e.hours * e.rate, 2),
        });
      }

      if (w.km > 0) {
        rows.push({
          worker_id: w.staffId,
          worker_name: w.name,
          branch: b.name,
          period_start: iso(q.from),
          period_end: iso(q.to),
          pay_level: w.level,
          employment_type: w.employment,
          earnings_rate: "MILEAGE_KM",
          day_type: "",
          funding_stream: "",
          units: round(w.km, 2),
          unit: "KM",
          rate: null,
          amount_aud: round(w.kmPay, 2),
        });
      }

      // Superannuation on wages only. Mileage is an allowance, not a wage.
      rows.push({
        worker_id: w.staffId,
        worker_name: w.name,
        branch: b.name,
        period_start: iso(q.from),
        period_end: iso(q.to),
        pay_level: w.level,
        employment_type: w.employment,
        earnings_rate: `SUPER_${(superRate * 100).toFixed(0)}PC_ON_WAGES`,
        day_type: "",
        funding_stream: "",
        units: null,
        unit: "",
        rate: null,
        amount_aud: round(w.wagePay * superRate, 2),
      });
    }
  }

  // One period's pay is a few hundred lines at most, so it goes in one answer.
  return { rows, hasMore: false, nextCursor: null };
}

// ── 5. Staff ────────────────────────────────────────────────────────────

export async function exportStaff(
  tenantId: string,
  q: ExportQuery,
): Promise<ExportPage> {
  const rows = await prisma.staff.findMany({
    where: {
      tenantId,
      ...(q.since ? { updatedAt: { gt: q.since } } : {}),
      ...cursorWhere(q.cursor),
    },
    include: {
      payLevel: { select: { name: true } },
      branch: { select: { name: true, state: true } },
      user: { select: { email: true, role: true, status: true } },
    },
    orderBy: { id: "asc" },
    take: q.limit + 1,
  });

  const { kept, hasMore, nextCursor } = page(rows, q.limit);
  return {
    hasMore,
    nextCursor,
    rows: kept.map((s) => ({
      employee_id: s.id,
      updated_at: iso(s.updatedAt),
      first_name: s.firstName,
      last_name: s.lastName,
      email: s.email ?? s.user?.email ?? "",
      phone: s.phone ?? "",
      title: s.title ?? "",
      pay_level: s.payLevel?.name ?? "",
      employment_type: s.employmentType,
      branch: s.branch?.name ?? "",
      state: s.branch?.state ?? "",
      clearance_type: s.clearanceType ?? "",
      clearance_expiry: iso(s.clearanceExpiry),
      active: s.active,
      account_status: s.user?.status ?? "",
    })),
  };
}

// ── 6. Participants ─────────────────────────────────────────────────────

export async function exportParticipants(
  tenantId: string,
  q: ExportQuery,
): Promise<ExportPage> {
  const rows = await prisma.client.findMany({
    where: {
      tenantId,
      ...(q.since ? { updatedAt: { gt: q.since } } : {}),
      ...cursorWhere(q.cursor),
    },
    include: { branch: { select: { name: true, state: true } } },
    orderBy: { id: "asc" },
    take: q.limit + 1,
  });

  const { kept, hasMore, nextCursor } = page(rows, q.limit);
  return {
    hasMore,
    nextCursor,
    rows: kept.map((c) => ({
      participant_id: c.id,
      updated_at: iso(c.updatedAt),
      first_name: c.firstName,
      last_name: c.lastName,
      ndis_number: c.ndisNumber ?? "",
      funding_type: c.agreementType,
      address: c.address ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
      plan_start: iso(c.planStart),
      plan_end: iso(c.planEnd),
      budget: c.budget ?? null,
      /** Agreed support hours a week from their service agreement. */
      weekly_hours: c.weeklyHours ?? null,
      branch: c.branch?.name ?? "",
      state: c.branch?.state ?? "",
      active: c.active,
    })),
  };
}

// ── 7. Deletions ────────────────────────────────────────────────────────

export async function exportDeletions(
  tenantId: string,
  q: ExportQuery,
): Promise<ExportPage> {
  const rows = await prisma.deletedRecord.findMany({
    where: {
      tenantId,
      ...(q.since ? { deletedAt: { gt: q.since } } : {}),
      ...cursorWhere(q.cursor),
    },
    orderBy: { id: "asc" },
    take: q.limit + 1,
  });

  const { kept, hasMore, nextCursor } = page(rows, q.limit);
  return {
    hasMore,
    nextCursor,
    rows: kept.map((d) => ({
      kind: d.kind,
      record_id: d.recordId,
      parent_id: d.parentId ?? "",
      deleted_at: iso(d.deletedAt),
    })),
  };
}

/** Thrown when the caller asked for something that cannot be answered. */
export class BadRequest extends Error {}

export const DATASETS = {
  shifts: exportShifts,
  "shift-notes": exportShiftNotes,
  timesheets: exportTimesheets,
  payroll: exportPayroll,
  staff: exportStaff,
  participants: exportParticipants,
  deletions: exportDeletions,
} as const;

export type DatasetName = keyof typeof DATASETS;
