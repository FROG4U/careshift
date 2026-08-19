"use client";

import { useActionState } from "react";
import { requestReset, type ForgotState } from "./actions";

export function ForgotForm() {
  const [state, action, pending] = useActionState<ForgotState | undefined, FormData>(
    requestReset,
    undefined,
  );

  if (state?.sent) {
    return (
      <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
        <p className="font-semibold">Check your email.</p>
        <p className="mt-1">
          If that address has an account, a reset link is on its way. It works
          once and expires in an hour.
        </p>
        <p className="mt-2 text-xs text-emerald-700">
          Nothing arrived? Check your junk folder, or ask your manager.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">
          Email address
        </span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-3 text-base outline-none focus:border-[var(--brand,#003146)] focus:ring-2 focus:ring-[var(--brand,#003146)]/15"
        />
      </label>

      {state?.error && (
        <p className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button
        disabled={pending}
        className="w-full rounded-xl bg-[var(--brand,#003146)] px-4 py-3 text-base font-bold text-white disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
