"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, undefined);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 bg-[var(--background)]">
      {/* Decorative background blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-blue-100 opacity-40 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-green-100 opacity-40 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-[var(--brand)] text-2xl font-bold text-white shadow-lg">
            P
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Pristine Care Group
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            NDIS Care Management Platform
          </p>
        </div>

        {/* Card */}
        <div className="rounded-3xl border border-[var(--border)] bg-white p-7 shadow-lg">
          <h2 className="mb-5 text-lg font-bold text-[var(--text-primary)]">Sign in to your account</h2>

          <form action={action} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--text-primary)]">
              Email address
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3.5 py-2.5 text-sm outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--text-primary)]">
              Password
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3.5 py-2.5 text-sm outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100"
              />
            </label>

            {state?.error && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {state.error}
              </div>
            )}

            <button
              type="submit"
              disabled={pending}
              className="mt-1 w-full rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
            >
              {pending ? "Signing in…" : "Sign in →"}
            </button>
          </form>

          {/* Sign-up link */}
          <p className="mt-5 text-center text-sm text-[var(--text-secondary)]">
            New support worker?{" "}
            <a href="/register" className="font-semibold text-[var(--brand)] hover:underline">
              Create an account
            </a>
          </p>

        </div>

        <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
          &copy; {new Date().getFullYear()} Pristine Care Group. All rights reserved.
        </p>
      </div>
    </div>
  );
}
