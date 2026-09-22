"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { promoteWorkerToAdmin } from "./actions";

/**
 * Give a support worker admin access - for a branch manager who also works
 * shifts. They keep their worker login and gain the admin area.
 */
export function PromoteWorker({
  workers,
}: {
  workers: { id: string; name: string; branch: string | null }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function submit() {
    if (!userId) return;
    const fd = new FormData();
    fd.set("userId", userId);
    start(async () => {
      const res = await promoteWorkerToAdmin(fd);
      if (res?.error) {
        setMsg({ ok: false, text: res.error });
        return;
      }
      setMsg({
        ok: true,
        text: res.hadBranch
          ? `${res.name} is now an admin for their own branch only. They need to sign out and back in once. Adjust their branch access below if needed.`
          : `${res.name} is now an admin, but has no branch yet, so they can't see anything. Set their branch access below. They need to sign out and back in once.`,
      });
      setUserId("");
      router.refresh();
    });
  }

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-bold text-slate-900">Give a support worker admin access</h2>
      <p className="mt-0.5 text-xs text-slate-500">
        For a branch manager who also works shifts. They keep their worker login,
        shifts and pay, and get the admin area for their own branch.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="min-w-[14rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
        >
          <option value="">Choose a support worker…</option>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
              {w.branch ? ` (${w.branch})` : " (no branch)"}
            </option>
          ))}
        </select>
        <button
          onClick={submit}
          disabled={!userId || pending}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--brand)" }}
        >
          {pending ? "Saving…" : "Make admin"}
        </button>
      </div>
      {msg && (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-xs ${
            msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
          }`}
        >
          {msg.text}
        </p>
      )}
    </section>
  );
}
