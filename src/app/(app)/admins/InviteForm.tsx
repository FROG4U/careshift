"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAdminInvite } from "./actions";
import type { AccessGroup } from "./BranchPermissions";

type Kind = "ops" | "finance" | "message";
const KINDS: { key: Kind; label: string }[] = [
  { key: "ops", label: "Shifts & people" },
  { key: "finance", label: "Finances" },
  { key: "message", label: "Messaging" },
];
type Ticks = Record<string, Record<Kind, boolean>>;

const input =
  "rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#003146] focus:ring-2 focus:ring-[#003146]/15";

/**
 * The invite form, with its refusals made visible.
 *
 * As a plain server-action form this silently did nothing whenever a rule
 * blocked it - already has an account, already invited, removed admin - and
 * there was no way to tell which.
 */
export function InviteForm({ groups = [] }: { groups?: AccessGroup[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // What they can see from the moment they join. Starts empty: a new admin
  // sees nothing until something is ticked here or on their row later.
  const empty = (): Ticks =>
    Object.fromEntries(groups.map((g) => [g.key, { ops: false, finance: false, message: false }]));
  const [ticks, setTicks] = useState<Ticks>(empty);
  const toggle = (key: string, kind: Kind) =>
    setTicks((t) => ({ ...t, [key]: { ...t[key], [kind]: !t[key][kind] } }));
  const covered = (g: AccessGroup, kind: Kind) => g.hq && Boolean(ticks.HQ?.[kind]);
  const nothing = Object.values(ticks).every((t) => !t.ops && !t.finance && !t.message);

  function submit(formData: FormData) {
    setError(null);
    setDone(false);
    formData.set(
      "access",
      JSON.stringify(Object.entries(ticks).map(([key, t]) => ({ key, ...t }))),
    );
    startTransition(async () => {
      const res = await createAdminInvite(formData);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setDone(true);
      formRef.current?.reset();
      setTicks(empty());
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
        {groups.length > 0 && (
          <div className="basis-full overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/60">
            <table className="w-full min-w-[30rem] text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2">They can see</th>
                  {KINDS.map((k) => (
                    <th key={k.key} className="px-3 py-2 text-center">{k.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70">
                {groups.map((g) => (
                  <tr key={g.key}>
                    <td className={`px-3 py-1.5 ${g.hq ? "pl-7" : ""}`}>
                      <span className={g.isGroup ? "font-semibold text-slate-800" : "text-slate-700"}>
                        {g.label}
                      </span>
                    </td>
                    {KINDS.map((k) => (
                      <td key={k.key} className="px-3 py-1.5 text-center">
                        <input
                          type="checkbox"
                          aria-label={`${g.label}: ${k.label}`}
                          checked={covered(g, k.key) || (ticks[g.key]?.[k.key] ?? false)}
                          disabled={covered(g, k.key)}
                          onChange={() => toggle(g.key, k.key)}
                          className="h-4 w-4 rounded border-slate-300 disabled:opacity-40"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-slate-200/70 px-3 py-2 text-[11px] text-slate-500">
              {nothing
                ? "Nothing ticked: they'll see nothing until you give them access on their row."
                : "Applied the moment they join. You can change it any time on their row."}
            </p>
          </div>
        )}
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
