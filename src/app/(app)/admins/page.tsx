import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { isAdmin, isSuperAdmin } from "@/lib/roles";
import { ROLE_LABELS } from "@/lib/constants";
import { CopyLink } from "./CopyLink";
import {
  createAdminInvite,
  revokeInvite,
  approveAdmin,
  rejectAdmin,
  setAdminRole,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminsPage() {
  const { tenant, session } = await requireTenant();
  if (!isAdmin(session.role)) redirect("/dashboard");

  // Regular admins only see their own account. Managing other admins (invite,
  // approve, promote) is super-admin only.
  if (!isSuperAdmin(session.role)) {
    return (
      <div className="max-w-3xl p-6 lg:p-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Admin
          </h1>
          <p className="text-sm text-slate-500">Your admin account.</p>
        </header>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {session.name}
              </p>
              <p className="text-xs text-slate-500">{session.email}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
              {ROLE_LABELS[session.role as keyof typeof ROLE_LABELS] ??
                session.role}
            </span>
          </div>
          <p className="mt-4 border-t border-slate-100 pt-4 text-xs text-slate-400">
            Only a super admin can invite new admins or change roles.
          </p>
        </section>
      </div>
    );
  }

  const [admins, pendingAdmins, invites] = await Promise.all([
    prisma.user.findMany({
      where: {
        tenantId: tenant.id,
        role: { in: ["ADMIN", "SUPER_ADMIN"] },
        status: "APPROVED",
      },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: { id: true, name: true, email: true, role: true },
    }),
    prisma.user.findMany({
      where: {
        tenantId: tenant.id,
        role: { in: ["ADMIN", "SUPER_ADMIN"] },
        status: "PENDING",
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, role: true },
    }),
    prisma.adminInvite.findMany({
      where: { tenantId: tenant.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const h = await headers();
  const host = h.get("host") ?? "";
  const proto = host.includes("localhost") ? "http" : "https";
  const base = `${proto}://${host}`;

  return (
    <div className="max-w-3xl p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Admins
        </h1>
        <p className="text-sm text-slate-500">
          Invite new admins, approve requests, and manage who is a super admin.
        </p>
      </header>

      {/* Invite an admin */}
      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900">Invite an admin</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Creates a private link. They open it, set a password, then you approve
          them below.
        </p>
        <form
          action={createAdminInvite}
          className="mt-3 flex flex-wrap items-end gap-3"
        >
          <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
            Email
            <input
              name="email"
              type="email"
              required
              placeholder="name@company.com"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#003146] focus:ring-2 focus:ring-[#003146]/15"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Name (optional)
            <input
              name="name"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#003146] focus:ring-2 focus:ring-[#003146]/15"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Role
            <select
              name="role"
              defaultValue="ADMIN"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#003146] focus:ring-2 focus:ring-[#003146]/15"
            >
              <option value="ADMIN">Admin</option>
              <option value="SUPER_ADMIN">Super Admin</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm"
            style={{ background: "var(--brand)" }}
          >
            Create link
          </button>
        </form>

        {invites.length > 0 && (
          <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            {invites.map((inv) => (
              <div key={inv.id} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-slate-700">
                    {inv.email}
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                      {ROLE_LABELS[inv.role as keyof typeof ROLE_LABELS] ?? inv.role}
                    </span>
                  </p>
                  <form action={revokeInvite}>
                    <input type="hidden" name="id" value={inv.id} />
                    <button className="text-xs font-semibold text-red-600 hover:underline">
                      Revoke
                    </button>
                  </form>
                </div>
                <CopyLink url={`${base}/invite/${inv.token}`} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Awaiting approval */}
      {pendingAdmins.length > 0 && (
        <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/50 p-5">
          <h2 className="text-sm font-bold text-slate-900">Awaiting your approval</h2>
          <div className="mt-3 space-y-3">
            {pendingAdmins.map((u) => (
              <div
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white p-3"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{u.name}</p>
                  <p className="text-xs text-slate-500">
                    {u.email} ·{" "}
                    {ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] ?? u.role}
                  </p>
                </div>
                <div className="flex gap-2">
                  <form action={approveAdmin}>
                    <input type="hidden" name="userId" value={u.id} />
                    <button
                      className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
                      style={{ background: "var(--brand)" }}
                    >
                      Approve
                    </button>
                  </form>
                  <form action={rejectAdmin}>
                    <input type="hidden" name="userId" value={u.id} />
                    <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                      Decline
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Current admins */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900">Current admins</h2>
        <div className="mt-3 divide-y divide-slate-100">
          {admins.map((u) => {
            const isSuper = u.role === "SUPER_ADMIN";
            const isMe = u.id === session.id;
            return (
              <div
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {u.name}
                    {isMe && (
                      <span className="ml-2 text-xs font-normal text-slate-400">
                        (you)
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">{u.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      isSuper
                        ? "bg-[#003146] text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] ?? u.role}
                  </span>
                  {!isMe && (
                    <form action={setAdminRole}>
                      <input type="hidden" name="userId" value={u.id} />
                      <input
                        type="hidden"
                        name="role"
                        value={isSuper ? "ADMIN" : "SUPER_ADMIN"}
                      />
                      <button className="text-xs font-semibold text-[#886949] hover:underline">
                        {isSuper ? "Make admin" : "Make super admin"}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
