import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { requireScope } from "@/lib/tenant";
import { opsWhere } from "@/lib/scope";
import { isManager } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { qrUrlFor, DRIFT_WARN_SEC } from "@/lib/qrClock";
import { tzForState, fmtInTz } from "@/lib/timezone";
import { QrCardActions } from "./QrCardActions";

export const dynamic = "force-dynamic";

/** The app's own address, so the printed code points at the right place. */
async function originOf() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "https://shift.pristinecaregroup.au";
}

/**
 * A participant's clock-in card: the QR code that goes on their wall, and
 * every scan of it.
 *
 * The card is for homes with no mobile signal. A worker scans it on the way
 * in and on the way out; the scan is stamped with the phone's time and GPS
 * and held on the phone until there is a signal to send it. What it gives the
 * office is evidence of attendance that does not depend on coverage.
 */
export default async function ClientQrPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { tenant, session, scope } = await requireScope();
  if (!isManager(session.role)) redirect("/dashboard");

  const { id } = await params;
  const client = await prisma.client.findFirst({
    where: { id, tenantId: tenant.id, ...opsWhere(scope) },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      address: true,
      qrToken: true,
      qrIssuedAt: true,
      lat: true,
      lng: true,
      branch: { select: { state: true } },
    },
  });
  if (!client) notFound();

  const tz = tzForState(client.branch?.state ?? null);
  const name = `${client.firstName} ${client.lastName}`;
  const origin = await originOf();

  const svg = client.qrToken
    ? await QRCode.toString(qrUrlFor(origin, client.qrToken), {
        type: "svg",
        errorCorrectionLevel: "H",
        margin: 1,
      })
    : null;

  const scans = await prisma.qrScan.findMany({
    where: { tenantId: tenant.id, clientId: client.id },
    orderBy: { scannedAt: "desc" },
    take: 25,
    include: { staff: { select: { firstName: true, lastName: true } } },
  });

  const when = (d: Date) =>
    `${fmtInTz(d, tz, { weekday: "short", day: "numeric", month: "short" })}, ${fmtInTz(
      d,
      tz,
      { hour: "numeric", minute: "2-digit" },
    )}`;

  return (
    <div className="mx-auto max-w-4xl px-5 py-6">
      <Link
        href={`/clients/${client.id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--text-secondary)]"
      >
        <span className="material-symbols-rounded text-[18px]">arrow_back</span>
        {name}
      </Link>

      <h1 className="text-2xl font-bold text-[var(--text-primary)]">
        Clock-in card
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
        A code printed and left at {client.firstName}&apos;s home. Workers scan it
        in the app to start the shift and scan it again to finish. It works with
        no signal at all: the scan is kept on the phone with its time and
        location and sends itself once there are bars again.
      </p>

      <section className="mt-6 grid gap-6 md:grid-cols-[260px_1fr]">
        <div className="rounded-2xl border border-[var(--border)] bg-white p-5 text-center shadow-sm">
          {svg ? (
            <>
              <div
                className="mx-auto h-[200px] w-[200px] [&>svg]:h-full [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
              <p className="mt-3 text-xs text-[var(--text-muted)]">
                Card {client.qrToken!.slice(-6)}
                {client.qrIssuedAt && <> - issued {when(client.qrIssuedAt)}</>}
              </p>
            </>
          ) : (
            <div className="flex h-[200px] flex-col items-center justify-center gap-2 rounded-xl bg-[var(--background)] text-sm text-[var(--text-secondary)]">
              <span className="material-symbols-rounded text-[32px] text-[var(--text-muted)]">
                qr_code_2
              </span>
              No card yet
            </div>
          )}
        </div>

        <div>
          <div className="flex flex-wrap gap-2">
            <QrCardActions
              clientId={client.id}
              hasCard={!!client.qrToken}
              participantName={client.firstName}
            />
            {client.qrToken && (
              <a
                href={`/clients/${client.id}/qr/pdf`}
                className="flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white shadow-sm"
              >
                <span className="material-symbols-rounded text-[18px]">
                  download
                </span>
                Download the card (PDF)
              </a>
            )}
          </div>

          <ol className="mt-5 space-y-2 text-sm text-[var(--text-secondary)]">
            <li>
              <b className="text-[var(--text-primary)]">1.</b> Download the PDF
              and print it - one A4 page, black and white is fine.
            </li>
            <li>
              <b className="text-[var(--text-primary)]">2.</b> Put it somewhere
              by the front door, at about head height, out of direct sunlight.
            </li>
            <li>
              <b className="text-[var(--text-primary)]">3.</b> Tell the worker
              to tap <b>Scan card</b> in the app, not their phone camera.
            </li>
          </ol>

          {client.lat == null && (
            <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {client.firstName} has no address pin set, so a scan can record
              where the phone was but not how far that is from their home. Set
              the clock-in location on their profile to get both.
            </p>
          )}
        </div>
      </section>

      {/* ── The evidence trail ── */}
      <section className="mt-8 rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm">
        <h2 className="mb-1 font-semibold text-[var(--text-primary)]">
          Card scans
        </h2>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">
          Every scan of this card, including the ones that could not be matched
          to a shift.
        </p>

        {scans.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            Nothing scanned yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  <th className="py-2 pr-3 font-semibold">Scanned</th>
                  <th className="py-2 pr-3 font-semibold">Worker</th>
                  <th className="py-2 pr-3 font-semibold">What it did</th>
                  <th className="py-2 pr-3 font-semibold">At the home</th>
                  <th className="py-2 font-semibold">Sent</th>
                </tr>
              </thead>
              <tbody>
                {scans.map((s) => (
                  <tr key={s.id} className="border-b border-[var(--border)]/60">
                    <td className="py-2 pr-3 whitespace-nowrap font-medium text-[var(--text-primary)]">
                      {when(s.scannedAt)}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {s.staff.firstName} {s.staff.lastName}
                    </td>
                    <td className="py-2 pr-3">
                      {s.outcome === "CLOCKED_IN" ? (
                        <span className="font-semibold text-emerald-700">
                          Clocked in
                        </span>
                      ) : s.outcome === "CLOCKED_OUT" ? (
                        <span className="font-semibold text-blue-700">
                          Clocked out
                        </span>
                      ) : (
                        <span className="font-semibold text-amber-700">
                          No shift to match
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-[var(--text-secondary)]">
                      {s.distanceM == null
                        ? "no location"
                        : s.distanceM <= 150
                          ? "yes"
                          : `${(s.distanceM / 1000).toFixed(1)} km away`}
                    </td>
                    <td className="py-2 whitespace-nowrap text-[var(--text-secondary)]">
                      {s.offline ? (
                        <>
                          <span className="font-semibold text-[var(--text-primary)]">
                            later
                          </span>
                          <span className="block text-xs text-[var(--text-muted)]">
                            {when(s.syncedAt)}
                            {s.driftSec != null &&
                              Math.abs(s.driftSec) > DRIFT_WARN_SEC && (
                                <>
                                  {" "}
                                  - phone clock{" "}
                                  {Math.abs(Math.round(s.driftSec / 60))} min{" "}
                                  {s.driftSec > 0 ? "ahead" : "behind"}
                                </>
                              )}
                          </span>
                        </>
                      ) : (
                        "straight away"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
