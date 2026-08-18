import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtDateTime } from "@/lib/format";
import {
  incidentLabel,
  INCIDENT_STATUS_LABELS,
  type IncidentStatus,
} from "@/lib/constants";

export default async function MyIncidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filed?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { filed } = await searchParams;

  const incidents = await prisma.incident.findMany({
    where: { tenantId: session.tenantId, reportedById: session.id },
    include: { client: true, photos: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-4 p-4">
      {filed && (
        <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <span className="material-symbols-rounded text-emerald-600">
            check_circle
          </span>
          <p className="text-sm text-emerald-800">
            <strong>Report sent.</strong> The office has been notified and will
            follow up with you.
          </p>
        </div>
      )}

      <Link
        href="/my-shifts/incidents/new"
        className="flex items-center justify-center gap-2 rounded-2xl bg-[var(--brand)] px-4 py-4 text-base font-bold text-white shadow-sm active:scale-[0.99]"
      >
        <span className="material-symbols-rounded">report</span>
        Report an incident
      </Link>

      {incidents.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
          You haven&apos;t reported any incidents. Anything you report appears
          here so you can see what happened with it.
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="px-1 text-sm font-bold uppercase tracking-wide text-slate-500">
            My reports
          </h2>
          {incidents.map((i) => (
            <div
              key={i.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900">
                    {incidentLabel(i.type)}
                  </div>
                  <div className="text-xs text-slate-500">
                    {fmtDateTime(i.occurredAt)}
                    {i.client && ` · ${i.client.firstName} ${i.client.lastName}`}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
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

              {i.reportable && (
                <span className="mt-2 inline-block rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">
                  NDIS reportable
                </span>
              )}

              <p className="mt-2 line-clamp-3 text-sm text-slate-600">
                {i.description}
              </p>

              {i.photos.length > 0 && (
                <div className="mt-2 flex items-center gap-1 text-xs text-slate-400">
                  <span className="material-symbols-rounded text-[16px]">image</span>
                  {i.photos.length} photo{i.photos.length === 1 ? "" : "s"}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
