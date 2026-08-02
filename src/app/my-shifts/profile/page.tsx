import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/format";
import { reliabilityOf } from "@/lib/reliability";
import { leaveTaken } from "@/lib/leave";
import { logoutAction } from "@/app/(app)/actions";
import { AvatarUpload } from "@/components/worker/AvatarUpload";
import { ReliabilityCard } from "@/components/worker/ReliabilityCard";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.staffId) redirect("/dashboard");

  const account = await prisma.user.findUnique({
    where: { id: session.id },
    select: { status: true },
  });
  if (!account || account.status !== "APPROVED") redirect("/pending");

  const [tenant, staff, ratedShifts, lateNotices] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.tenantId } }),
    prisma.staff.findUnique({
      where: { id: session.staffId },
      include: { branch: true },
    }),
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
  ]);

  const cfg = {
    lateGraceMin: tenant?.lateGraceMin ?? 5,
    earlyFinishGraceMin: tenant?.earlyFinishGraceMin ?? 5,
    lateFinishGraceMin: tenant?.lateFinishGraceMin ?? 15,
    ratingGreenAt: tenant?.ratingGreenAt ?? 85,
    ratingAmberAt: tenant?.ratingAmberAt ?? 65,
    lateNoticePenalty: tenant?.lateNoticePenalty ?? 2,
  };
  const rating = reliabilityOf(ratedShifts, lateNotices, cfg);

  // Leave balance (only shown if the office has switched it on).
  const showLeave = !!tenant?.showLeaveBalance;
  const leave = showLeave
    ? await leaveTaken(session.tenantId, session.staffId, new Date().getFullYear())
    : null;

  const fullName = staff
    ? `${staff.firstName} ${staff.lastName}`
    : session.name;
  const initials = staff
    ? `${staff.firstName.charAt(0)}${staff.lastName.charAt(0)}`
    : session.name.charAt(0);

  return (
    <div className="space-y-4 p-4">
      {/* Identity card */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <AvatarUpload photoUrl={staff?.photoUrl ?? null} initials={initials} />
        <h1 className="mt-3 text-xl font-bold text-slate-900">{fullName}</h1>
        <p className="text-sm text-slate-500">
          {staff?.title || "Support Worker"}
          {staff?.branch ? ` · ${staff.branch.name}` : ""}
        </p>
        {staff?.employmentType && (
          <span className="mt-2 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {staff.employmentType.charAt(0) +
              staff.employmentType.slice(1).toLowerCase()}
          </span>
        )}
      </section>

      {/* Reliability — same modern card + View popup as the Time Clock */}
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

      {/* Leave balance — only when the office has enabled it */}
      {showLeave && leave && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            My leave ({new Date().getFullYear()})
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <LeaveBar
              label="Annual leave"
              taken={leave.annualTaken}
              total={tenant?.annualLeaveDays ?? 0}
            />
            <LeaveBar
              label="Sick leave"
              taken={leave.sickTaken}
              total={tenant?.sickLeaveDays ?? 0}
            />
          </div>
        </section>
      )}

      {/* Details */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <Row icon="mail" label="Email" value={staff?.email || session.email} />
        {staff?.phone && <Row icon="call" label="Mobile" value={staff.phone} />}
        {staff?.clearanceExpiry && (
          <Row
            icon="verified_user"
            label={staff.clearanceType || "Clearance"}
            value={`Expires ${fmtDate(staff.clearanceExpiry)}`}
          />
        )}
      </section>

      {/* Quick links */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <LinkRow href="/my-shifts/summary" icon="schedule" label="My hours & mileage" />
        <LinkRow href="/install" icon="install_mobile" label="Get the app on my phone" />
      </section>

      {/* Sign out */}
      <form action={logoutAction}>
        <button className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white py-3.5 text-sm font-semibold text-red-600 shadow-sm transition hover:bg-red-50">
          <span className="material-symbols-rounded text-[20px]">logout</span>
          Sign out
        </button>
      </form>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5 last:border-0">
      <span className="material-symbols-rounded text-[20px] text-slate-400">{icon}</span>
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
          {label}
        </div>
        <div className="truncate text-sm font-medium text-slate-800">{value}</div>
      </div>
    </div>
  );
}

function LeaveBar({
  label,
  taken,
  total,
}: {
  label: string;
  taken: number;
  total: number;
}) {
  const remaining = Math.max(0, total - taken);
  const pct = total > 0 ? Math.min(100, (taken / total) * 100) : 0;
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <div className="text-xs font-semibold text-slate-600">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-2xl font-bold text-slate-900">{remaining}</span>
        <span className="text-xs text-slate-400">/ {total} left</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-1.5 rounded-full"
          style={{ width: `${pct}%`, background: "var(--brand)" }}
        />
      </div>
      <div className="mt-1 text-[11px] text-slate-400">{taken} taken</div>
    </div>
  );
}

function LinkRow({
  href,
  icon,
  label,
}: {
  href: string;
  icon: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5 transition last:border-0 hover:bg-slate-50"
    >
      <span className="material-symbols-rounded text-[20px] text-[var(--brand)]">{icon}</span>
      <span className="flex-1 text-sm font-medium text-slate-800">{label}</span>
      <span className="material-symbols-rounded text-[20px] text-slate-300">chevron_right</span>
    </Link>
  );
}
