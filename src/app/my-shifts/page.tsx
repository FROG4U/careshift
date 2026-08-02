import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtTime, fmtDate } from "@/lib/format";
import { ShiftClock } from "@/components/ShiftClock";
import { ShiftNotes } from "@/components/ShiftNotes";
import { ShiftSwap } from "@/components/ShiftSwap";
import { RunningLate } from "@/components/RunningLate";
import { ReliabilityCard } from "@/components/worker/ReliabilityCard";
import { DirectionsButton } from "@/components/worker/DirectionsButton";
import { reliabilityOf } from "@/lib/reliability";
import { GeofenceMap } from "@/components/GeofenceMap";
import { ShiftMap } from "@/components/ShiftMap";
import { notesDueFor, hasOverdueNotes } from "@/lib/notesDue";

export default async function MyShiftsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
  });

  if (!session.staffId) redirect("/dashboard");

  // Authoritative approval check (live from the DB, not the JWT) — a worker only
  // reaches their shifts once an admin has approved them.
  const account = await prisma.user.findUnique({
    where: { id: session.id },
    select: { status: true },
  });
  if (!account || account.status !== "APPROVED") redirect("/pending");

  // Current week (Monday–Sunday), matching the admin schedule.
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  const me = await prisma.staff.findUnique({
    where: { id: session.staffId },
    select: { branchId: true },
  });
  const branchWhere = me?.branchId ? { branchId: me.branchId } : {};

  const shifts = await prisma.shift.findMany({
    where: {
      tenantId: session.tenantId,
      staffId: session.staffId,
      start: { gte: start, lt: end },
      publishState: { in: ["PUBLISHED", "ACCEPTED"] },
      ...branchWhere,
    },
    include: { client: true, pauses: true, transports: true },
    orderBy: { start: "asc" },
  });

  const offers = shifts.filter((s) => s.publishState === "PUBLISHED");
  const accepted = shifts.filter((s) => s.publishState === "ACCEPTED");

  // Swap candidates = other workers allocated to the same participant.
  const clientIds = [...new Set(shifts.map((s) => s.clientId))];
  const [allocations, pendingSwaps] = await Promise.all([
    clientIds.length
      ? prisma.clientWorker.findMany({
          where: {
            tenantId: session.tenantId,
            clientId: { in: clientIds },
            staffId: { not: session.staffId },
          },
          include: { staff: true },
        })
      : Promise.resolve([]),
    prisma.shiftSwap.findMany({
      where: {
        tenantId: session.tenantId,
        fromStaffId: session.staffId,
        status: "PENDING",
      },
      include: { toStaff: true },
    }),
  ]);

  const candidatesFor = (clientId: string) =>
    allocations
      .filter((a) => a.clientId === clientId)
      .map((a) => ({
        id: a.staffId,
        name: `${a.staff.firstName} ${a.staff.lastName}`,
      }));

  const pendingFor = (shiftId: string) => {
    const p = pendingSwaps.find((s) => s.shiftId === shiftId);
    return p
      ? { id: p.id, toName: `${p.toStaff.firstName} ${p.toStaff.lastName}` }
      : null;
  };

  // This worker's own reliability score (same maths the office sees).
  const [ratedShifts, myLateNotices, lateForShifts] = await Promise.all([
    prisma.shift.findMany({
      where: {
        tenantId: session.tenantId,
        staffId: session.staffId,
        status: "COMPLETED",
      },
      select: { start: true, end: true, clockInAt: true, clockOutAt: true },
    }),
    prisma.lateNotice.count({
      where: { tenantId: session.tenantId, staffId: session.staffId },
    }),
    prisma.lateNotice.findMany({
      where: { staffId: session.staffId },
      select: { shiftId: true },
    }),
  ]);
  const cfg = {
    lateGraceMin: tenant?.lateGraceMin ?? 5,
    earlyFinishGraceMin: tenant?.earlyFinishGraceMin ?? 5,
    lateFinishGraceMin: tenant?.lateFinishGraceMin ?? 15,
    ratingGreenAt: tenant?.ratingGreenAt ?? 85,
    ratingAmberAt: tenant?.ratingAmberAt ?? 65,
    lateNoticePenalty: tenant?.lateNoticePenalty ?? 2,
  };
  const rating = reliabilityOf(ratedShifts, myLateNotices, cfg);
  const lateReported = new Set(lateForShifts.map((l) => l.shiftId));

  // The shift to start / currently on: an in-progress one, else the soonest
  // not-yet-completed shift. This is the Time Clock hero.
  const active =
    accepted.find((s) => s.status === "IN_PROGRESS") ??
    accepted.find((s) => s.status !== "COMPLETED");
  const upcoming = accepted.filter(
    (s) => s.id !== active?.id && s.status !== "COMPLETED",
  );
  const completed = accepted.filter((s) => s.status === "COMPLETED");

  const km = (s: (typeof shifts)[number]) =>
    s.transports.reduce((sum, t) => sum + t.km, 0);

  // Swaps close 24 hours before the shift starts.
  const canSwap = (start: Date) =>
    new Date(start).getTime() - Date.now() > 24 * 3_600_000;

  // Overdue shift notes block starting a new shift.
  const dues = await notesDueFor(session.tenantId, session.staffId);
  const clockInBlocked = hasOverdueNotes(dues)
    ? "Fill your overdue shift notes before you can start a new shift."
    : null;

  // The worker is late if their current shift started past the grace window and
  // they still haven't clocked in.
  const activeLate =
    !!active &&
    active.status === "SCHEDULED" &&
    Date.now() - new Date(active.start).getTime() > cfg.lateGraceMin * 60_000;

  return (
    <div className="space-y-4 p-4">
        {/* Your reliability — modern card with a "View" summary popup */}
        <ReliabilityCard
          score={rating.score}
          band={rating.band}
          total={rating.total}
          clean={rating.clean}
          lateStarts={rating.lateStarts}
          earlyFinishes={rating.earlyFinishes}
          stayedLate={rating.stayedLate}
          lateNotices={rating.lateNotices}
          avgLateMin={rating.avgLateMin}
          graceMin={cfg.lateGraceMin}
        />

        {shifts.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
            No shifts this week. New shifts appear here once the office sends
            them to you.
          </div>
        )}

        {/* ── Time Clock hero: the shift to start / on ── */}
        {active && (
          <section className="-mx-4 overflow-hidden bg-white shadow-sm">
            {/* Edge-to-edge colourful map */}
            {active.client.lat != null && active.client.lng != null ? (
              <ShiftMap
                center={{ lat: active.client.lat, lng: active.client.lng }}
                radiusM={active.client.geofenceFt * 0.3048}
                trips={[]}
                heightPx={230}
                rounded={false}
                centerLabel={active.client.address ?? undefined}
              />
            ) : (
              <GeofenceMap label={active.client.address ?? "Clock-in zone"} />
            )}

            {/* Circle overlaps the map; name + controls sit below it. */}
            <div className="relative z-10 -mt-16 px-4 pb-6">
              <ShiftClock
                hero
                clockInIso={active.clockInAt?.toISOString() ?? null}
                shiftId={active.id}
                status={active.status}
                paused={active.pauses.some((p) => !p.endAt)}
                transportActive={active.transports.some((t) => !t.endAt)}
                transportKm={km(active)}
                transportPurpose={
                  active.transports.find((t) => !t.endAt)?.purpose ?? null
                }
                note={active.progressNote ?? ""}
                blockedReason={clockInBlocked}
                participantName={`${active.client.firstName} ${active.client.lastName}`}
                participantAddress={active.client.address ?? undefined}
                whenLabel={`${fmtDate(active.start)} · ${fmtTime(active.start)} – ${fmtTime(active.end)}`}
              />

              {/* Satnav to the client's home — navigation aid only, not recorded. */}
              <DirectionsButton
                lat={active.client.lat}
                lng={active.client.lng}
                address={active.client.address}
              />

              {/* Before the shift starts: running late / hand over to another worker. */}
              {active.status === "SCHEDULED" && (
                <div className="mt-3">
                  {activeLate && (
                    <div className="mb-3 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3.5">
                      <span className="material-symbols-rounded text-[22px] text-red-600">warning</span>
                      <div className="text-sm text-red-700">
                        <span className="font-bold">You&apos;re late for this shift.</span>{" "}
                        Please tap <strong>Running late</strong> below and tell the
                        office why — they&apos;ve been notified.
                      </div>
                    </div>
                  )}
                  <RunningLate
                    shiftId={active.id}
                    alreadyReported={lateReported.has(active.id)}
                  />
                  <ShiftSwap
                    shiftId={active.id}
                    candidates={candidatesFor(active.clientId)}
                    pending={pendingFor(active.id)}
                    canSwap={canSwap(active.start)}
                  />
                </div>
              )}
            </div>
          </section>
        )}

        {/* New shift offers now live on the dedicated Pending tab. */}
        {offers.length > 0 && (
          <a
            href="/my-shifts/pending"
            className="flex items-center justify-between rounded-2xl border-2 border-amber-200 bg-amber-50 px-4 py-3.5 shadow-sm"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-amber-800">
              <span className="material-symbols-rounded text-[20px]">pending_actions</span>
              {offers.length} new shift offer{offers.length === 1 ? "" : "s"} to review
            </span>
            <span className="material-symbols-rounded text-amber-500">chevron_right</span>
          </a>
        )}

        {/* ── Upcoming accepted shifts (not the active one) ── */}
        {upcoming.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-600">
              Upcoming shifts
            </h2>
            <div className="space-y-3">
              {upcoming.map((s) => (
                <div
                  key={s.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        {fmtDate(s.start)}
                      </div>
                      <div className="font-semibold text-slate-900">
                        {s.client.firstName} {s.client.lastName}
                      </div>
                      <div className="text-sm text-slate-500">
                        {fmtTime(s.start)} – {fmtTime(s.end)}
                      </div>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      Accepted
                    </span>
                  </div>

                  <ShiftSwap
                    shiftId={s.id}
                    candidates={candidatesFor(s.clientId)}
                    pending={pendingFor(s.id)}
                    canSwap={canSwap(s.start)}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Completed shifts (with pills + notes requirement) ── */}
        {completed.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-600">
              Recent shifts
            </h2>
            <div className="space-y-3">
              {completed.map((s) => {
                const totalKm = km(s);
                const needsNotes = !s.progressNote?.trim();
                return (
                  <div
                    key={s.id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      {fmtDate(s.start)}
                    </div>
                    <div className="text-lg font-semibold text-slate-900">
                      {s.client.firstName} {s.client.lastName}
                    </div>

                    {s.clockInAt && (
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 font-semibold text-emerald-700">
                          <span
                            className="material-symbols-rounded text-[16px] leading-none"
                            style={{ fontVariationSettings: "'FILL' 0" }}
                          >
                            schedule
                          </span>
                          In {fmtTime(s.clockInAt)}
                          {s.clockOutAt && ` · Out ${fmtTime(s.clockOutAt)}`}
                        </span>
                        {totalKm > 0 && (
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-2.5 py-1.5 font-semibold text-violet-700">
                            <span
                              className="material-symbols-rounded text-[16px] leading-none"
                              style={{ fontVariationSettings: "'FILL' 0" }}
                            >
                              directions_car
                            </span>
                            {totalKm.toFixed(1)} km
                          </span>
                        )}
                      </div>
                    )}

                    <div className="mt-3">
                      {needsNotes ? (
                        <ShiftNotes
                          shiftId={s.id}
                          clockOutIso={s.clockOutAt?.toISOString() ?? null}
                        />
                      ) : (
                        <div className="rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-700">
                          ✓ Notes added — sent to admin for approval
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
    </div>
  );
}
