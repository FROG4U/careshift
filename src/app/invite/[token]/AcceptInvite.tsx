"use client";

import { useActionState } from "react";
import { acceptAdminInvite } from "./actions";

export function AcceptInvite({
  token,
  email,
  defaultName,
  roleLabel,
}: {
  token: string;
  email: string;
  defaultName: string;
  roleLabel: string;
}) {
  const [state, action, pending] = useActionState(acceptAdminInvite, undefined);

  if (state?.ok) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600">
          <span className="material-symbols-rounded text-2xl">check</span>
        </div>
        <p className="font-semibold text-green-800">You&apos;re all set 🎉</p>
        <p className="mt-1 text-sm text-green-700">
          Your account was created and is waiting for a super admin to approve
          it. You&apos;ll be able to sign in once approved.
        </p>
        <a
          href="/login"
          className="mt-4 inline-block rounded-xl px-4 py-2 text-sm font-bold text-white"
          style={{ background: "#003146" }}
        >
          Go to sign in
        </a>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />

      <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
        Email
        <input
          value={email}
          readOnly
          className="rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-sm text-slate-500"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
        Your name
        <input
          name="name"
          required
          defaultValue={defaultName}
          className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none focus:border-[#003146] focus:bg-white focus:ring-2 focus:ring-[#003146]/15"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
        Create a password
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none focus:border-[#003146] focus:bg-white focus:ring-2 focus:ring-[#003146]/15"
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
        style={{ background: "#003146" }}
      >
        {pending ? "Creating account…" : `Join as ${roleLabel} →`}
      </button>
    </form>
  );
}
