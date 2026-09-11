"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignShiftsToBranch } from "./actions";

/** Puts branchless shifts into a branch, so that branch's pay run covers them. */
export function AssignBranchForm({
  ids,
  branches,
}: {
  ids: string[];
  branches: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [branchId, setBranchId] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <select
        value={branchId}
        onChange={(e) => setBranchId(e.target.value)}
        className="rounded-lg border border-red-200 bg-white px-2 py-1 text-xs outline-none"
      >
        <option value="">Choose a branch</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <button
        disabled={!branchId || pending}
        onClick={() => {
          setError(null);
          start(async () => {
            const res = await assignShiftsToBranch(ids, branchId);
            if (res.error) {
              setError(res.error);
              return;
            }
            router.refresh();
          });
        }}
        className="rounded-lg bg-red-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Assigning…" : `Assign ${ids.length} to this branch`}
      </button>
      {error && <span className="basis-full text-xs text-red-700">{error}</span>}
    </div>
  );
}
