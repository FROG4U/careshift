import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { isManager } from "@/lib/roles";
import { fmtDateTime } from "@/lib/format";
import {
  incidentLabel,
  INCIDENT_STATUSES,
  INCIDENT_STATUS_LABELS,
  INCIDENT_SEVERITY_LABELS,
  type IncidentSeverity,
  type IncidentStatus,
} from "@/lib/constants";
import { updateIncident } from "../actions";

export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { tenant, session } = await requireTenant();
  if (!isManager(session.role)) redirect("/dashboard");

  const { id } = await params;
  const incident = await prisma.incident.findFirst({
    where: { id, tenantId: tenant.id },
    include: {
      client: true,
      staff: true,
      branch: true,
      shift: true,
      photos: true,
      reportedBy: { select: { name: true, email: true } },
    },
  });
  if (!incident) notFound();

  const Row = ({
    label,
    children,
  }: {
    label: string;
    children: React.ReactNode;
  }) => (
    <div className="border-b border-slate-100 py-3 last:border-0">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
        {children}
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-8">
      <Link
        href="/incidents"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <span className="material-symbols-rounded text-[18px]">arrow_back</span>
        Incident records
      </Link>

      <header className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {incidentLabel(incident.type)}
          </h1>
          {incident.reportable && (
            <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">
              NDIS reportable
            </span>
          )}
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
            {INCIDENT_STATUS_LABELS[incident.status as IncidentStatus] ??
              incident.status}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Reported by {incident.reportedBy.name} ·{" "}
          {fmtDateTime(incident.createdAt)}
        </p>
      </header>

      {incident.reportable && incident.status !== "CLOSED" && (
        <div className="mb-5 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4">
          <span className="material-symbols-rounded text-red-600">gavel</span>
          <p className="text-sm text-red-800">
            <strong>This is a reportable incident.</strong> It must be notified
            to the NDIS Quality and Safeguards Commission — within 24 hours for
            death, serious injury, abuse or neglect, unlawful contact and
            sexual misconduct; within 5 business days for unauthorised
            restrictive practice. Recording it here does not notify the
            Commission for you.
          </p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <Row label="What happened">{incident.description}</Row>
          <Row label="When">{fmtDateTime(incident.occurredAt)}</Row>
          {incident.location && <Row label="Where">{incident.location}</Row>}
          <Row label="Severity">
            {INCIDENT_SEVERITY_LABELS[incident.severity as IncidentSeverity] ??
              incident.severity}
          </Row>
          {incident.immediateAction && (
            <Row label="Action taken straight away">
              {incident.immediateAction}
            </Row>
          )}
          {incident.injuries && <Row label="Injuries">{incident.injuries}</Row>}
          <Row label="Medical treatment">
            {incident.medicalTreatment
              ? incident.medicalDetail || "Yes"
              : "No treatment needed"}
          </Row>
          {incident.witnesses && (
            <Row label="Witnesses">{incident.witnesses}</Row>
          )}
          <Row label="Police">
            {incident.policeNotified
              ? `Called${incident.policeReference ? ` · ref ${incident.policeReference}` : ""}`
              : "Not called"}
          </Row>
          <Row label="Family / guardian notified">
            {incident.familyNotified ? "Yes" : "Not yet"}
          </Row>

          {incident.photos.length > 0 && (
            <div className="pt-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Photos
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {incident.photos.map((p) => (
                  <a
                    key={p.id}
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block overflow-hidden rounded-xl border border-slate-200"
                  >
                    <Image
                      src={p.url}
                      alt="Incident photo"
                      width={400}
                      height={300}
                      className="h-32 w-full object-cover"
                      unoptimized
                    />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 font-semibold text-slate-900">Who</h2>
            <Row label="Participant">
              {incident.client
                ? `${incident.client.firstName} ${incident.client.lastName}`
                : "Not about a participant"}
            </Row>
            <Row label="Worker">
              {incident.staff
                ? `${incident.staff.firstName} ${incident.staff.lastName}`
                : incident.reportedBy.name}
            </Row>
            {incident.branch && <Row label="Branch">{incident.branch.name}</Row>}
            {incident.shift && (
              <Row label="During shift">
                {fmtDateTime(incident.shift.start)}
              </Row>
            )}
          </div>

          <form
            action={updateIncident}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <input type="hidden" name="id" value={incident.id} />
            <h2 className="mb-3 font-semibold text-slate-900">Office review</h2>

            <label className="mb-1.5 block text-sm font-semibold text-slate-700">
              Status
            </label>
            <select
              name="status"
              defaultValue={incident.status}
              className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {INCIDENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {INCIDENT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>

            <label className="mb-1.5 block text-sm font-semibold text-slate-700">
              Findings / follow-up
            </label>
            <textarea
              name="reviewNotes"
              rows={5}
              defaultValue={incident.reviewNotes ?? ""}
              placeholder="What was done, who was contacted, any changes made."
              className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />

            <button className="w-full rounded-lg bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white">
              Save review
            </button>

            {incident.reviewedAt && (
              <p className="mt-2 text-center text-xs text-slate-400">
                Last updated {fmtDateTime(incident.reviewedAt)}
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
