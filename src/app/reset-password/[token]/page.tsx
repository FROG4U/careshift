import Link from "next/link";
import { tokenIsValid } from "@/app/forgot-password/actions";
import { ResetForm } from "./ResetForm";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const valid = await tokenIsValid(token);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background,#faf8f5)] p-6">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
          {valid ? (
            <>
              <h1 className="text-xl font-bold text-slate-900">
                Choose a new password
              </h1>
              <p className="mt-1.5 text-sm text-slate-500">
                Pick something you&apos;ll remember — at least 8 characters.
              </p>
              <div className="mt-5">
                <ResetForm token={token} />
              </div>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold text-slate-900">
                This link has expired
              </h1>
              <p className="mt-1.5 text-sm text-slate-500">
                Reset links work once and last an hour. Request a fresh one and
                we&apos;ll email it straight over.
              </p>
              <Link
                href="/forgot-password"
                className="mt-5 block w-full rounded-xl bg-[var(--brand,#003146)] px-4 py-3 text-center text-base font-bold text-white"
              >
                Send a new link
              </Link>
            </>
          )}
        </div>

        <p className="mt-4 text-center text-sm text-slate-500">
          <Link href="/login" className="font-semibold text-[var(--brand,#003146)]">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
