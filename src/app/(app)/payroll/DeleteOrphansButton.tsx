"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteOrphanDrafts } from "./actions";

/** Clears the leftover no-branch draft runs, after a confirmation. */
export function DeleteOrphansButton({ count }: { count: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  if (count === 0) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
      >
        Delete all {count} draft{count === 1 ? "" : "s"}
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900">
              Delete {count} no-branch draft{count === 1 ? "" : "s"}?
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Nothing has been paid from these, so no pay records are lost. Your
              branch pay runs are not touched.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() =>
                  start(async () => {
                    await deleteOrphanDrafts();
                    setOpen(false);
                    router.push("/payroll");
                    router.refresh();
                  })
                }
                disabled={pending}
                className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                {pending ? "Deleting…" : "Delete them"}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
