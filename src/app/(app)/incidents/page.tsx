import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { isManager } from "@/lib/roles";
import { fmtDateTime } from "@/lib/format";
import {
  incidentLabel,
  INCIDENT_STATUS_LABELS,
  type IncidentStatus,
} from "@/lib/constants";

export const dynamic = "force-dynamic";

/** The provider's incident register. */
export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; only?: string }>;
}) {
  const { tenant, session } = await requireTenant();
  if (!isManager(session.role)) redirect("/dashboard");

  const { status, only } = await searchParams;

  const incidents = await prisma.incident.findMany({
    where: {
      tenantId: tenant.id,
      ...(status && status !== "ALL" ? { status } : {}),
      ...(only === "reportable" ? { reportable: true } : {}),
    },
    include: {
      client: true,
      staff: true,
      reportedBy: { select: { name: true } },
      photos: { select: { id: true } },
      branch: { select: { name: true } },
    },
    orderBy: [{ status: "asc" }, { occurredAt: "desc" }],
  });

  const counts = {
    all: await prisma.incident.count({ where: { tenantId: tenant.id } }),
    open: await prisma.incident.count({
      where: { tenantId: tenant.id, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
    }),
    reportable: await prisma.incident.count({
      where: { tenantId: tenant.id, reportable: true },
    }),
  };

  const Tab = ({
    href,
    label,
    active,
  }: {
    href: string;
    label: string;
    active: boolean;
  }) => (
    <Link
      href={href}
      className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
        active
          ? "bg-[var(--brand)] text-white"
          : "bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="p-6 lg:p-8">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Incident records
        </h1>
        <p className="text-sm text-slate-500">
          Every incident reported by staff. Reportable incidents must be
          notified to the NDIS Commission — 24 hours for most categories,
          5 business days for the rest.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap gap-2">
        <Tab href="/incidents" label={`All (${counts.all})`} active={!status && !only} />
        <Tab
          href="/incidents?status=SUBMITTED"
          label="New"
          active={status === "SUBMITTED"}
        />
        <Tab
          href="/incidents?status=UNDER_REVIEW"
          label="Under review"
          active={status === "UNDER_REVIEW"}
        />
        <Tab
          href="/incidents?status=CLOSED"
          label="Closed"
          active={status === "CLOSED"}
        />
        <Tab
          href="/incidents?only=reportable"
          label={`NDIS reportable (${counts.reportable})`}
          active={only === "reportable"}
        />
      </div>

      {incidents.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
          No incidents recorded.
        </div>
      ) : (
        <div className="space-y-3">
          {incidents.map((i) => (
            <Link
              key={i.id}
              href={`/incidents/${i.id}`}
              className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">
                      {incidentLabel(i.type)}
                    </span>
                    {i.reportable && (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">
                        NDIS reportable
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        i.severity === "CRITICAL"
                          ? "bg-red-100 text-red-800"
                          : i.severity === "HIGH"
                            ? "bg-orange-50 text-orange-700"
                            : i.severity === "LOW"
                              ? "bg-slate-100 text-slate-600"
                              : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {i.severity}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {fmtDateTime(i.occurredAt)}
                    {i.client && ` · ${i.client.firstName} ${i.client.lastName}`}
                    {` · reported by ${i.reportedBy.name}`}
                    {i.branch?.name && ` · ${i.branch.name}`}
                  </div>
                  <p className="mt-2 line-clamp-2 max-w-3xl text-sm text-slate-600">
                    {i.description}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {i.photos.length > 0 && (
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <span className="material-symbols-rounded text-[16px]">
                        image
                      </span>
                      {i.photos.length}
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      i.status === "CLOSED"
                        ? "bg-slate-100 text-slate-600"
                        : i.status === "UNDER_REVIEW"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-blue-50 text-blue-700"
                    }`}
                  >
                    {INCIDENT_STATUS_LABELS[i.status as IncidentStatus] ?? i.status}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
