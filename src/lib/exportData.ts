import "server-only";
import { prisma } from "./prisma";
import { netHoursOf, kmOf, paidWindowOf } from "./payroll";
import type { FrozenDetail } from "./payReportTypes";
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
  /** One specific pay run, by its id. */
  payRunId?: string | null;
  /** "rate" (one line per earnings rate) or "shift". */
  level?: string | null;
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

  const level = params.get("level");
  if (level && level !== "rate" && level !== "shift") {
    return { error: 'level must be "rate" or "shift".' };
  }

  return {
    since: since ?? null,
    from: from ?? null,
    to: to ?? null,
    limit,
    cursor: params.get("cursor"),
    branchId: params.get("branch"),
    payRunId: params.get("payRun"),
    level,
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

// ── 4. Pay runs and their lines ─────────────────────────────────────────

/**
 * A completed pay run is FROZEN: the figures are written down at the moment
 * the office completes it, and never recalculated. That is the whole point -
 * editing a shift next month must not quietly change a figure that has
 * already been paid and filed with the tax office.
 *
 * So the export sends what was paid, not what a fresh calculation says today.
 * A run still in draft is deliberately left out: it has no final figures yet,
 * and importing numbers that are about to move is worse than waiting.
 */
export async function exportPayRuns(
  tenantId: string,
  q: ExportQuery,
): Promise<ExportPage> {
  const superRate = await superRateOf(tenantId);

  const runs = await prisma.payrollPeriod.findMany({
    where: {
      tenantId,
      ...(q.branchId ? { branchId: q.branchId } : {}),
      ...(q.since ? { updatedAt: { gt: q.since } } : {}),
      // A run overlapping the asked-for window, not one wholly inside it: a
      // fortnight that straddles the end of a month still belongs to it.
      ...(q.from ? { endDate: { gte: q.from } } : {}),
      ...(q.to ? { startDate: { lte: q.to } } : {}),
      ...cursorWhere(q.cursor),
    },
    include: {
      branch: { select: { name: true, state: true } },
      lines: {
        select: { hours: true, km: true, wagePay: true, kmPay: true, total: true },
      },
    },
    orderBy: { id: "asc" },
    take: q.limit + 1,
  });

  const { kept, hasMore, nextCursor } = page(runs, q.limit);
  return {
    hasMore,
    nextCursor,
    rows: kept.map((r) => {
      const sum = (pick: (l: (typeof r.lines)[number]) => number) =>
        r.lines.reduce((n, l) => n + pick(l), 0);
      const wagePay = sum((l) => l.wagePay);
      return {
        pay_run_id: r.id,
        updated_at: iso(r.updatedAt),
        branch: r.branch?.name ?? "",
        state: r.branch?.state ?? "",
        period_start: iso(r.startDate),
        period_end: iso(r.endDate),
        /** DRAFT until the office completes it; APPROVED once it is final. */
        status: r.status,
        /** Only an APPROVED run has figures that will not move. */
        is_final: r.status === "APPROVED",
        completed_by: r.approvedBy ?? "",
        completed_at: iso(r.approvedAt),
        workers: r.lines.length,
        hours: round(sum((l) => l.hours), 4),
        km: round(sum((l) => l.km), 2),
        wage_pay_aud: round(wagePay, 2),
        mileage_pay_aud: round(sum((l) => l.kmPay), 2),
        total_pay_aud: round(sum((l) => l.total), 2),
        /** On wages only. Mileage is an allowance, not a wage. */
        super_aud: round(wagePay * superRate, 2),
        super_rate: superRate,
      };
    }),
  };
}

async function superRateOf(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { superRate: true },
  });
  return tenant?.superRate ?? 0;
}

/**
 * The lines of completed pay runs: what each worker was actually paid.
 *
 * `level=rate` (the default) is the shape a payroll system wants - one line
 * per worker per earnings rate, which is how it goes into Xero. `level=shift`
 * is the same money broken down by the shift that earned it, which is what
 * answers "why is this total what it is".
 */
