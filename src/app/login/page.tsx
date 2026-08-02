"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";

// Brand palette (PCG): deep navy-teal + warm bronze.
const NAVY = "#003146";
const BRONZE = "#886949";

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, undefined);

  return (
    <div className="flex min-h-screen">
      {/* ── Left: warm care photo (desktop only) ───────────────────── */}
      <div className="relative hidden md:block md:w-1/2 lg:w-[55%]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/login-hero.jpg"
          alt="A support worker holding hands with an older client at home"
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* Subtle brand gradient for depth + legibility */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(0,49,70,0.10) 0%, rgba(0,49,70,0) 35%, rgba(0,49,70,0.55) 100%)",
          }}
        />
        <div className="absolute bottom-0 left-0 p-10 text-white">
          <p className="text-2xl font-bold leading-snug drop-shadow-sm">
            Care that shows up.
          </p>
          <p className="mt-1 max-w-sm text-sm text-white/85 drop-shadow-sm">
            Rostering, clock-in and compliance — all in one place for your team.
          </p>
        </div>
      </div>

      {/* ── Right: sign-in form ────────────────────────────────────── */}
      <div className="flex w-full items-center justify-center bg-white px-6 py-12 md:w-1/2 lg:w-[45%]">
        <div className="w-full max-w-sm">
          {/* Logo + name */}
          <div className="mb-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Pristine Care Group"
              className="mb-4 h-14 w-14 rounded-2xl shadow-md"
            />
            <h1
              className="text-2xl font-bold tracking-tight"
              style={{ color: NAVY }}
            >
              Pristine Care Group
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              NDIS Care Management Platform
            </p>
          </div>

          <h2 className="mb-5 text-lg font-bold text-slate-900">
            Sign in to your account
          </h2>

          <form action={action} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
              Email address
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none transition focus:border-[#003146] focus:bg-white focus:ring-2 focus:ring-[#003146]/15"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
              Password
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none transition focus:border-[#003146] focus:bg-white focus:ring-2 focus:ring-[#003146]/15"
              />
            </label>

            {state?.error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {state.error}
              </div>
            )}

            <button
              type="submit"
              disabled={pending}
              className="mt-1 w-full rounded-xl px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
              style={{ background: NAVY }}
            >
              {pending ? "Signing in…" : "Sign in →"}
            </button>
          </form>

          <p className="mt-5 text-sm text-slate-500">
            New support worker?{" "}
            <a
              href="/register"
              className="font-semibold hover:underline"
              style={{ color: BRONZE }}
            >
              Create an account
            </a>
          </p>

          <p className="mt-10 text-xs text-slate-400">
            &copy; {new Date().getFullYear()} Pristine Care Group. All rights
            reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
