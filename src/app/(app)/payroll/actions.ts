"use server";

import { revalidatePath } from "next/cache";
import { requireScope } from "@/lib/tenant";
import { canOps, payrollBranchIds, type BranchScope } from "@/lib/scope";
import { prisma } from "@/lib/prisma";
import { isManager } from "@/lib/roles";
import { fmtDate } from "@/lib/format";
import { notifyWorker } from "@/lib/notify";
import { buildPayReport } from "@/lib/payReport";
import { isDayShifted } from "@/lib/dayShift";
import { findShortTrips } from "@/lib/tripRepair";
import { tzForState, zonedTimeToUtc } from "@/lib/timezone";

const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();

/**
 * Payroll is manager-only - workers must never reach these actions - and a
 * branch-restricted manager only handles the branches they look after
 * ("Shifts & people", see lib/scope).
 */
async function requireManager() {
  const ctx = await requireScope();
  if (!isManager(ctx.session.role)) {
    throw new Error("Not authorised");
  }
  if (!ctx.scope.all && ctx.scope.ops.length === 0) {
    throw new Error("Not authorised");
  }
  return ctx;
}

/** A run this account may act on: its branch is one they look after. */
function mayHandle(scope: BranchScope, branchId: string | null) {
  return canOps(scope, branchId);
}

export type CreateRunResult = { error?: string; created?: number; skipped?: string[] };

/**
 * Create pay runs for a date range.
 *
 * `scope` is a branch id, or "all" for one run per branch over the same dates.
 * Branches keep separate runs rather than sharing one: each is costed in its
 * own state's timezone and public holidays, and they are completed together
 * from the All branches view.
 *
 * Dates are read in each branch's local time. `new Date("2026-10-10T00:00")`
 * resolves against the server's zone, which puts a Sydney run's boundary an
 * hour out once NSW is on daylight saving - moving a shift that starts just
 * after midnight into the wrong pay run.
 */
