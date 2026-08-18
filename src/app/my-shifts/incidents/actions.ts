"use server";

import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyManagers } from "@/lib/notify";
import {
  INCIDENT_SEVERITIES,
  INCIDENT_TYPES,
  isReportableIncident,
  incidentLabel,
} from "@/lib/constants";

const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const bool = (v: FormDataEntryValue | null) => String(v ?? "") === "on";

export type IncidentResult = { ok: boolean; error?: string; id?: string };

/** Save an attached photo and return its public URL. */
async function savePhoto(file: File): Promise<string | null> {
  if (file.size === 0) return null;
  if (file.size > 8 * 1024 * 1024) return null; // 8MB cap per photo
  if (!file.type.startsWith("image/")) return null;

  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().slice(0, 5);
  const name = `incident-${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), bytes);
  return `/uploads/${name}`;
}

/**
 * File an incident report. Any signed-in user can raise one; it lands in the
 * admin incident register and notifies every manager immediately (reportable
 * categories are time-critical under the NDIS rules).
 */
export async function createIncident(
  _prev: IncidentResult | undefined,
  formData: FormData,
): Promise<IncidentResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };

  const type = str(formData.get("type"));
  const description = str(formData.get("description"));
  const occurredAtRaw = str(formData.get("occurredAt"));

  if (!INCIDENT_TYPES.some((t) => t.value === type)) {
    return { ok: false, error: "Choose what kind of incident it was." };
  }
  if (description.length < 10) {
    return {
      ok: false,
      error: "Please describe what happened in a bit more detail.",
    };
  }
  const occurredAt = occurredAtRaw ? new Date(occurredAtRaw) : new Date();
  if (Number.isNaN(occurredAt.getTime())) {
    return { ok: false, error: "That date and time doesn't look right." };
  }
  if (occurredAt.getTime() > Date.now() + 5 * 60_000) {
    return { ok: false, error: "The incident date can't be in the future." };
  }

  const severityRaw = str(formData.get("severity"));
  const severity = (INCIDENT_SEVERITIES as readonly string[]).includes(severityRaw)
    ? severityRaw
    : "MEDIUM";

  const clientId = str(formData.get("clientId")) || null;
  const shiftId = str(formData.get("shiftId")) || null;

  // Where the worker sits, so the office can filter by branch.
  const staff = session.staffId
    ? await prisma.staff.findUnique({
        where: { id: session.staffId },
        select: { branchId: true },
      })
    : null;

  const incident = await prisma.incident.create({
    data: {
      tenantId: session.tenantId,
      reportedById: session.id,
      staffId: session.staffId ?? null,
      clientId,
      shiftId,
      branchId: staff?.branchId ?? null,
      occurredAt,
      location: str(formData.get("location")) || null,
      type,
      severity,
      reportable: isReportableIncident(type),
      description,
      immediateAction: str(formData.get("immediateAction")) || null,
      injuries: str(formData.get("injuries")) || null,
      medicalTreatment: bool(formData.get("medicalTreatment")),
      medicalDetail: str(formData.get("medicalDetail")) || null,
      witnesses: str(formData.get("witnesses")) || null,
      policeNotified: bool(formData.get("policeNotified")),
      policeReference: str(formData.get("policeReference")) || null,
      familyNotified: bool(formData.get("familyNotified")),
    },
  });

  // Photos (optional, several allowed).
  const files = formData.getAll("photos").filter((f): f is File => f instanceof File);
  for (const file of files.slice(0, 6)) {
    const url = await savePhoto(file).catch(() => null);
    if (url) {
      await prisma.incidentPhoto.create({
        data: { incidentId: incident.id, url },
      });
    }
  }

  const reportable = isReportableIncident(type);
  await notifyManagers({
    tenantId: session.tenantId,
    type: "INCIDENT_REPORTED",
    title: reportable
      ? `⚠ Reportable incident: ${incidentLabel(type)}`
      : `Incident reported: ${incidentLabel(type)}`,
    body: `${session.name} filed an incident report.`,
    url: `/incidents/${incident.id}`,
  });

  revalidatePath("/my-shifts/incidents");
  revalidatePath("/incidents");
  return { ok: true, id: incident.id };
}
