"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAdminInvite } from "./actions";

const input =
  "rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#003146] focus:ring-2 focus:ring-[#003146]/15";

/**
 * The invite form, with its refusals made visible.
 *
 * As a plain server-action form this silently did nothing whenever a rule
 * blocked it - already has an account, already invited, removed admin - and
 * there was no way to tell which.
 */
export function InviteForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function submit(formData: FormData) {
    setError(null);
    setDone(false);
    startTransition(async () => {
      const res = await createAdminInvite(formData);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setDone(true);
      formRef.current?.reset();
      router.refresh();
    });
  }

  return (
    <>
      <form
        ref={formRef}
        action={submit}
        className="mt-3 flex flex-wrap items-end gap-3"
      >
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
          Email
          <input
            name="email"
            type="email"
            required
            placeholder="name@company.com"
            className={input}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Name (optional)
          <input name="name" className={input} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Role
          <select name="role" defaultValue="ADMIN" className={input}>
            <option value="ADMIN">Admin</option>
            <option value="SUPER_ADMIN">Super Admin</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
          style={{ background: "var(--brand)" }}
        >
          {pending ? "Creating…" : "Create link"}
        </button>
      </form>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {done && (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Link created. Copy it below and send it to them.
        </p>
      )}
    </>
  );
}
