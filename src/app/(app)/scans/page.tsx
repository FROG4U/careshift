import Link from "next/link";
import { redirect } from "next/navigation";
import { requireScope } from "@/lib/tenant";
import { isManager } from "@/lib/roles";
import { opsWhere } from "@/lib/scope";
import { prisma } from "@/lib/prisma";
import { fmtDate, fmtTime } from "@/lib/format";
import { DEFAULT_GEOFENCE_FT } from "@/lib/constants";

export const dynamic = "force-dynamic";

const FT_PER_M = 3.28084;

/**
 * Every scan of a clock-in card, with the ones worth a second look first.
 *
 * The card proves someone stood at a participant's door, but only if the
 * phone also said where it was. A scan with no position, or one taken a
 * suburb away, is the only way the feature can be cheated - so rather than
 * leave those buried one participant at a time, they get a page.
 *
 * Deliberately a review tool, not an accusation: most blanks are a phone in
 * a basement, which is the very situation the cards were built for. The
 * worker's own reason sits beside each one.
 */
export default async function ScansPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; only?: string }>;
}) {
  const { tenant, session, scope } = await requireScope();
  if (!isManager(session.role)) redirect("/dashboard");

  const { days, only } = await searchParams;
  const windowDays = Math.min(180, Math.max(1, Number(days) || 30));
  const problemsOnly = only === "problems";

  // A server component, re-rendered per request: "the last 30 days" has no
  // meaning without reading the clock.
  // eslint-disable-next-line react-hooks/purity -- not a render in the React sense
  const since = new Date(Date.now() - windowDays * 24 * 3_600_000);

  const scans = await prisma.qrScan.findMany({
    where: {
      tenantId: tenant.id,
      scannedAt: { gte: since },
      client: { ...opsWhere(scope) },
    },
    orderBy: { scannedAt: "desc" },
    take: 500,
    include: {
      client: { select: { firstName: true, lastName: true, geofenceFt: true, lat: true } },
      staff: { select: { firstName: true, lastName: true } },
    },
  });

  type Judged = (typeof scans)[number] & {
    radiusM: number;
    noLocation: boolean;
    farAway: boolean;
  };

  const judged: Judged[] = scans.map((s) => {
    const radiusM = (s.client.geofenceFt ?? DEFAULT_GEOFENCE_FT) / FT_PER_M;
    return {
      ...s,
      radiusM,
      noLocation: s.lat == null,
      farAway: s.distanceM != null && s.distanceM > radiusM,
    };
  });

  const problems = judged.filter((s) => s.noLocation || s.farAway);
  const shown = problemsOnly ? problems : judged;

  // Who it keeps happening to. One blank is a basement; ten is a conversation.
  const byWorker = new Map<string, number>();
  for (const s of problems) {
    const name = `${s.staff.firstName} ${s.staff.lastName}`;
    byWorker.set(name, (byWorker.get(name) ?? 0) + 1);
  }
  const repeat = [...byWorker.entries()]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1]);

  const tab = (label: string, href: string, active: boolean) => (
    <Link
      href={href}
      className={`rounded-xl px-3.5 py-2 text-sm font-semibold ${
        active
          ? "bg-[var(--brand)] text-white"
          : "border border-[var(--border)] bg-white text-[var(--text-primary)]"
      }`}
    >
      {label}
    </Link>
  );

  const distanceLabel = (s: Judged) => {
    if (s.noLocation) return "no location";
    if (s.distanceM == null) return "position recorded";
    if (s.distanceM <= s.radiusM) return "at the home";
    return s.distanceM < 1000
      ? `${Math.round(s.distanceM)} m away`
      : `${(s.distanceM / 1000).toFixed(1)} km away`;
  };

  return (
    <div className="p-6 lg:p-8">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Card scans
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Every scan of a clock-in card in the last {windowDays}{" "}
          days. A scan
          records the time and, where the phone can get one, the position and
          how far that is from the participant&apos;s home. The ones without a
          position are the ones that could have been taken anywhere.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap gap-2">
        {tab(
          `Everything (${judged.length})`,
          `/scans?days=${windowDays}`,
          !problemsOnly,
        )}
        {tab(
          `Worth a look (${problems.length})`,
          `/scans?days=${windowDays}&only=problems`,
          problemsOnly,
        )}
        <span className="ml-auto flex gap-2">
          {[7, 30, 90].map((d) =>
            tab(
              `${d} days`,
              `/scans?days=${d}${problemsOnly ? "&only=problems" : ""}`,
              windowDays === d,
            ),
          )}
        </span>
      </div>

      {repeat.length > 0 && (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="flex items-center gap-2 font-semibold text-amber-900">
            <span className="material-symbols-rounded text-[20px]">person_alert</span>
            Keeps happening
          </p>
          <p className="mt-1 text-sm text-amber-900">
            One scan without a position is a phone in a basement. A pattern is
            worth asking about.
          </p>
          <ul className="mt-2 space-y-0.5 text-sm text-amber-900">
            {repeat.map(([name, n]) => (
              <li key={name}>
                <span className="font-semibold">{name}</span> - {n} scans worth
                a look
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3 font-medium">Scanned</th>
              <th className="px-5 py-3 font-medium">Worker</th>
              <th className="px-5 py-3 font-medium">Participant</th>
              <th className="px-5 py-3 font-medium">In / out</th>
              <th className="px-5 py-3 font-medium">Where</th>
              <th className="px-5 py-3 font-medium">Sent</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((s) => (
              <tr
                key={s.id}
                className={s.noLocation || s.farAway ? "bg-amber-50/60" : ""}
              >
                <td className="whitespace-nowrap px-5 py-3 font-medium text-slate-800">
                  {fmtDate(s.scannedAt)} {fmtTime(s.scannedAt)}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-slate-700">
                  {s.staff.firstName} {s.staff.lastName}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-slate-700">
                  {s.client.firstName} {s.client.lastName}
                </td>
                <td className="whitespace-nowrap px-5 py-3">
                  {s.outcome === "CLOCKED_IN" ? (
                    <span className="font-medium text-emerald-700">in</span>
                  ) : s.outcome === "CLOCKED_OUT" ? (
                    <span className="font-medium text-blue-700">out</span>
                  ) : (
                    <span className="font-medium text-slate-500">
                      no shift matched
                    </span>
                  )}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={
                      s.noLocation || s.farAway
                        ? "font-semibold text-amber-800"
                        : "text-slate-600"
                    }
                  >
                    {distanceLabel(s)}
                  </span>
                  {s.noLocationReason && (
                    <div className="text-xs text-slate-500">
                      &ldquo;{s.noLocationReason}&rdquo;
                    </div>
                  )}
                  {s.client.lat == null && (
                    <div className="text-xs text-slate-400">
                      no address pin set for this participant
                    </div>
                  )}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-slate-500">
                  {s.offline ? (
                    <>
                      held, sent {fmtTime(s.syncedAt)}
                      {s.driftSec != null && Math.abs(s.driftSec) > 300 && (
                        <div className="text-xs text-amber-700">
                          phone clock {Math.abs(Math.round(s.driftSec / 60))} min{" "}
                          {s.driftSec > 0 ? "ahead" : "behind"}
                        </div>
                      )}
                    </>
                  ) : (
                    "straight away"
                  )}
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-slate-400">
                  {problemsOnly
                    ? "Nothing worth a look in this period. Every scan had a position and was at the home."
                    : "No card scans in this period."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
