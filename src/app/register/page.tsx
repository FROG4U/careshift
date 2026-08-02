"use client";

import Link from "next/link";
import { useActionState } from "react";
import { registerAction } from "./actions";

const field =
  "w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3.5 py-2.5 text-sm outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100";

const STEPS = [
  {
    icon: "person_add",
    title: "Create your account",
    desc: "Fill in your details and your company sign-up code — takes about a minute.",
  },
  {
    icon: "verified_user",
    title: "Get approved",
    desc: "Your manager reviews and approves your account, so only real team members get in.",
  },
  {
    icon: "login",
    title: "Sign in",
    desc: "Once you're approved, log in to see your shifts, clock in and track your hours.",
  },
  {
    icon: "install_mobile",
    title: "Add the app to your phone",
    desc: "Install PCG Care to your home screen — works on iPhone, Android and Samsung.",
  },
];

export default function RegisterPage() {
  const [state, action, pending] = useActionState(registerAction, undefined);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      {/* ── Site header ───────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--background)]">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-3.5">
          <Link href="/register" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[var(--brand)] text-sm font-bold text-white shadow-sm">
              P
            </span>
            <span className="text-base font-bold tracking-tight text-[var(--text-primary)]">
              Pristine Care Group
            </span>
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text-primary)] shadow-sm transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* ── Main ──────────────────────────────────────────────────── */}
      <main className="relative flex-1 overflow-hidden">
        {/* Decorative background */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-32 h-[28rem] w-[28rem] rounded-full bg-blue-100 opacity-40 blur-3xl" />
          <div className="absolute -bottom-40 -left-32 h-[28rem] w-[28rem] rounded-full bg-green-100 opacity-40 blur-3xl" />
        </div>

        <div className="relative mx-auto grid w-full max-w-6xl grid-cols-1 gap-10 px-5 py-12 lg:grid-cols-2 lg:gap-14 lg:py-20">
          {/* Left — the pitch + how it works */}
          <section className="flex flex-col justify-center">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[var(--brand)]/10 px-3 py-1 text-xs font-semibold text-[var(--brand)]">
              <span className="material-symbols-rounded text-[16px]">work</span>
              Careers · Support Workers
            </span>
            <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight text-[var(--text-primary)] sm:text-5xl">
              Join the Pristine Care&nbsp;Group team
            </h1>
            <p className="mt-4 max-w-md text-base text-[var(--text-secondary)]">
              Register for your support worker account online. Once your manager
              approves you, you can sign in and add the app to your phone — ready
              to pick up shifts, clock in and track your hours.
            </p>

            {/* How it works */}
            <div className="mt-9">
              <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                How it works
              </p>
              <ol className="space-y-4">
                {STEPS.map((s, i) => (
                  <li key={s.title} className="flex gap-4">
                    <div className="relative flex flex-col items-center">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[var(--brand)] shadow-sm ring-1 ring-[var(--border)]">
                        <span className="material-symbols-rounded text-[22px]">{s.icon}</span>
                      </span>
                      {i < STEPS.length - 1 && (
                        <span className="mt-1 h-4 w-px bg-[var(--border)]" />
                      )}
                    </div>
                    <div className="pt-1">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        <span className="mr-1.5 text-[var(--text-muted)]">{i + 1}.</span>
                        {s.title}
                      </p>
                      <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{s.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* Right — the register card */}
          <section className="flex items-start justify-center lg:justify-end">
            <div className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-white p-7 shadow-xl sm:p-8">
              {state?.ok ? (
                <div className="text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600">
                    <span className="material-symbols-rounded text-3xl">check</span>
                  </div>
                  <h2 className="mb-2 text-xl font-bold text-[var(--text-primary)]">
                    Request submitted 🎉
                  </h2>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Your manager has been notified. Once they approve your
                    account you'll be able to sign in, see your shifts and add
                    the app to your phone.
                  </p>
                  <Link
                    href="/login"
                    className="mt-6 inline-block w-full rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:opacity-90"
                  >
                    Back to sign in
                  </Link>
                </div>
              ) : (
                <>
                  <h2 className="text-xl font-bold text-[var(--text-primary)]">
                    Create your account
                  </h2>
                  <p className="mt-1 mb-5 text-sm text-[var(--text-secondary)]">
                    It only takes a minute.
                  </p>

                  <form action={action} className="flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-3">
                      <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--text-primary)]">
                        First name
                        <input name="firstName" required autoComplete="given-name" className={field} />
                      </label>
                      <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--text-primary)]">
                        Last name
                        <input name="lastName" required autoComplete="family-name" className={field} />
                      </label>
                    </div>

                    <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--text-primary)]">
                      Email address
                      <input name="email" type="email" required autoComplete="email" className={field} />
                    </label>

                    <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--text-primary)]">
                      Mobile number <span className="font-normal text-[var(--text-muted)]">(optional)</span>
                      <input name="phone" type="tel" autoComplete="tel" className={field} />
                    </label>

                    <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--text-primary)]">
                      Password
                      <input name="password" type="password" required minLength={8} autoComplete="new-password" className={field} />
                      <span className="text-xs font-normal text-[var(--text-muted)]">At least 8 characters.</span>
                    </label>

                    <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--text-primary)]">
                      Company code
                      <input name="code" required autoCapitalize="characters" placeholder="e.g. PCG-1A2B" className={`${field} tracking-wider uppercase`} />
                      <span className="text-xs font-normal text-[var(--text-muted)]">Ask your manager for your company sign-up code.</span>
                    </label>

                    {state?.error && (
                      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {state.error}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={pending}
                      className="mt-1 w-full rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
                    >
                      {pending ? "Submitting…" : "Create account →"}
                    </button>
                  </form>

                  <p className="mt-5 text-center text-sm text-[var(--text-secondary)]">
                    Already have an account?{" "}
                    <Link href="/login" className="font-semibold text-[var(--brand)] hover:underline">
                      Sign in
                    </Link>
                  </p>
                </>
              )}
            </div>
          </section>
        </div>
      </main>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer className="border-t border-[var(--border)] bg-white/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-5 py-6 text-sm text-[var(--text-muted)] sm:flex-row">
          <p>&copy; {new Date().getFullYear()} Pristine Care Group. All rights reserved.</p>
          <p>NDIS Care Management Platform</p>
        </div>
      </footer>
    </div>
  );
}
