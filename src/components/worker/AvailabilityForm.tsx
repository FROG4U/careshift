"use client";

import { useState } from "react";
import { addAvailability } from "@/app/my-shifts/availability/actions";

type Kind = "range" | "day" | "daytime";

const KINDS: { key: Kind; label: string }[] = [
  { key: "range", label: "Date range" },
  { key: "day", label: "One day" },
  { key: "daytime", label: "Day + time" },
];

const field =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-[var(--brand)]";

export function AvailabilityForm() {
  const [kind, setKind] = useState<Kind>("range");
  const [leaveType, setLeaveType] = useState("ANNUAL");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: boolean; error?: string } | null>(null);

  async function submit(fd: FormData) {
    setBusy(true);
    setMsg(null);
    fd.set("kind", kind);
    fd.set("leaveType", leaveType);
    const res = await addAvailability(fd);
    setMsg(res);
    setBusy(false);
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold text-slate-900">Add time off</h2>
      <p className="mt-0.5 text-xs text-slate-400">
        Tell the office when you're not available. They'll approve it and won't
        roster you then.
      </p>

      {/* Kind selector */}
      <div className="mt-3 flex gap-1 rounded-full bg-slate-100 p-1">
        {KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => setKind(k.key)}
            className={`flex-1 rounded-full py-2 text-xs font-bold transition ${
              kind === k.key ? "text-white shadow-sm" : "text-slate-500"
            }`}
            style={kind === k.key ? { background: "var(--brand)" } : undefined}
          >
            {k.label}
          </button>
        ))}
      </div>

      <form action={submit} className="mt-4 space-y-3">
        <label className="block text-xs font-semibold text-slate-600">
          Type
          <select
            value={leaveType}
            onChange={(e) => setLeaveType(e.target.value)}
            className={`mt-1 ${field}`}
          >
            <option value="ANNUAL">Annual leave</option>
            <option value="SICK">Sick leave</option>
            <option value="OTHER">Other / unpaid</option>
          </select>
        </label>

        {kind === "range" ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-slate-600">
              From
              <input type="date" name="startDate" required className={`mt-1 ${field}`} />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              To
              <input type="date" name="endDate" required className={`mt-1 ${field}`} />
            </label>
          </div>
        ) : (
          <label className="block text-xs font-semibold text-slate-600">
            Date
            <input type="date" name="startDate" required className={`mt-1 ${field}`} />
          </label>
        )}

        {kind === "daytime" && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-slate-600">
              From time
              <input type="time" name="startTime" required className={`mt-1 ${field}`} />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              To time
              <input type="time" name="endTime" required className={`mt-1 ${field}`} />
            </label>
          </div>
        )}

        <label className="block text-xs font-semibold text-slate-600">
          Reason (optional)
          <input name="reason" placeholder="e.g. Holiday, appointment" className={`mt-1 ${field}`} />
        </label>

        {msg?.error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{msg.error}</p>
        )}
        {msg?.ok && (
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Sent to the office for approval 🎉
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
          style={{ background: "var(--brand)" }}
        >
          {busy ? "Sending…" : "Request time off"}
        </button>
      </form>
    </section>
  );
}
