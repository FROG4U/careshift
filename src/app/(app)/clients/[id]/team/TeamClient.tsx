"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { initialsFromName } from "@/lib/format";
import { addClientWorker, removeClientWorker } from "./actions";

export type TeamMember = { id: string; staffId: string; name: string; title: string };
export type StaffOption = { id: string; name: string; title: string };

export function TeamClient({
  clientId,
  clientName,
  allocated,
  available,
}: {
  clientId: string;
  clientName: string;
  allocated: TeamMember[];
  available: StaffOption[];
}) {
  const [pending, start] = useTransition();
  const [picking, setPicking] = useState(false);

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <Link
        href="/clients"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <span className="material-symbols-rounded text-[18px]">arrow_back</span>
        Participants
      </Link>

      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            {clientName}
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Support team — only these workers can be rostered to this
            participant, and only they can swap each other&apos;s shifts.
          </p>
        </div>
        <button
          onClick={() => setPicking(true)}
          disabled={available.length === 0}
          className="rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
        >
          + Add worker
        </button>
      </header>

      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
        <div className="border-b border-[var(--border)] px-5 py-3">
          <h2 className="font-bold text-[var(--text-primary)]">
            Allocated workers{" "}
            <span className="text-[var(--text-muted)] font-medium">
              ({allocated.length})
            </span>
          </h2>
        </div>

        {allocated.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50">
              <span className="material-symbols-rounded text-[28px] text-amber-500">
                group_off
              </span>
            </div>
            <p className="font-medium text-[var(--text-primary)]">
              No workers allocated yet
            </p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Add the workers approved to support {clientName.split(" ")[0]}.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {allocated.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-5 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                  {initialsFromName(m.name)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[var(--text-primary)]">{m.name}</div>
                  {m.title && (
                    <div className="text-xs text-[var(--text-muted)]">{m.title}</div>
                  )}
                </div>
                <button
                  onClick={() => {
                    if (!confirm(`Remove ${m.name} from ${clientName}'s team?`)) return;
                    const fd = new FormData();
                    fd.set("id", m.id);
                    fd.set("clientId", clientId);
                    start(() => removeClientWorker(fd));
                  }}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pending && <p className="mt-3 text-xs text-[var(--text-muted)]">Saving…</p>}

      {/* Add-worker picker */}
      {picking && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4"
          onClick={() => setPicking(false)}
        >
          <div
            className="mt-12 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                Add worker to team
              </h2>
              <button
                onClick={() => setPicking(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                ✕
              </button>
            </div>

            {available.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--text-muted)]">
                All active staff are already allocated.
              </p>
            ) : (
              <ul className="max-h-80 divide-y divide-[var(--border)] overflow-auto">
                {available.map((s) => (
                  <li key={s.id}>
                    <form
                      action={async (fd) => {
                        await addClientWorker(fd);
                        setPicking(false);
                      }}
                    >
                      <input type="hidden" name="clientId" value={clientId} />
                      <input type="hidden" name="staffId" value={s.id} />
                      <button className="flex w-full items-center gap-3 px-1 py-3 text-left hover:bg-[var(--background)]">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                          {initialsFromName(s.name)}
                        </span>
                        <span className="flex-1">
                          <span className="block font-medium text-[var(--text-primary)]">
                            {s.name}
                          </span>
                          {s.title && (
                            <span className="block text-xs text-[var(--text-muted)]">
                              {s.title}
                            </span>
                          )}
                        </span>
                        <span className="material-symbols-rounded text-[20px] text-[var(--brand)]">
                          add_circle
                        </span>
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
