"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completePayrollRuns } from "./actions";

/**
 * Completes one or several pay runs, after a confirmation.
 *
 * Completing freezes the figures and notifies every worker in the run, so it
 * earns one deliberate extra tap. Refusals are shown rather than swallowed: a
 * run blocked for double payment or waiting timesheets has to say why.
 */
export function CompleteRunsButton({
  ids,
  label,
  confirmTitle,
  confirmBody,
  size = "sm",
}: {
  ids: string[];
  label: string;
  confirmTitle: string;
  confirmBody: string;
  size?: "sm" | "lg";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<string[]>([]);

  function run() {
    setErrors([]);
    start(async () => {
      const res = await completePayrollRuns(ids);
      setOpen(false);
      setErrors(res.errors);
      router.refresh();
    });
  }

  const btn =
    size === "lg"
      ? "rounded-xl px-4 py-2.5 text-sm"
      : "rounded-lg px-3 py-1.5 text-xs";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={ids.length === 0}
        className={`${btn} bg-emerald-600 font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50`}
      >
        {label}
      </button>

      {(open || errors.length > 0) && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            {errors.length > 0 ? (
              <>
                <h3 className="text-base font-bold text-slate-900">
                  Some pay runs weren&apos;t completed
                </h3>
                <ul className="mt-3 space-y-2">
                  {errors.map((e, i) => (
                    <li
                      key={i}
                      className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"
                    >
                      {e}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => setErrors([])}
                  className="mt-5 w-full rounded-xl px-4 py-2.5 text-sm font-bold text-white"
                  style={{ background: "var(--brand)" }}
                >
                  OK
                </button>
              </>
            ) : (
              <>
                <h3 className="text-base font-bold text-slate-900">{confirmTitle}</h3>
                <p className="mt-2 text-sm text-slate-600">{confirmBody}</p>
                <div className="mt-5 flex gap-2">
                  <button
                    onClick={run}
                    disabled={pending}
                    className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
                  >
                    {pending ? "Completing…" : "Complete"}
                  </button>
                  <button
                    onClick={() => setOpen(false)}
                    className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
