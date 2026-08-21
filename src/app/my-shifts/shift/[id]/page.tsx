import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtTime, fmtDate } from "@/lib/format";
import { ShiftClock } from "@/components/ShiftClock";
import { ShiftNotes } from "@/components/ShiftNotes";
import { ShiftSwap } from "@/components/ShiftSwap";
import { RunningLate } from "@/components/RunningLate";
import { DirectionsButton } from "@/components/worker/DirectionsButton";
import { GeofenceMap } from "@/components/GeofenceMap";
import { ShiftMap } from "@/components/ShiftMap";
import { notesDueFor, hasOverdueNotes } from "@/lib/notesDue";
import { ShiftTasks } from "@/components/worker/ShiftTasks";

/**
 * One shift, full screen: the map, the big clock in/out button, and
 * everything that belongs to that visit. Reached by tapping a row on the
 * Shifts list.
 */
export default async function WorkerShiftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.staffId) redirect("/dashboard");

  const account = await prisma.user.findUnique({
    where: { id: session.id },
    select: { status: true },
  });
  if (!account || account.status !== "APPROVED") redirect("/pending");

  const { id } = await params;

  // Scoped to this worker, so nobody can open someone else's shift.
  const shift = await prisma.shift.findFirst({
    where: { id, tenantId: session.tenantId, staffId: session.staffId },
    include: {
      client: true,
      pauses: true,
      transports: true,
      tasks: { orderBy: [{ dueTime: "asc" }, { sortOrder: "asc" }] },
    },
  });
  if (!shift) notFound();

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
  });
  const graceMin = tenant?.lateGraceMin ?? 5;

  const [allocations, pendingSwap, lateNotice, dues] = await Promise.all([
    prisma.clientWorker.findMany({
      where: {
        tenantId: session.tenantId,
        clientId: shift.clientId,
        staffId: { not: session.staffId },
      },
      include: { staff: true },
    }),
    prisma.shiftSwap.findFirst({
      where: {
        tenantId: session.tenantId,
        shiftId: shift.id,
        fromStaffId: session.staffId,
        status: "PENDING",
      },
      include: { toStaff: true },
    }),
    prisma.lateNotice.findFirst({
      where: { staffId: session.staffId, shiftId: shift.id },
      select: { id: true },
    }),
    notesDueFor(session.tenantId, session.staffId),
  ]);

  const candidates = allocations.map((a) => ({
    id: a.staffId,
    name: `${a.staff.firstName} ${a.staff.lastName}`,
  }));
  const pending = pendingSwap
    ? {
        id: pendingSwap.id,
        toName: `${pendingSwap.toStaff.firstName} ${pendingSwap.toStaff.lastName}`,
      }
    : null;

  const totalKm = shift.transports.reduce((sum, t) => sum + t.km, 0);
  const canSwap =
    new Date(shift.start).getTime() - Date.now() > 24 * 3_600_000;

  // Overdue notes on OTHER shifts block starting this one.
  const clockInBlocked = hasOverdueNotes(dues)
    ? "Fill your overdue shift notes before you can start a new shift."
    : null;

  const isLate =
    shift.status === "SCHEDULED" &&
    Date.now() - new Date(shift.start).getTime() > graceMin * 60_000;

  const needsNotes =
    shift.status === "COMPLETED" && !shift.progressNote?.trim();

  return (
    <div className="space-y-4 p-4">
      <Link
        href="/my-shifts"
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-500"
      >
        <span className="material-symbols-rounded text-[18px]">arrow_back</span>
        All shifts
      </Link>

      <section className="-mx-4 overflow-hidden bg-white shadow-sm">
        {shift.client.lat != null && shift.client.lng != null ? (
          <ShiftMap
            center={{ lat: shift.client.lat, lng: shift.client.lng }}
            radiusM={shift.client.geofenceFt * 0.3048}
            trips={[]}
            heightPx={230}
            rounded={false}
            centerLabel={shift.client.address ?? undefined}
          />
        ) : (
          <GeofenceMap label={shift.client.address ?? "Clock-in zone"} />
        )}

        <div className="relative z-10 -mt-16 px-4 pb-6">
          <ShiftClock
            hero
            clockInIso={shift.clockInAt?.toISOString() ?? null}
            shiftId={shift.id}
            status={shift.status}
            paused={shift.pauses.some((p) => !p.endAt)}
            transportActive={shift.transports.some((t) => !t.endAt)}
            transportKm={totalKm}
            transportPurpose={
              shift.transports.find((t) => !t.endAt)?.purpose ?? null
            }
            note={shift.progressNote ?? ""}
            blockedReason={clockInBlocked}
            participantName={`${shift.client.firstName} ${shift.client.lastName}`}
            participantAddress={shift.client.address ?? undefined}
            whenLabel={`${fmtDate(shift.start)} · ${fmtTime(shift.start)} – ${fmtTime(shift.end)}`}
          />

          <DirectionsButton
            lat={shift.client.lat}
            lng={shift.client.lng}
            address={shift.client.address}
          />

          {shift.status === "SCHEDULED" && (
            <div className="mt-3">
              {isLate && (
                <div className="mb-3 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3.5">
                  <span className="material-symbols-rounded text-[22px] text-red-600">
                    warning
                  </span>
                  <div className="text-sm text-red-700">
                    <span className="font-bold">
                      You&apos;re late for this shift.
                    </span>{" "}
                    Please tap <strong>Running late</strong> below and tell the
                    office why — they&apos;ve been notified.
                  </div>
                </div>
              )}
              <RunningLate
                shiftId={shift.id}
                alreadyReported={Boolean(lateNotice)}
              />
              <ShiftSwap
                shiftId={shift.id}
                candidates={candidates}
                pending={pending}
                canSwap={canSwap}
              />
            </div>
          )}
        </div>
      </section>

      <ShiftTasks
        tasks={shift.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          notes: t.notes,
          dueTime: t.dueTime,
          completed: t.completedAt != null,
        }))}
        disabled={shift.status === "SCHEDULED"}
      />

      {/* Clocked times + mileage once the visit is under way or finished. */}
      {shift.clockInAt && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 font-semibold text-emerald-700">
            <span
              className="material-symbols-rounded text-[16px] leading-none"
              style={{ fontVariationSettings: "'FILL' 0" }}
            >
              schedule
            </span>
            In {fmtTime(shift.clockInAt)}
            {shift.clockOutAt && ` · Out ${fmtTime(shift.clockOutAt)}`}
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

      {shift.status === "COMPLETED" && (
        <div>
          {needsNotes ? (
            <ShiftNotes
              shiftId={shift.id}
              clockOutIso={shift.clockOutAt?.toISOString() ?? null}
            />
          ) : (
            <div className="rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-700">
              ✓ Notes added — sent to admin for approval
            </div>
          )}
        </div>
      )}
    </div>
  );
}
