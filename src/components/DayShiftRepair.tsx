"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { repairDayShiftedShifts } from "@/app/(app)/timesheets/actions";

/**
 * Lists shifts whose clock times were saved a day early, and offers the fix.
 *
 * The fix moves each clock-in and clock-out forward exactly one day. Nothing
 * else about the shift changes.
 */
export function DayShiftRepair({
  items,
}: {
  items: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  if (items.length === 0 && !result) return null;

  return (
    <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4">
      {items.length > 0 && (
        <>
          <p className="text-sm font-semibold text-red-800">
            {items.length} shift{items.length === 1 ? " is" : "s are"} being paid
            0 hours because {items.length === 1 ? "its" : "their"} clock times
            were saved a day early.
          </p>
          <p className="mt-1 text-xs text-red-800">
            A bug in the Timesheets edit form moved clock times back 24 hours
            whenever a morning shift was saved, even just to change its notes. The
            work happened; only the dates are wrong. Fixing moves each clock-in
            and clock-out forward exactly one day.
          </p>
          <ul className="mt-2 space-y-0.5 text-xs text-red-800">
            {items.slice(0, 12).map((i) => (
              <li key={i.id}>{i.label}</li>
            ))}
            {items.length > 12 && <li>and {items.length - 12} more</li>}
          </ul>
          <button
            onClick={() =>
              start(async () => {
                const r = await repairDayShiftedShifts();
                setResult(
                  `Fixed ${r.fixed} shift${r.fixed === 1 ? "" : "s"}.${
                    r.skipped
                      ? ` ${r.skipped} skipped because ${r.skipped === 1 ? "it's" : "they're"} in a completed pay run - re-open that run first.`
                      : ""
                  }`,
                );
                router.refresh();
              })
            }
            disabled={pending}
            className="mt-3 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Fixing…" : `Fix ${items.length} shift${items.length === 1 ? "" : "s"}`}
          </button>
        </>
      )}
      {result && <p className="mt-2 text-xs font-medium text-red-900">{result}</p>}
    </div>
  );
}
