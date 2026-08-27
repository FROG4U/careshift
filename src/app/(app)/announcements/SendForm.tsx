"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendBroadcast } from "./actions";

/**
 * Composing an announcement.
 *
 * Sending can't be undone once phones have buzzed, so the button states how
 * many people it will reach, and the audience/branch choice is visible rather
 * than buried in a dropdown default.
 */
export function SendForm({
  branches,
  canMessageAdmins,
  tenantName,
  fromLabels,
}: {
  branches: { id: string; name: string }[];
  canMessageAdmins: boolean;
  tenantName: string;
  fromLabels: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [audience, setAudience] = useState<"WORKERS" | "ADMINS">("WORKERS");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const field =
    "mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand)]";

  function submit(formData: FormData) {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await sendBroadcast(formData);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setResult(
        `Sent to ${res?.sentTo} ${res?.sentTo === 1 ? "person" : "people"}.`,
      );
      router.refresh();
    });
  }

  return (
    <form
      action={submit}
      className="space-y-4 rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-medium text-[var(--text-secondary)]">
          Send to
          <select
            name="audience"
            value={audience}
            onChange={(e) =>
              setAudience(e.target.value as "WORKERS" | "ADMINS")
            }
            className={field}
          >
            <option value="WORKERS">Support workers</option>
            {canMessageAdmins && <option value="ADMINS">Admin team</option>}
          </select>
        </label>

        <label className="block text-xs font-medium text-[var(--text-secondary)]">
          Branch
          <select
            name="branchId"
            disabled={audience === "ADMINS"}
            className={`${field} disabled:opacity-50`}
          >
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          {audience === "ADMINS" && (
            <span className="mt-1 block text-[11px] font-normal text-[var(--text-muted)]">
              Admins aren&apos;t tied to a branch, so this doesn&apos;t apply.
            </span>
          )}
        </label>
      </div>

      <label className="block text-xs font-medium text-[var(--text-secondary)]">
        From
        <select name="fromLabel" className={field}>
          {fromLabels.map((l) => (
            <option key={l} value={l}>
              {tenantName} {l}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs font-medium text-[var(--text-secondary)]">
        Title
        <input
          name="title"
          required
          maxLength={120}
          placeholder="Payroll cut-off moved to Thursday"
          className={field}
        />
      </label>

      <label className="block text-xs font-medium text-[var(--text-secondary)]">
        Message
        <textarea
          name="body"
          required
          rows={5}
          placeholder="Write the message people will see on their phone."
          className={field}
        />
      </label>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {result && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {result}
        </p>
      )}

      <button
        disabled={pending}
        className="w-full rounded-xl px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60 sm:w-auto sm:px-8"
        style={{ background: "var(--brand)" }}
      >
        {pending ? "Sending…" : "Send message"}
      </button>
      <p className="text-xs text-[var(--text-muted)]">
        Everyone selected gets a notification now and a full-screen message next
        time they open the app. This can&apos;t be unsent.
      </p>
    </form>
  );
}
