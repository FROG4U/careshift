import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireScope } from "@/lib/tenant";
import { isSuperAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { fmtDate, fmtTime } from "@/lib/format";
import { KeyManager, type KeyRow } from "./KeyManager";

export const dynamic = "force-dynamic";

/**
 * The door another system reads PCG's data through.
 *
 * Super admin only. One key here is one key to every shift, note, wage figure
 * and participant record, so the page is deliberately plain about that, keeps
 * a log of what has been taken, and makes rotating easy enough that nobody is
 * tempted to leave a suspect key in place.
 */
export default async function ApiAccessPage() {
  const { tenant, session, scope } = await requireScope();
  if (!scope.headOffice) redirect("/dashboard");
  if (!isSuperAdmin(session.role)) redirect("/settings");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3100";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const apiBase = `${proto}://${host}/api/export`;

  // Same as below: this page is re-rendered per request, and "the last seven
  // days" needs the clock.
  // eslint-disable-next-line react-hooks/purity -- not a render in the React sense
  const weekAgo = new Date(Date.now() - 7 * 24 * 3_600_000);
  const [tokens, recent] = await Promise.all([
    prisma.apiToken.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { requests: { where: { createdAt: { gte: weekAgo } } } } },
      },
    }),
    prisma.apiRequest.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { token: { select: { name: true, prefix: true } } },
    }),
  ]);

  // What has actually been taken, per dataset. Read from the last few hundred
  // calls and reduced here rather than one query per dataset: the answer to
  // "has my change reached Omexx yet" should not cost thirteen round trips.
  const history = await prisma.apiRequest.findMany({
    where: { tenantId: tenant.id, status: 200 },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { path: true, rows: true, createdAt: true },
  });

  const lastPull = new Map<string, { at: Date; rows: number; calls: number }>();
  for (const r of history) {
    // Files are fetched one at a time and would swamp the list.
    if (r.path.startsWith("/api/export/files/")) continue;
    const name = r.path.replace("/api/export", "").replace(/^\//, "") || "index";
    const seen = lastPull.get(name);
    if (seen) {
      seen.calls += 1;
    } else {
      lastPull.set(name, { at: r.createdAt, rows: r.rows ?? 0, calls: 1 });
    }
  }
  const taken = [...lastPull.entries()].sort((a, b) =>
    b[1].at.getTime() - a[1].at.getTime(),
  );

  const when = (d: Date) => `${fmtDate(d)} ${fmtTime(d)}`;
  // A server component rendered fresh on every request, so reading the clock
  // here is the point - "has this key expired yet" has no answer without it.
  // eslint-disable-next-line react-hooks/purity -- not a render in the React sense
  const now = Date.now();

  const keys: KeyRow[] = tokens.map((t) => ({
    id: t.id,
    name: t.name,
    prefix: t.prefix,
    createdBy: t.createdBy,
    createdLabel: fmtDate(t.createdAt),
    expiresLabel: t.expiresAt ? fmtDate(t.expiresAt) : null,
    lastUsedLabel: t.lastUsedAt ? when(t.lastUsedAt) : null,
    retiresLabel: t.retiresAt ? when(t.retiresAt) : null,
    state: t.revokedAt
      ? "off"
      : t.expiresAt && t.expiresAt.getTime() <= now
        ? "expired"
        : t.retiresAt && t.retiresAt.getTime() <= now
          ? "expired"
          : t.retiresAt
            ? "retiring"
            : "active",
    calls: t._count.requests,
    notifyUrl: t.notifyUrl ?? "",
    notifiedLabel: t.notifiedAt ? when(t.notifiedAt) : null,
    notifyResult: t.notifyResult ?? null,
  }));

  return (
    <div className="mx-auto max-w-3xl px-5 py-6">
      <Link
        href="/settings"
        className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--text-secondary)]"
      >
        <span className="material-symbols-rounded text-[18px]">arrow_back</span>
        Settings
      </Link>

      <h1 className="text-2xl font-bold text-[var(--text-primary)]">
        Data export (API)
      </h1>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        A read-only way for another system to pull PCG&apos;s data out of here on
        a schedule - shifts, shift notes, timesheets, payroll lines, workers and
        participants. Nothing that uses this key can change anything.
      </p>

      <section className="mt-6">
        <KeyManager keys={keys} apiBase={apiBase} />
      </section>

      {/* ── What the other end actually holds ── */}
      {taken.length > 0 && (
        <section className="mt-10">
          <h2 className="font-semibold text-[var(--text-primary)]">
            What Omexx has taken
          </h2>
          <p className="mb-3 text-sm text-[var(--text-secondary)]">
            The last successful pull of each dataset. This is how you tell
            whether a change you made has reached them yet.
          </p>
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  <th className="px-4 py-2 font-semibold">Dataset</th>
                  <th className="px-4 py-2 font-semibold">Last taken</th>
                  <th className="px-4 py-2 font-semibold">Rows that time</th>
                  <th className="px-4 py-2 font-semibold">Pulls</th>
                </tr>
              </thead>
              <tbody>
                {taken.map(([name, info]) => (
                  <tr key={name} className="border-b border-[var(--border)]/60 last:border-0">
                    <td className="px-4 py-2 font-medium text-[var(--text-primary)]">
                      {name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-[var(--text-secondary)]">
                      {when(info.at)}
                    </td>
                    <td className="px-4 py-2 text-[var(--text-secondary)]">
                      {info.rows}
                    </td>
                    <td className="px-4 py-2 text-[var(--text-muted)]">
                      {info.calls}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── What has been taken ── */}
      <section className="mt-10">
        <h2 className="font-semibold text-[var(--text-primary)]">Recent calls</h2>
        <p className="mb-3 text-sm text-[var(--text-secondary)]">
          The last 25. Worth a glance now and then: a call from an address you
          do not recognise is the reason this log exists.
        </p>

        {recent.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            Nothing has used the key yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-white">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  <th className="px-4 py-2 font-semibold">When</th>
                  <th className="px-4 py-2 font-semibold">Key</th>
                  <th className="px-4 py-2 font-semibold">Asked for</th>
                  <th className="px-4 py-2 font-semibold">Rows</th>
                  <th className="px-4 py-2 font-semibold">From</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--border)]/60">
                    <td className="whitespace-nowrap px-4 py-2 text-[var(--text-primary)]">
                      {when(r.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-[var(--text-secondary)]">
                      {r.token?.name ?? "unknown"}
                    </td>
                    <td className="px-4 py-2">
                      <span className="font-medium text-[var(--text-primary)]">
                        {r.path.replace("/api/export", "") || "/"}
                      </span>
                      {r.status !== 200 && (
                        <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">
                          refused
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-[var(--text-secondary)]">
                      {r.rows ?? "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-[var(--text-muted)]">
                      {r.ip ?? "-"}
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
