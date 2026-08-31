"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteStaff } from "./actions";

/**
 * Permanent delete for an archived staff member.
 *
 * Confirmed first, and the server refuses anyone with shifts or incident
 * reports against them - so this is really for records created in error, not a
 * way to tidy up people who have worked.
 */
export function DeleteStaffButton({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function remove() {
    setError(null);
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      const res = await deleteStaff(fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="text-[var(--text-muted)] hover:text-red-600"
        title={`Delete ${name} permanently`}
        aria-label={`Delete ${name} permanently`}
      >
        <span className="material-symbols-rounded align-middle text-[18px]">
          delete
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900">
              Delete {name}?
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              This removes the staff record for good. Any login they had stops
              working.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              If they have ever worked a shift this will be refused, because
              their shifts have to keep their worker. Archiving is the right
              choice for anyone who has.
            </p>

            {error && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="mt-5 flex gap-2">
              <button
                onClick={remove}
                disabled={pending}
                className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {pending ? "Deleting…" : "Delete permanently"}
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  setError(null);
                }}
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
