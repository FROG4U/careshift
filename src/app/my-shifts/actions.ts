"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyManagers } from "@/lib/notify";
import { notesDueFor, hasOverdueNotes } from "@/lib/notesDue";
import {
  speedLimitAt,
  MIN_DRIVING_KMH,
  SPEED_TOLERANCE_KMH,
} from "@/lib/speedLimit";

const FT_PER_M = 3.28084;

function fmtWhen(d: Date) {
  return d.toLocaleString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Haversine distance in metres between two lat/lng points. */
function distanceMetres(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(toRad(aLat)) * Math.cos(toRad(bLat));
  return 2 * R * Math.asin(Math.sqrt(h));
}

function coords(formData: FormData) {
  const lat = Number(formData.get("lat"));
  const lng = Number(formData.get("lng"));
  const speedRaw = formData.get("speed");
  const speedMs = speedRaw != null ? Number(speedRaw) : NaN;
  return {
    lat: Number.isNaN(lat) ? null : lat,
    lng: Number.isNaN(lng) ? null : lng,
    // Device speed m/s → km/h; null when the device doesn't report it.
    speedKmh: Number.isFinite(speedMs) ? speedMs * 3.6 : null,
  };
}

/** Load the shift, guaranteeing it belongs to the signed-in worker. */
async function workerShift(shiftId: string) {
  const session = await getSession();
  if (!session?.staffId) throw new Error("Not a worker");
  const shift = await prisma.shift.findFirst({
    where: { id: shiftId, tenantId: session.tenantId, staffId: session.staffId },
    include: { client: true, transports: true },
  });
  if (!shift) throw new Error("Shift not found");
  return shift;
}

type GeoClient = {
  lat: number | null;
  lng: number | null;
  geofenceFt: number;
  firstName: string;
};

/**
 * How far outside the participant's radius the worker is, in metres, or null
 * if they're inside it (or there's nothing to compare against).
 */
function metresOutside(
  client: GeoClient,
  lat: number | null,
  lng: number | null,
): number | null {
  if (client.lat == null || client.lng == null) return null;
  if (lat == null || lng == null) return null;
  const dist = distanceMetres(lat, lng, client.lat, client.lng);
  const limitM = client.geofenceFt / FT_PER_M;
  return dist > limitM ? dist : null;
}

/**
 * Returns a geofence error message if the worker is outside the participant's
 * allowed radius, else null. If the participant has no location set, or the
 * phone couldn't supply GPS, we allow the action (and record no coordinates).
 *
 * Used for clocking IN only. Clocking OUT is never blocked — see `clockOut`.
 */
function geofenceError(
  client: GeoClient,
  lat: number | null,
  lng: number | null,
) {
  const outsideM = metresOutside(client, lat, lng);
  if (outsideM == null) return null;
  // The number that helps is the OVERSHOOT — how much closer to get — not the
  // raw distance, which a worker can't act on without knowing the limit.
  const overFt = Math.round((outsideM - client.geofenceFt / FT_PER_M) * FT_PER_M);
  return `You're about ${overFt} ft too far from ${client.firstName}'s place. Move closer and try again.`;
}

export async function clockIn(formData: FormData) {
  const shift = await workerShift(String(formData.get("shiftId") ?? ""));

  // Block starting a new shift while any earlier shift's notes are >24h overdue.
  const dues = await notesDueFor(shift.tenantId, shift.staffId!);
  if (hasOverdueNotes(dues)) {
    return {
      error:
        "You have overdue shift notes. Fill them in Completed Shifts before starting a new shift.",
    };
  }

  const { lat, lng } = coords(formData);
  const onSite = String(formData.get("onSite") ?? "") === "1";
  const outsideM = metresOutside(shift.client, lat, lng);

  // Outside the radius and not yet confirmed: refuse, but tell them how much
  // closer to get, and offer the on-site override. A phone indoors can fall
  // back to WiFi triangulation and read hundreds of feet out while the worker
  // is at the door — "move closer" is useless advice to someone already there.
  if (outsideM != null && !onSite) {
    return {
      error: geofenceError(shift.client, lat, lng) ?? undefined,
      canConfirmOnSite: true,
      distanceFt: Math.round(outsideM * FT_PER_M),
      clientName: shift.client.firstName,
    };
  }

  await prisma.shift.update({
    where: { id: shift.id },
    data: {
      status: "IN_PROGRESS",
      clockInAt: new Date(),
      clockInLat: lat,
      clockInLng: lng,
      // Only stamped on the exception, so an ordinary clock-in stays clean.
      clockInOnSiteConfirmed: outsideM != null && onSite,
      clockInDistanceM: outsideM,
    },
  });
  revalidatePath("/my-shifts");
  return { ok: true };
}

export async function clockOut(formData: FormData) {
  const shift = await workerShift(String(formData.get("shiftId") ?? ""));
  const { lat, lng } = coords(formData);
  const note = String(formData.get("note") ?? "").trim() || null;
  const handover = String(formData.get("handover") ?? "").trim() || null;
  const outReason = String(formData.get("outReason") ?? "").trim() || null;

  // Finishing away from the participant's home is legitimate — dropping
  // someone at a day program, ending at an appointment. So clocking OUT is
  // never blocked: paid time is capped to the roster regardless, so a distant
  // clock-out can't gain anyone a minute of pay, and refusing it just strands
  // a worker in a car park. We ask why instead, and keep the distance.
  const outsideM = metresOutside(shift.client, lat, lng);
  if (outsideM != null && !outReason) {
    return {
      needsReason: true,
      distanceFt: Math.round(outsideM * FT_PER_M),
      clientName: shift.client.firstName,
    };
  }

  const now = new Date();

  // Auto-close any open break so it doesn't run forever.
  await prisma.shiftPause.updateMany({
    where: { shiftId: shift.id, endAt: null },
    data: { endAt: now },
  });

  // Auto-close any still-open transport trip, adding a final distance leg.
  const openT = shift.transports.find((t) => !t.endAt);
  if (openT) {
    let km = openT.km;
    if (openT.lastLat != null && openT.lastLng != null && lat != null && lng != null) {
      const d = distanceMetres(openT.lastLat, openT.lastLng, lat, lng) / 1000;
      if (d > 0.015 && d < 5) km += d;
    }
    await prisma.transport.update({
      where: { id: openT.id },
      data: { endAt: now, km, endLat: lat, endLng: lng, lastLat: lat, lastLng: lng },
    });
  }

  await prisma.shift.update({
    where: { id: shift.id },
    data: {
      status: "COMPLETED",
      clockOutAt: now,
      clockOutLat: lat,
      clockOutLng: lng,
      progressNote: note ?? shift.progressNote,
      // Optional. Blank means nothing to pass on, and must not wipe a handover
      // the worker already wrote earlier in the shift.
      handoverNote: handover ?? shift.handoverNote,
      // Only set when they actually finished outside the radius, so an
      // ordinary clock-out leaves these null.
      clockOutReason: outsideM != null ? outReason : null,
      clockOutDistanceM: outsideM,
    },
  });
  revalidatePath("/my-shifts");
  revalidatePath("/timesheets");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * The incoming worker confirms they've read the previous worker's handover.
 *
 * Acknowledging is what clears the note from the queue, so this is scoped to
 * the acknowledging worker's own tenant — a worker can't clear a note for a
 * participant they're not working with.
 */
export async function acknowledgeHandover(formData: FormData) {
  const session = await getSession();
  if (!session?.staffId) return { error: "Not signed in as a support worker." };

  const fromShiftId = String(formData.get("fromShiftId") ?? "");
  const target = await prisma.shift.findFirst({
    where: { id: fromShiftId, tenantId: session.tenantId },
    select: { id: true, handoverAckAt: true },
  });
  if (!target) return { error: "That handover note is no longer available." };

  // Already acknowledged (two devices, double tap) — succeed quietly rather
  // than overwriting who read it first.
  if (target.handoverAckAt) return { ok: true };

  await prisma.shift.update({
    where: { id: target.id },
    data: {
      handoverAckAt: new Date(),
      handoverAckByStaffId: session.staffId,
    },
  });
  revalidatePath("/my-shifts");
  revalidatePath("/timesheets");
  return { ok: true };
}

/** Worker adds/updates the shift notes after a shift (within the 24h window,
 *  though we still accept them later — the shift just isn't payable until set). */
export async function addShiftNotes(formData: FormData) {
  const shift = await workerShift(String(formData.get("shiftId") ?? ""));
  const note = String(formData.get("note") ?? "").trim();
  if (!note) return { error: "Please write your shift notes." };
  await prisma.shift.update({
    where: { id: shift.id },
    data: { progressNote: note },
  });
  revalidatePath("/my-shifts");
  revalidatePath("/timesheets");
  return { ok: true };
}

export async function acceptShift(formData: FormData) {
  const shift = await workerShift(String(formData.get("shiftId") ?? ""));
  const session = await getSession();
  await prisma.shift.update({
    where: { id: shift.id },
    data: { publishState: "ACCEPTED", respondedAt: new Date() },
  });
  await notifyManagers({
    tenantId: shift.tenantId,
    type: "SHIFT_ACCEPTED",
    title: "Shift accepted",
    body: `${session?.name ?? "A worker"} accepted ${shift.client.firstName} ${shift.client.lastName} · ${fmtWhen(shift.start)}`,
    shiftId: shift.id,
  });
  revalidatePath("/my-shifts");
  return { ok: true };
}

export async function rejectShift(formData: FormData) {
  const shift = await workerShift(String(formData.get("shiftId") ?? ""));
  const session = await getSession();
  const reason = String(formData.get("reason") ?? "").trim() || null;
  await prisma.shift.update({
    where: { id: shift.id },
    data: {
      publishState: "REJECTED",
      rejectionReason: reason,
      respondedAt: new Date(),
    },
  });
  await notifyManagers({
    tenantId: shift.tenantId,
    type: "SHIFT_REJECTED",
    title: "Shift declined",
    body: `${session?.name ?? "A worker"} declined ${shift.client.firstName} ${shift.client.lastName} · ${fmtWhen(shift.start)}${reason ? ` — “${reason}”` : ""}`,
    shiftId: shift.id,
  });
  revalidatePath("/my-shifts");
  return { ok: true };
}

export async function startPause(formData: FormData) {
  const shift = await workerShift(String(formData.get("shiftId") ?? ""));
  // Ignore if already on a break.
  const open = await prisma.shiftPause.findFirst({
    where: { shiftId: shift.id, endAt: null },
  });
  if (!open) await prisma.shiftPause.create({ data: { shiftId: shift.id } });
  revalidatePath("/my-shifts");
  return { ok: true };
}

export async function endPause(formData: FormData) {
  const shift = await workerShift(String(formData.get("shiftId") ?? ""));
  await prisma.shiftPause.updateMany({
    where: { shiftId: shift.id, endAt: null },
    data: { endAt: new Date() },
  });
  revalidatePath("/my-shifts");
  return { ok: true };
}

export async function startTransport(formData: FormData) {
  const shift = await workerShift(String(formData.get("shiftId") ?? ""));
  const { lat, lng, speedKmh } = coords(formData);
  const purpose = String(formData.get("purpose") ?? "").trim() || null;

  // Don't start a second concurrent trip.
  const open = shift.transports.find((t) => !t.endAt);
  if (open) return { ok: true };

  await prisma.transport.create({
    data: {
      shiftId: shift.id,
      purpose,
      startLat: lat,
      startLng: lng,
      lastLat: lat,
      lastLng: lng,
      // Seed the route trail with the starting point.
      points:
        lat != null && lng != null
          ? { create: [{ lat, lng, speedKmh }] }
          : undefined,
    },
  });
  revalidatePath("/my-shifts");
  return { ok: true };
}

/**
 * Periodic GPS ping while a trip is active. Accumulates distance from the last
 * recorded point, ignoring GPS jitter (<15 m) and implausible jumps (>5 km in
 * one window). Does NOT revalidate — the client tracks the running km itself.
 */
export async function pingTransport(formData: FormData) {
  const shift = await workerShift(String(formData.get("shiftId") ?? ""));
  const { lat, lng, speedKmh: reported } = coords(formData);
  const t = shift.transports.find((x) => !x.endAt);
  if (!t || lat == null || lng == null) return { km: t?.km ?? 0 };

  // Distance since the last point, and a computed speed as a fallback for
  // devices that don't report GPS speed.
  let km = t.km;
  let computedKmh: number | null = null;
  if (t.lastLat != null && t.lastLng != null) {
    const d = distanceMetres(t.lastLat, t.lastLng, lat, lng) / 1000;
    if (d > 0.015 && d < 5) {
      km += d;
      const last = await prisma.transportPoint.findFirst({
        where: { transportId: t.id },
        orderBy: { at: "desc" },
        select: { at: true },
      });
      if (last) {
        const hrs = (Date.now() - last.at.getTime()) / 3_600_000;
        if (hrs > 0) computedKmh = d / hrs;
      }
    }
  }
  const speedKmh = reported ?? computedKmh;

  await prisma.transport.update({
    where: { id: t.id },
    data: {
      km,
      lastLat: lat,
      lastLng: lng,
      points: { create: [{ lat, lng, speedKmh }] },
    },
  });
  return { km };
}

export async function endTransport(formData: FormData) {
  const shift = await workerShift(String(formData.get("shiftId") ?? ""));
  const { lat, lng, speedKmh } = coords(formData);
  const t = shift.transports.find((x) => !x.endAt);
  if (!t) return { ok: true };

  let km = t.km;
  if (t.lastLat != null && t.lastLng != null && lat != null && lng != null) {
    const d = distanceMetres(t.lastLat, t.lastLng, lat, lng) / 1000;
    if (d > 0.015 && d < 5) km += d;
  }
  await prisma.transport.update({
    where: { id: t.id },
    data: {
      endAt: new Date(),
      km,
      endLat: lat,
      endLng: lng,
      lastLat: lat,
      lastLng: lng,
      points:
        lat != null && lng != null
          ? { create: [{ lat, lng, speedKmh }] }
          : undefined,
    },
  });

  // Safety pass: compare recorded speeds to street limits and store only the
  // over-the-limit events. Best-effort — never blocks ending the trip.
  try {
    await analyseSpeeding(t.id, shift.tenantId);
  } catch {
    /* speed analysis is non-critical */
  }

  revalidatePath("/my-shifts");
  return { ok: true, km };
}

/**
 * Look up the street limit for the fastest points of a finished trip and
 * record any that were over the limit (beyond tolerance). Samples the trip so
 * we don't hammer OpenStreetMap.
 */
async function analyseSpeeding(transportId: string, tenantId: string) {
  const points = await prisma.transportPoint.findMany({
    where: { transportId, speedKmh: { gte: MIN_DRIVING_KMH } },
    orderBy: { speedKmh: "desc" },
    take: 40, // fastest points first; enough to catch the speeding moments
  });
  if (points.length === 0) return;

  let checks = 0;
  for (const p of points) {
    if (checks >= 12) break; // cap Overpass calls per trip
    checks++;
    const limit = await speedLimitAt(p.lat, p.lng);
    if (!limit) continue; // unknown road → never flagged
    const over = (p.speedKmh ?? 0) - limit.limitKmh;
    if (over > SPEED_TOLERANCE_KMH) {
      // De-dupe: one event per ~minute per road.
      const exists = await prisma.speedEvent.findFirst({
        where: {
          transportId,
          limitKmh: limit.limitKmh,
          at: {
            gte: new Date(p.at.getTime() - 60_000),
            lte: new Date(p.at.getTime() + 60_000),
          },
        },
      });
      if (exists) continue;
      await prisma.speedEvent.create({
        data: {
          tenantId,
          transportId,
          at: p.at,
          lat: p.lat,
          lng: p.lng,
          speedKmh: Math.round((p.speedKmh ?? 0) * 10) / 10,
          limitKmh: limit.limitKmh,
          overByKmh: Math.round(over * 10) / 10,
          roadName: limit.roadName,
        },
      });
    }
  }
}

/**
 * Worker asks to hand one of their shifts to another worker who is also
 * allocated to that participant. Creates a PENDING request — the shift only
 * moves once an admin/coordinator approves it.
 */
export async function requestSwap(formData: FormData) {
  const session = await getSession();
  if (!session?.staffId) return;

  const shiftId = String(formData.get("shiftId") ?? "").trim();
  const toStaffId = String(formData.get("toStaffId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!shiftId || !toStaffId || toStaffId === session.staffId) return;

  // The shift must be this worker's own, and not already finished.
  const shift = await prisma.shift.findFirst({
    where: { id: shiftId, tenantId: session.tenantId, staffId: session.staffId },
    include: { client: true },
  });
  if (!shift || shift.status === "COMPLETED") return;

  // Swaps close 24 hours before the shift starts.
  if (new Date(shift.start).getTime() - Date.now() <= 24 * 3_600_000) return;

  // The target worker must be allocated to this participant.
  const allocated = await prisma.clientWorker.findFirst({
    where: { clientId: shift.clientId, staffId: toStaffId },
  });
  if (!allocated) return;

  // Don't stack duplicate pending requests for the same shift.
  const pending = await prisma.shiftSwap.findFirst({
    where: { shiftId, status: "PENDING" },
  });
  if (pending) return;

  const toStaff = await prisma.staff.findFirst({
    where: { id: toStaffId, tenantId: session.tenantId },
  });
  if (!toStaff) return;

  await prisma.shiftSwap.create({
    data: {
      tenantId: session.tenantId,
      shiftId,
      fromStaffId: session.staffId,
      toStaffId,
      reason,
    },
  });

  await notifyManagers({
    tenantId: session.tenantId,
    type: "SWAP_REQUESTED",
    title: "Shift swap requested",
    body: `${session.name} asked to swap ${shift.client.firstName} ${shift.client.lastName} · ${fmtWhen(shift.start)} to ${toStaff.firstName} ${toStaff.lastName}${reason ? ` — “${reason}”` : ""}`,
    shiftId,
  });

  revalidatePath("/my-shifts");
  revalidatePath("/swaps");
}

/** Worker cancels their own pending swap request. */
export async function cancelSwap(formData: FormData) {
  const session = await getSession();
  if (!session?.staffId) return;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  await prisma.shiftSwap.updateMany({
    where: {
      id,
      tenantId: session.tenantId,
      fromStaffId: session.staffId,
      status: "PENDING",
    },
    data: { status: "CANCELLED" },
  });

  revalidatePath("/my-shifts");
  revalidatePath("/swaps");
}

/**
 * Worker taps "Running late" on a shift and gives a reason. Managers see these
 * in Attendance, and each one nudges the worker's reliability score down.
 */
export async function reportRunningLate(formData: FormData) {
  const session = await getSession();
  if (!session?.staffId) return;

  const shiftId = String(formData.get("shiftId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const etaRaw = String(formData.get("etaMin") ?? "").trim();
  const etaMin = etaRaw ? Number(etaRaw) : null;
  if (!shiftId || !reason) return;

  // Must be this worker's own shift, and not already finished.
  const shift = await prisma.shift.findFirst({
    where: { id: shiftId, tenantId: session.tenantId, staffId: session.staffId },
    include: { client: true },
  });
  if (!shift || shift.status === "COMPLETED") return;

  // One notice per shift is enough.
  const existing = await prisma.lateNotice.findFirst({ where: { shiftId } });
  if (existing) return;

  await prisma.lateNotice.create({
    data: {
      tenantId: session.tenantId,
      shiftId,
      staffId: session.staffId,
      reason,
      etaMin: Number.isFinite(etaMin) ? etaMin : null,
    },
  });

  await notifyManagers({
    tenantId: session.tenantId,
    type: "RUNNING_LATE",
    title: "Worker running late",
    body: `${session.name} is running late for ${shift.client.firstName} ${shift.client.lastName} · ${fmtWhen(shift.start)}${etaMin ? ` (~${etaMin} min)` : ""} — “${reason}”`,
    shiftId,
  });

  revalidatePath("/my-shifts");
  revalidatePath("/attendance");
}

/**
 * Store the worker's latest device location so the office can see where a late
 * worker is on the Live Shifts map. The worker app only pings this while they
 * have a live/imminent shift. Location tracking needs worker consent in prod.
 */
export async function pingLocation(lat: number, lng: number) {
  const session = await getSession();
  if (!session?.staffId) return;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  await prisma.staff.update({
    where: { id: session.staffId },
    data: { lastLat: lat, lastLng: lng, lastSeenAt: new Date() },
  });
}

/**
 * Save a worker's profile photo. The client compresses + resizes the image to a
 * tiny JPEG data URL before calling this, so we just sanity-check the format and
 * size (hard cap ~90KB) and store it on the Staff record.
 */
export async function updatePhoto(dataUrl: string): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session?.staffId) return { error: "Not signed in." };

  if (!/^data:image\/(jpeg|png|webp);base64,/.test(dataUrl)) {
    return { error: "That doesn't look like an image." };
  }
  // Base64 is ~1.37× the byte size; 130k chars ≈ ~95KB. Keep avatars tiny.
  if (dataUrl.length > 130_000) {
    return { error: "Image is too large — please choose a smaller photo." };
  }

  await prisma.staff.update({
    where: { id: session.staffId },
    data: { photoUrl: dataUrl },
  });

  revalidatePath("/my-shifts/profile");
  revalidatePath("/my-shifts");
  return {};
}

/**
 * Tick a shift task on or off.
 *
 * Scoped to the signed-in worker's own shift, so nobody can tick someone
 * else's checklist. Toggling is deliberate — a mis-tap should be undoable.
 */
export async function toggleShiftTask(taskId: string) {
  const session = await getSession();
  if (!session?.staffId) return;

  const task = await prisma.shiftTask.findFirst({
    where: {
      id: taskId,
      tenantId: session.tenantId,
      shift: { staffId: session.staffId },
    },
    select: { id: true, completedAt: true, shiftId: true },
  });
  if (!task) return;

  await prisma.shiftTask.update({
    where: { id: task.id },
    data: task.completedAt
      ? { completedAt: null, completedById: null }
      : { completedAt: new Date(), completedById: session.id },
  });

  revalidatePath(`/my-shifts/shift/${task.shiftId}`);
  revalidatePath("/my-shifts/completed");
}
