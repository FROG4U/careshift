import Link from "next/link";
import { ForgotForm } from "./ForgotForm";

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background,#faf8f5)] p-6">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">
            Forgot your password?
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Enter the email address you sign in with and we&apos;ll send you a
            link to choose a new password.
          </p>

          <div className="mt-5">
            <ForgotForm />
          </div>
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
