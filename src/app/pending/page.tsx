import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutAction } from "@/app/(app)/actions";

export const dynamic = "force-dynamic";

/**
 * Landing screen for a signed-in but not-yet-approved worker. Status is read
 * live from the DB (not the JWT), so as soon as an admin approves them a simple
 * page refresh sends them straight to their shifts — no re-login needed.
 */
export default async function PendingPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { status: true, role: true, name: true },
  });
  if (!user) redirect("/login");

  if (user.status === "APPROVED") {
    redirect(user.role === "WORKER" ? "/my-shifts" : "/dashboard");
  }

  const declined = user.status === "REJECTED";

  return (
    <div className="flex min-h-screen items-center justify-center px-4 bg-[var(--background)]">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-blue-100 opacity-40 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-green-100 opacity-40 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm rounded-3xl border border-[var(--border)] bg-white p-8 text-center shadow-lg">
        <div
          className={`mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full ${
            declined ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"
          }`}
        >
          <span className="material-symbols-rounded text-4xl">
            {declined ? "block" : "hourglass_top"}
          </span>
        </div>

        {declined ? (
          <>
            <h1 className="mb-2 text-xl font-bold text-[var(--text-primary)]">
              Account not approved
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Your sign-up request was declined. If you think this is a mistake,
              please contact your manager.
            </p>
          </>
        ) : (
          <>
            <h1 className="mb-2 text-xl font-bold text-[var(--text-primary)]">
              Waiting for approval
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Thanks {session.name.split(" ")[0]} — your manager has been notified.
              You'll be able to see your shifts as soon as your account is
              approved.
            </p>
            <a
              href="/pending"
              className="mt-6 inline-block w-full rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:opacity-90"
            >
              Check again
            </a>
          </>
        )}

        <form action={logoutAction} className="mt-3">
          <button className="text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
