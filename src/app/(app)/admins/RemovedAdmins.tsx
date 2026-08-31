"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reinstateAdmin } from "./actions";

/**
 * Admins whose access was revoked, and the way back.
 *
 * Without this they'd be invisible and permanently un-invitable: their user row
 * still exists, so a fresh invite to the same email is refused, and there was
 * nothing on screen explaining why.
 */
export function RemovedAdmins({
  admins,
}: {
  admins: { id: string; name: string; email: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (admins.length === 0) return null;

  function restore(userId: string) {
    setError(null);
    const fd = new FormData();
    fd.set("userId", userId);
    startTransition(async () => {
      const res = await reinstateAdmin(fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-bold text-slate-900">Removed admins</h2>
      <p className="mt-0.5 text-xs text-slate-500">
        They can&apos;t log in. Their messages and incident reports are still on
        the record, so restore the same account rather than sending a new
        invite.
      </p>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-3 divide-y divide-slate-100">
        {admins.map((u) => (
          <div
            key={u.id}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <div>
              <p className="text-sm font-semibold text-slate-500">{u.name}</p>
              <p className="text-xs text-slate-400">{u.email}</p>
            </div>
            <button
              onClick={() => restore(u.id)}
              disabled={pending}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              {pending ? "Working…" : "Restore access"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
