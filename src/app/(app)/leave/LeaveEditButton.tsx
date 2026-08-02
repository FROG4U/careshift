"use client";

import { useState } from "react";
import { editAvailability } from "./actions";

export function LeaveEditButton({
  id,
  startDate,
  endDate,
  leaveType,
  reason,
}: {
  id: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  leaveType: string;
  reason: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--background)]"
      >
        Edit
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-lg font-bold text-[var(--text-primary)]">
              Edit time off
            </h2>
            <form
              action={async (fd) => {
                await editAvailability(fd);
                setOpen(false);
              }}
              className="space-y-3"
            >
              <input type="hidden" name="id" value={id} />
              <label className="block text-sm font-medium text-[var(--text-secondary)]">
                Type
                <select
                  name="leaveType"
                  defaultValue={leaveType}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
                >
                  <option value="ANNUAL">Annual leave</option>
                  <option value="SICK">Sick leave</option>
                  <option value="OTHER">Other / unpaid</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium text-[var(--text-secondary)]">
                  From
                  <input
                    type="date"
                    name="startDate"
                    defaultValue={startDate}
                    required
                    className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
                  />
                </label>
                <label className="block text-sm font-medium text-[var(--text-secondary)]">
                  To
                  <input
                    type="date"
                    name="endDate"
                    defaultValue={endDate}
                    className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
                  />
                </label>
              </div>
              <label className="block text-sm font-medium text-[var(--text-secondary)]">
                Reason
                <input
                  name="reason"
                  defaultValue={reason}
                  placeholder="Optional"
                  className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
                />
              </label>
              <div className="flex gap-2 pt-1">
                <button className="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold text-white" style={{ background: "var(--brand)" }}>
                  Save changes
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-semibold text-[var(--text-secondary)]"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
