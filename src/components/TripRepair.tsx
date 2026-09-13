"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { repairTripMileage } from "@/app/(app)/timesheets/actions";

/**
 * Lists trips saved shorter than their own GPS trail, and offers the fix.
 *
 * The fix works each trip out again from the GPS points it recorded: measured
 * where the phone reported, along the roads where it went quiet. It only ever
 * raises a figure, and never touches a trip an admin corrected by hand.
 */
export function TripRepair({ items }: { items: { id: string; label: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  if (items.length === 0 && !result) return null;

  return (
    <div className="mb-5 rounded-2xl border border-violet-200 bg-violet-50 p-4">
      {items.length > 0 && (
        <>
          <p className="text-sm font-semibold text-violet-900">
            {items.length} trip{items.length === 1 ? " is" : "s are"} missing
            mileage.
          </p>
          <p className="mt-1 text-xs text-violet-900">
            When a phone&apos;s screen locked mid-drive, the old mileage code threw
            the drive away, so real trips were saved short or as 0 km. The GPS
            points were kept. Fixing works each trip out again from them, along
            the roads, and only ever adds km. Trips you corrected by hand are left
            alone.
          </p>
          <ul className="mt-2 space-y-0.5 text-xs text-violet-900">
            {items.slice(0, 12).map((i) => (
              <li key={i.id}>{i.label}</li>
            ))}
            {items.length > 12 && <li>and {items.length - 12} more</li>}
          </ul>
          <button
            onClick={() =>
              start(async () => {
                const r = await repairTripMileage();
                setResult(
                  `Fixed ${r.fixed} trip${r.fixed === 1 ? "" : "s"}, adding ${r.kmAdded} km.${
                    r.skipped
                      ? ` ${r.skipped} skipped because ${r.skipped === 1 ? "it's" : "they're"} in a completed pay run - re-open that run first.`
                      : ""
                  }`,
                );
                router.refresh();
              })
            }
            disabled={pending}
            className="mt-3 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            {pending
              ? "Working out the distances… (up to a minute)"
              : `Fix ${items.length} trip${items.length === 1 ? "" : "s"}`}
          </button>
        </>
      )}
      {result && <p className="mt-2 text-xs font-medium text-violet-950">{result}</p>}
    </div>
  );
}
