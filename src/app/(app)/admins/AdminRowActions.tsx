"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeAdmin, resetAdminPassword } from "./actions";

/**
 * Remove and password-reset for one admin, super admins only.
 *
 * Both are confirmed before they run: removing locks someone out of the
 * system, and resetting invalidates the password they're currently using even
 * if they were perfectly able to log in.
 */
export function AdminRowActions({
  userId,
  name,
}: {
  userId: string;
  name: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<null | "remove" | "reset">(null);
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(which: "remove" | "reset") {
    setError(null);
    const fd = new FormData();
    fd.set("userId", userId);
    startTransition(async () => {
      if (which === "remove") {
        const res = await removeAdmin(fd);
        setConfirming(null);
        if (res?.error) return setError(res.error);
      } else {
        const res = await resetAdminPassword(fd);
        setConfirming(null);
        if (res?.error) return setError(res.error);
        if (res.password) setNewPassword(res.password);
      }
      router.refresh();
    });
  }

  return (
    <>
      <button
        onClick={() => setConfirming("reset")}
        className="text-xs font-semibold text-slate-500 hover:text-slate-800 hover:underline"
      >
        Reset password
      </button>
      <button
        onClick={() => setConfirming("remove")}
        className="text-xs font-semibold text-red-600 hover:underline"
      >
        Remove
      </button>

      {error && (
        <span className="basis-full text-xs text-red-600">{error}</span>
      )}

      {confirming && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900">
              {confirming === "remove"
                ? `Remove ${name}?`
                : `Reset ${name}'s password?`}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {confirming === "remove" ? (
                <>
                  They won&apos;t be able to log in again. Their messages and
                  any incident reports they filed stay on the record, and you
                  can invite them back later.
                </>
              ) : (
                <>
                  Their current password stops working immediately. You&apos;ll
                  get a new one to pass on to them.
                </>
              )}
            </p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => run(confirming)}
                disabled={pending}
                className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60 ${
                  confirming === "remove" ? "bg-red-600" : "bg-[var(--brand)]"
                }`}
              >
                {pending
                  ? "Working…"
                  : confirming === "remove"
                    ? "Remove access"
                    : "Reset it"}
              </button>
              <button
                onClick={() => setConfirming(null)}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {newPassword && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900">
              New password for {name}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Copy this now. It isn&apos;t stored anywhere and can&apos;t be
              shown again, though you can always reset it a second time.
            </p>
            <div className="mt-3 select-all break-all rounded-xl bg-slate-900 px-4 py-3 text-center font-mono text-base font-bold text-white">
              {newPassword}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Give it to them directly, and ask them to change it once
              they&apos;re in. They&apos;ve been notified their password was
              reset, but not what it is.
            </p>
            <button
              onClick={() => setNewPassword(null)}
              className="mt-5 w-full rounded-xl px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
              style={{ background: "var(--brand)" }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}
