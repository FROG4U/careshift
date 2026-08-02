"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { AWARD_SEED_LEVELS, seedBase } from "@/lib/awardRates";
import {
  STAFF_STREAMS,
  DAY_TYPES,
  DAY_TYPE_MULTIPLIER,
  type DayType,
} from "@/lib/constants";

const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const num = (v: FormDataEntryValue | null) => {
  const s = str(v);
  return s ? Number(s) : 0;
};

/** Pull all stream×dayType rate cells out of a submitted form. */
function gridFromForm(formData: FormData) {
  const cells: { stream: string; dayType: string; rate: number }[] = [];
  for (const stream of STAFF_STREAMS) {
    for (const dayType of DAY_TYPES) {
      cells.push({
        stream,
        dayType,
        rate: num(formData.get(`rate_${stream}_${dayType}`)),
      });
    }
  }
  return cells;
}

/** Seed Pay Levels from the starter award table (idempotent by level name). */
export async function importAwardLevels() {
  const { tenant } = await requireTenant();

  const existing = await prisma.payLevel.findMany({
    where: { tenantId: tenant.id },
    select: { name: true },
  });
  const have = new Set(existing.map((e) => e.name));

  for (const [i, lvl] of AWARD_SEED_LEVELS.entries()) {
    if (have.has(lvl.name)) continue;
    await prisma.payLevel.create({
      data: {
        tenantId: tenant.id,
        name: lvl.name,
        award: lvl.award,
        mileageRate: lvl.mileageRate,
        sortOrder: i,
        seeded: true,
        rates: {
          create: STAFF_STREAMS.flatMap((stream) =>
            DAY_TYPES.map((dayType) => ({
              tenantId: tenant.id,
              stream,
              dayType,
              rate: round2(
                seedBase(lvl, stream) * DAY_TYPE_MULTIPLIER[dayType as DayType],
              ),
            })),
          ),
        },
      },
    });
  }
  revalidatePath("/staff/pay-levels");
  revalidatePath("/staff");
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export async function createPayLevel(formData: FormData) {
  const { tenant } = await requireTenant();
  const name = str(formData.get("name"));
  if (!name) return;
  await prisma.payLevel.create({
    data: {
      tenantId: tenant.id,
      name,
      award: str(formData.get("award")) || null,
      mileageRate: num(formData.get("mileageRate")),
      rates: {
        create: gridFromForm(formData).map((c) => ({
          tenantId: tenant.id,
          stream: c.stream,
          dayType: c.dayType,
          rate: c.rate,
        })),
      },
    },
  });
  revalidatePath("/staff/pay-levels");
  revalidatePath("/staff");
}

export async function updatePayLevel(formData: FormData) {
  const { tenant } = await requireTenant();
  const id = str(formData.get("id"));
  if (!id) return;

  const level = await prisma.payLevel.findFirst({
    where: { id, tenantId: tenant.id },
  });
  if (!level) return;

  await prisma.payLevel.update({
    where: { id },
    data: {
      name: str(formData.get("name")),
      award: str(formData.get("award")) || null,
      mileageRate: num(formData.get("mileageRate")),
    },
  });

  // Upsert every grid cell.
  for (const c of gridFromForm(formData)) {
    await prisma.payRate.upsert({
      where: {
        payLevelId_stream_dayType: {
          payLevelId: id,
          stream: c.stream,
          dayType: c.dayType,
        },
      },
      create: {
        tenantId: tenant.id,
        payLevelId: id,
        stream: c.stream,
        dayType: c.dayType,
        rate: c.rate,
      },
      update: { rate: c.rate },
    });
  }

  revalidatePath("/staff/pay-levels");
  revalidatePath("/staff");
}

export async function deletePayLevel(formData: FormData) {
  const { tenant } = await requireTenant();
  const id = str(formData.get("id"));
  await prisma.payLevel.deleteMany({ where: { id, tenantId: tenant.id } });
  revalidatePath("/staff/pay-levels");
  revalidatePath("/staff");
}
