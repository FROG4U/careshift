"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

import { isManager } from "@/lib/roles";
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();

/** Payroll is manager-only — workers must never reach these actions. */
async function requireManager() {
  const ctx = await requireTenant();
  if (!isManager(ctx.session.role)) {
    throw new Error("Not authorised");
  }
  return ctx;
}

export async function createPayrollPeriod(formData: FormData) {
  const { tenant } = await requireManager();
  const from = str(formData.get("from"));
  const to = str(formData.get("to"));
  const branchId = str(formData.get("branchId")) || null;
  if (!from || !to) return;

  const startDate = new Date(`${from}T00:00:00`);
  const endDate = new Date(`${to}T23:59:59`);
  if (endDate <= startDate) return;

  await prisma.payrollPeriod.create({
    data: { tenantId: tenant.id, branchId, startDate, endDate },
  });
  revalidatePath("/payroll");
}

export async function approvePayrollPeriod(formData: FormData) {
  const { tenant, session } = await requireManager();
  const id = str(formData.get("id"));
  await prisma.payrollPeriod.updateMany({
    where: { id, tenantId: tenant.id, status: "DRAFT" },
    data: { status: "APPROVED", approvedBy: session.name, approvedAt: new Date() },
  });
  revalidatePath("/payroll");
  revalidatePath(`/payroll/${id}`);
}

/** Re-open an approved run (e.g. a timesheet was corrected). */
export async function reopenPayrollPeriod(formData: FormData) {
  const { tenant } = await requireManager();
  const id = str(formData.get("id"));
  await prisma.payrollPeriod.updateMany({
    where: { id, tenantId: tenant.id, status: "APPROVED" },
    data: { status: "DRAFT", approvedBy: null, approvedAt: null },
  });
  revalidatePath("/payroll");
  revalidatePath(`/payroll/${id}`);
}

export async function deletePayrollPeriod(formData: FormData) {
  const { tenant } = await requireManager();
  const id = str(formData.get("id"));
  await prisma.payrollPeriod.deleteMany({ where: { id, tenantId: tenant.id } });
  revalidatePath("/payroll");
}