export async function exportPayroll(
  tenantId: string,
  q: ExportQuery,
): Promise<ExportPage> {
  const superRate = await superRateOf(tenantId);
  const byShift = q.level === "shift";

  const runs = await prisma.payrollPeriod.findMany({
    where: {
      tenantId,
      // Frozen runs only. See the note on exportPayRuns.
      status: "APPROVED",
      ...(q.payRunId ? { id: q.payRunId } : {}),
      ...(q.branchId ? { branchId: q.branchId } : {}),
      ...(q.since ? { updatedAt: { gt: q.since } } : {}),
      ...(q.from ? { endDate: { gte: q.from } } : {}),
      ...(q.to ? { startDate: { lte: q.to } } : {}),
      ...cursorWhere(q.cursor),
    },
    include: {
      branch: { select: { name: true } },
      lines: { orderBy: { name: "asc" } },
    },
    orderBy: { id: "asc" },
    take: q.limit + 1,
  });

  const { kept, hasMore, nextCursor } = page(runs, q.limit);
  const rows: Record<string, unknown>[] = [];

  for (const run of kept) {
    const header = {
      pay_run_id: run.id,
      branch: run.branch?.name ?? "",
      period_start: iso(run.startDate),
      period_end: iso(run.endDate),
      completed_at: iso(run.approvedAt),
    };

    for (const line of run.lines) {
      const detail = parseDetail(line.detail);

      if (byShift) {
        for (const d of detail) {
          rows.push({
            ...header,
            worker_id: line.staffId ?? "",
            worker_name: line.name,
            /** The shift that earned it, where the run recorded one. */
            shift_id: d.ref && !d.ref.startsWith("duty-") ? d.ref : "",
            /** A meeting, supervision or training rather than a visit. */
            internal: !!d.internal,
            worked_for: d.client,
            shift_start_utc: d.startIso ?? "",
            shift_end_utc: d.endIso ?? "",
            date_label: d.date,
            time_label: d.time,
            day_type: d.band,
            funding_stream: d.stream ?? "",
            public_holiday: d.holiday ?? "",
            hours: round(d.hours, 4),
            /** Of those hours, ones added to reach the 2 hour minimum. */
            top_up_hours: d.topUpHours ? round(d.topUpHours, 4) : 0,
            /** Of those hours, ones past the rostered finish the office authorised. */
            extra_hours: d.extraHours ? round(d.extraHours, 4) : 0,
            rate: round(d.rate, 2),
            // Split out deliberately. The frozen `pay` figure is wages PLUS
            // mileage, so a column next to mileage_pay_aud that quietly
            // included it would be added twice by anyone summing them.
            wage_pay_aud: round(d.hours * d.rate, 2),
            km: round(d.km, 2),
            mileage_pay_aud: round(d.kmPay, 2),
            total_pay_aud: round(d.pay, 2),
          });
        }
        continue;
      }

      // One line per earnings rate: the band AND the rate, because a worker
      // on two fundings has two different rates in the same band and merging
      // them misstates the money.
      const earnings = new Map<string, { hours: number; rate: number }>();
      for (const d of detail) {
        const key = `${d.band}|${d.stream ?? ""}|${d.rate}`;
        const cur = earnings.get(key) ?? { hours: 0, rate: d.rate };
        cur.hours += d.hours;
        earnings.set(key, cur);
      }

      // An older run with no frozen detail still has its totals, so it goes
      // out as a single wages line rather than disappearing.
      if (earnings.size === 0 && line.wagePay > 0) {
        earnings.set(`WAGES||0`, { hours: line.hours, rate: 0 });
      }

      for (const [key, e] of earnings) {
        const [band, stream] = key.split("|");
        rows.push({
          ...header,
          worker_id: line.staffId ?? "",
          worker_name: line.name,
          pay_item: stream ? `${band} (${stream})` : band,
          day_type: band,
          funding_stream: stream,
          // Four decimals on purpose: rounding them changes the total.
          units: round(e.hours, 4),
          unit: "HOURS",
          rate: e.rate > 0 ? round(e.rate, 2) : null,
          amount_aud: round(e.hours * e.rate, 2),
        });
      }

      if (line.km > 0) {
        rows.push({
          ...header,
          worker_id: line.staffId ?? "",
          worker_name: line.name,
          pay_item: "MILEAGE_KM",
          day_type: "",
          funding_stream: "",
          units: round(line.km, 2),
          unit: "KM",
          rate: null,
          amount_aud: round(line.kmPay, 2),
        });
      }

      rows.push({
        ...header,
        worker_id: line.staffId ?? "",
        worker_name: line.name,
        pay_item: `SUPER_${(superRate * 100).toFixed(0)}PC_ON_WAGES`,
        day_type: "",
        funding_stream: "",
        units: null,
        unit: "",
        rate: null,
        amount_aud: round(line.wagePay * superRate, 2),
      });
    }
  }

  return { rows, hasMore, nextCursor };
}

/** The frozen per-shift breakdown, or nothing if the run predates it. */
function parseDetail(raw: string | null): FrozenDetail[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FrozenDetail[]) : [];
  } catch {
    return [];
  }
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
  "pay-runs": exportPayRuns,
  payroll: exportPayroll,
  staff: exportStaff,
  participants: exportParticipants,
  deletions: exportDeletions,
} as const;

export type DatasetName = keyof typeof DATASETS;
