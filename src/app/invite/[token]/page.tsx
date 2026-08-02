import { prisma } from "@/lib/prisma";
import { ROLE_LABELS } from "@/lib/constants";
import { AcceptInvite } from "./AcceptInvite";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invite = await prisma.adminInvite.findFirst({
    where: { token, status: "PENDING" },
  });

  const tenant = invite
    ? await prisma.tenant.findUnique({
        where: { id: invite.tenantId },
        select: { name: true, logoUrl: true },
      })
    : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {tenant?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tenant.logoUrl}
              alt={tenant.name}
              className="mx-auto mb-4 h-16 w-16 rounded-3xl shadow-md"
            />
          ) : (
            <div
              className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl text-2xl font-bold text-white shadow-md"
              style={{ background: "#003146" }}
            >
              {(tenant?.name ?? "C")[0]}
            </div>
          )}
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {tenant?.name ?? "CareShift"}
          </h1>
          {invite && (
            <p className="mt-1 text-sm text-slate-500">
              You&apos;ve been invited to join as{" "}
              {ROLE_LABELS[invite.role as keyof typeof ROLE_LABELS] ??
                invite.role}
              .
            </p>
          )}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-lg">
          {!invite ? (
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <span className="material-symbols-rounded text-2xl">link_off</span>
              </div>
              <p className="font-semibold text-slate-800">Invite not valid</p>
              <p className="mt-1 text-sm text-slate-500">
                This link has expired, been used, or was revoked. Ask a super
                admin for a fresh invite.
              </p>
            </div>
          ) : (
            <>
              <h2 className="mb-5 text-lg font-bold text-slate-900">
                Set up your admin account
              </h2>
              <AcceptInvite
                token={invite.token}
                email={invite.email}
                defaultName={invite.name ?? ""}
                roleLabel={
                  ROLE_LABELS[invite.role as keyof typeof ROLE_LABELS] ??
                  invite.role
                }
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