export async function createPayrollPeriod(formData: FormData): Promise<CreateRunResult> {
  const { tenant, scope: access } = await requireManager();
  const from = str(formData.get("from"));
  const to = str(formData.get("to"));
  const scope = str(formData.get("scope"));
  if (!from || !to) return { error: "Choose both dates." };
  if (to < from) return { error: "The end date must be on or after the start date." };

  const allowed = payrollBranchIds(access);
  const branches = await prisma.branch.findMany({
    where: { tenantId: tenant.id, ...(allowed ? { id: { in: allowed } } : {}) },
    select: { id: true, name: true, state: true },
    orderBy: { createdAt: "asc" },
  });
  const targets = scope === "all" ? branches : branches.filter((b) => b.id === scope);
  if (targets.length === 0) return { error: "Choose a branch first." };

  let created = 0;
  const skipped: string[] = [];
  for (const b of targets) {
    const tz = tzForState(b.state);
    const startDate = zonedTimeToUtc(from, "00:00", tz);
    const lastMinute = zonedTimeToUtc(to, "23:59", tz);
    if (!startDate || !lastMinute) return { error: "Check the dates." };
    const endDate = new Date(lastMinute.getTime() + 59_999);

    // Two runs for one branch over the same days would pay those shifts
    // twice, so refuse rather than quietly create a second.
    const clash = await prisma.payrollPeriod.findFirst({
      where: {
        tenantId: tenant.id,
        branchId: b.id,
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      select: { startDate: true, endDate: true },
    });
    if (clash) {
      skipped.push(
        `${b.name} already has a run for ${fmtDate(clash.startDate)} - ${fmtDate(clash.endDate)}`,
      );
      continue;
    }

    await prisma.payrollPeriod.create({
      data: { tenantId: tenant.id, branchId: b.id, startDate, endDate },
    });
    created += 1;
  }

  revalidatePath("/payroll");
  if (created === 0) return { error: `${skipped.join(". ")}.`, skipped };
  return { created, skipped };
}

type RunResult = { ok: boolean; message?: string };

async function completeOne(
  tenantId: string,
  approvedBy: string,
  id: string,
  access: BranchScope,
): Promise<RunResult> {
  const period = await prisma.payrollPeriod.findFirst({
    where: { id, tenantId },
    include: { branch: { select: { name: true } } },
  });
  if (!period) return { ok: false, message: "A pay run no longer exists." };
  if (!mayHandle(access, period.branchId)) {
    return { ok: false, message: "You don't handle pay for that branch." };
  }
  if (period.status === "APPROVED") return { ok: true };

  const label = `${period.branch?.name ?? "No-branch run"} (${fmtDate(period.startDate)} - ${fmtDate(period.endDate)})`;

  // A run with no branch covers every worker. These only exist as leftovers
  // from a deleted branch, so completing one is almost certainly a mistake.
  if (!period.branchId) {
    return {
      ok: false,
      message: `${label} has no branch, so it would pay every worker in every branch. Complete the branch runs instead, and delete this one.`,
    };
  }

  // A shift must never be paid twice. A completed run over overlapping dates
  // that could hold the same workers - this branch, or a no-branch run, which
  // covers everyone - means some of these shifts are already paid.
  const alreadyPaid = await prisma.payrollPeriod.findFirst({
    where: {
      tenantId,
      id: { not: period.id },
      status: "APPROVED",
      startDate: { lte: period.endDate },
      endDate: { gte: period.startDate },
      OR: [{ branchId: period.branchId }, { branchId: null }],
    },
    include: { branch: { select: { name: true } } },
  });
  if (alreadyPaid) {
    return {
      ok: false,
      message: `${label} overlaps the completed ${alreadyPaid.branch?.name ?? "no-branch"} run (${fmtDate(alreadyPaid.startDate)} - ${fmtDate(alreadyPaid.endDate)}), so some shifts would be paid twice. Not completed.`,
    };
  }

  const report = await buildPayReport(tenantId, {
    startDate: period.startDate,
    endDate: period.endDate,
    branchId: period.branchId,
  });

  // Completing with timesheets still waiting would leave that work unpaid,
  // and nothing afterwards would say so.
  if (report.pendingCount > 0) {
    const n = report.pendingCount;
    return {
      ok: false,
      message: `${label}: ${n} shift${n === 1 ? " is" : "s are"} still awaiting approval. Approve or reject ${n === 1 ? "it" : "them"} in Timesheets first, so nothing is left unpaid.`,
    };
  }
  // Clock times saved a day early (see lib/dayShift) cost real work at zero.
  // Completing now would freeze that underpayment into the payslip.
  const clockedInRun = await prisma.shift.findMany({
    where: {
      tenantId,
      branchId: period.branchId,
      status: "COMPLETED",
      start: { gte: period.startDate, lte: period.endDate },
      clockInAt: { not: null },
      clockOutAt: { not: null },
    },
    select: { id: true, start: true, end: true, clockInAt: true, clockOutAt: true },
  });
  const shifted = clockedInRun.filter(isDayShifted).length;
  if (shifted > 0) {
    return {
      ok: false,
      message: `${label}: ${shifted} shift${shifted === 1 ? " has" : "s have"} clock times saved a day early and would be paid 0 hours. Press "Fix" in the red panel on the Payroll or Timesheets page first.`,
    };
  }

  // Mileage the old trip code lost (see lib/tripRepair). Completing would pay
  // those drives short, and freeze it.
  const shortTrips = await findShortTrips(tenantId, {
    shiftIds: clockedInRun.map((s) => s.id),
  });
  if (shortTrips.length > 0) {
    return {
      ok: false,
      message: `${label}: ${shortTrips.length} trip${shortTrips.length === 1 ? " is" : "s are"} missing mileage. Press "Fix" in the purple panel on the Payroll or Timesheets page first.`,
    };
  }

  if (report.rows.length === 0) {
    return { ok: false, message: `${label} has no approved shifts to pay.` };
  }

  const claimed = await prisma.$transaction(async (tx) => {
    // Guarded on DRAFT so two people completing at once can't both write lines.
    const updated = await tx.payrollPeriod.updateMany({
      where: { id: period.id, status: "DRAFT" },
      data: { status: "APPROVED", approvedBy, approvedAt: new Date() },
    });
    if (updated.count === 0) return false;
    await tx.payrollLine.deleteMany({ where: { periodId: period.id } });
    await tx.payrollLine.createMany({
      data: report.rows.map((r) => ({
        tenantId,
        periodId: period.id,
        staffId: r.staffId,
        name: r.name,
        shifts: r.shifts,
        hours: r.hours,
        km: r.km,
        wagePay: r.wagePay,
        kmPay: r.kmPay,
        total: r.total,
        // Frozen with the totals, so the worker's breakdown still matches the
        // money they were paid even if a shift is edited afterwards.
        bands: JSON.stringify(r.bands),
        detail: JSON.stringify(
          r.lines.map((l) => ({
            date: l.dateLabel,
            time: l.timeLabel,
            client: l.clientName,
            band: l.dayType,
            holiday: l.holidayName,
            hours: l.hours,
            rate: l.rate,
            km: l.km,
            kmPay: l.kmPay,
            pay: l.pay,
          })),
        ),
      })),
    });
    return true;
  });
  if (!claimed) return { ok: true };

  // Hours only. A push shows on the lock screen, and a pay figure there is
  // visible to anyone who glances at the phone.
  const range = `${fmtDate(period.startDate)} - ${fmtDate(period.endDate)}`;
  await Promise.all(
    report.rows.map((r) =>
      notifyWorker(r.staffId, {
        tenantId,
        type: "PAYROLL",
        title: "Your pay is ready",
        body: `${range}: ${r.hours.toFixed(2)} hours. Tap to see your pay.`,
        url: "/my-shifts/payroll",
      }).catch(() => {}),
    ),
  );
  return { ok: true };
}

export type CompleteResult = { completed: number; errors: string[] };

/**
 * Complete one or more pay runs - several when finishing every branch for the
 * same dates in one go.
 *
 * One at a time and in order, so the double-pay check sees any run completed
 * earlier in the same batch.
 */
export async function completePayrollRuns(ids: string[]): Promise<CompleteResult> {
  const { tenant, session, scope: access } = await requireManager();
  let completed = 0;
  const errors: string[] = [];
  for (const id of ids) {
    const r = await completeOne(tenant.id, session.name, String(id), access);
    if (r.ok) completed += 1;
    else if (r.message) errors.push(r.message);
  }
  revalidatePath("/payroll");
  for (const id of ids) revalidatePath(`/payroll/${id}`);
  revalidatePath("/my-shifts/payroll");
  return { completed, errors };
}

/**
 * Re-open a completed run, e.g. after a timesheet correction.
 *
 * Its frozen lines are removed because they are no longer final, so workers
 * stop seeing it until it is completed again.
 */
export async function reopenPayrollPeriod(formData: FormData) {
  const { tenant, scope: access } = await requireManager();
  const id = str(formData.get("id"));
  const allowed = payrollBranchIds(access);
  const res = await prisma.payrollPeriod.updateMany({
    where: {
      id,
      tenantId: tenant.id,
      status: "APPROVED",
      ...(allowed ? { branchId: { in: allowed } } : {}),
    },
    data: { status: "DRAFT", approvedBy: null, approvedAt: null },
  });
  if (res.count > 0) {
    await prisma.payrollLine.deleteMany({ where: { periodId: id, tenantId: tenant.id } });
  }
  revalidatePath("/payroll");
  revalidatePath(`/payroll/${id}`);
  revalidatePath("/my-shifts/payroll");
}

/** Drafts only. Deleting a completed run would erase the record of what was paid. */
export async function deletePayrollPeriod(formData: FormData) {
  const { tenant, scope: access } = await requireManager();
  const id = str(formData.get("id"));
  const allowed = payrollBranchIds(access);
  await prisma.payrollPeriod.deleteMany({
    where: {
      id,
      tenantId: tenant.id,
      status: "DRAFT",
      ...(allowed ? { branchId: { in: allowed } } : {}),
    },
  });
  revalidatePath("/payroll");
}

/**
 * Remove draft runs that have no branch.
 *
 * They are left behind when a branch is deleted: the run's branch is set to
 * null rather than the run being removed. A run with no branch covers every
 * worker, so one sitting beside the branch runs for the same dates is a double
 * payment waiting to happen. Drafts only - nothing has been paid from them.
 */
export async function deleteOrphanDrafts(): Promise<{ deleted: number }> {
  const { tenant, scope: access } = await requireManager();
  // Runs with no branch cover every branch: head office's to clear up.
  if (!access.headOffice) return { deleted: 0 };
  const res = await prisma.payrollPeriod.deleteMany({
    where: { tenantId: tenant.id, branchId: null, status: "DRAFT" },
  });
  revalidatePath("/payroll");
  return { deleted: res.count };
}

/**
 * Give branchless shifts a branch, so that branch's pay run covers them.
 *
 * A shift loses its branch when that branch is deleted (the link is set to
 * null), or is created for a participant and worker who have none. No branch
 * run pays it then - so completing every branch's run would still leave it
 * unpaid, with nothing on screen to say so.
 */
export async function assignShiftsToBranch(
  ids: string[],
  branchId: string,
): Promise<{ error?: string; updated?: number }> {
  const { tenant, scope: access } = await requireManager();
  // Shifts with no branch belong to nobody yet: head office places them.
  if (!access.headOffice) return { error: "Only head office can assign shifts to a branch." };
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, tenantId: tenant.id },
    select: { id: true, name: true },
  });
  if (!branch) return { error: "Choose a branch." };

  const shifts = await prisma.shift.findMany({
    where: { id: { in: ids.map(String) }, tenantId: tenant.id, branchId: null },
    select: { id: true, start: true },
  });
  if (shifts.length === 0) return { updated: 0 };

  // Moving a shift into dates the branch has already completed would put it
  // inside a frozen run that never paid it - unpaid again, just less visibly.
  const first = new Date(Math.min(...shifts.map((s) => s.start.getTime())));
  const last = new Date(Math.max(...shifts.map((s) => s.start.getTime())));
  const frozen = await prisma.payrollPeriod.findFirst({
    where: {
      tenantId: tenant.id,
      branchId: branch.id,
      status: "APPROVED",
      startDate: { lte: last },
      endDate: { gte: first },
    },
    select: { startDate: true, endDate: true },
  });
  if (frozen) {
    return {
      error: `${branch.name}'s pay run for ${fmtDate(frozen.startDate)} - ${fmtDate(frozen.endDate)} is already completed, so it wouldn't pay these. Re-open it first, then assign.`,
    };
  }

  const res = await prisma.shift.updateMany({
    where: { id: { in: shifts.map((s) => s.id) }, tenantId: tenant.id, branchId: null },
    data: { branchId: branch.id },
  });
  revalidatePath("/payroll");
  revalidatePath("/timesheets");
  revalidatePath("/schedule");
  return { updated: res.count };
}
