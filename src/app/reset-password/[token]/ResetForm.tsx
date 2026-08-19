"use client";

import { useActionState } from "react";
import Link from "next/link";
import { completeReset, type ResetState } from "@/app/forgot-password/actions";

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<ResetState | undefined, FormData>(
    completeReset,
    undefined,
  );

  if (state?.ok) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
          <p className="font-semibold">Password changed.</p>
          <p className="mt-1">You can sign in with your new password now.</p>
        </div>
        <Link
          href="/login"
          className="block w-full rounded-xl bg-[var(--brand,#003146)] px-4 py-3 text-center text-base font-bold text-white"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const field =
    "mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-3 text-base outline-none focus:border-[var(--brand,#003146)] focus:ring-2 focus:ring-[var(--brand,#003146)]/15";

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />

      <label className="block">
        <span className="text-sm font-semibold text-slate-700">
          New password
        </span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={field}
        />
      </label>

      <label className="block">
        <span className="text-sm font-semibold text-slate-700">
          Type it again
        </span>
        <input
          name="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={field}
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
        {pending ? "Saving…" : "Save new password"}
      </button>
    </form>
  );
}
