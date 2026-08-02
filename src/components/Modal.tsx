"use client";

import { useState } from "react";

/** A lightweight "Add" button that reveals a modal form. */
export function AddModal({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
      >
        {label}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="mt-12 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            {children}
          </div>
        </div>
      )}
    </>
  );
}
