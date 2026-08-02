import { prisma } from "./prisma";

export type ActivityItem = {
  at: string; // ISO
  icon: string;
  who: string;
  text: string;
  tone: "in" | "out" | "accept" | "swap" | "leave";
};

const name = (s: { firstName: string; lastName: string }) =>
  `${s.firstName} ${s.lastName}`;

/** A short "who did what today" feed for the dashboard, derived from real events. */
export async function todayActivity(tenantId: string): Promise<ActivityItem[]> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const range = { gte: start, lt: end };

  const [ins, outs, accepts, swaps, leaves] = await Promise.all([
    prisma.shift.findMany({
      where: { tenantId, clockInAt: range },
      include: { staff: true, client: true },
    }),
    prisma.shift.findMany({
      where: { tenantId, clockOutAt: range },
      include: { staff: true, client: true },
    }),
    prisma.shift.findMany({
      where: { tenantId, publishState: "ACCEPTED", respondedAt: range },
      include: { staff: true, client: true },
    }),
    prisma.shiftSwap.findMany({
      where: { tenantId, createdAt: range },
      include: { fromStaff: true, toStaff: true },
    }),
    prisma.availability.findMany({
      where: { tenantId, createdAt: range },
      include: { staff: true },
    }),
  ]);

  const items: ActivityItem[] = [];

  for (const s of ins)
    if (s.staff && s.clockInAt)
      items.push({ at: s.clockInAt.toISOString(), icon: "login", tone: "in", who: name(s.staff), text: `clocked in — ${name(s.client)}` });
  for (const s of outs)
    if (s.staff && s.clockOutAt)
      items.push({ at: s.clockOutAt.toISOString(), icon: "logout", tone: "out", who: name(s.staff), text: `clocked out — ${name(s.client)}` });
  for (const s of accepts)
    if (s.staff && s.respondedAt)
      items.push({ at: s.respondedAt.toISOString(), icon: "check_circle", tone: "accept", who: name(s.staff), text: `accepted a shift — ${name(s.client)}` });
  for (const s of swaps)
    items.push({ at: s.createdAt.toISOString(), icon: "swap_horiz", tone: "swap", who: name(s.fromStaff), text: `requested a swap to ${name(s.toStaff)}` });
  for (const a of leaves)
    items.push({ at: a.createdAt.toISOString(), icon: "event_busy", tone: "leave", who: name(a.staff), text: "requested time off" });

  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);
}
