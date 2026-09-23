"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { publishVersion } from "../actions";

/**
 * Publishing is the moment the terms become real: every active worker gets the
 * pop-up and has to sign before they can use the app again. So it confirms
 * first, and says plainly what is about to happen.
 */
export function PublishButton({ id, version }: { id: string; version: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function publish() {
    setError(null);
    const fd = new FormData();
    fd.set("id", id);
    start(async () => {
      const res = await publishVersion(fd);
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
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:opacity-90"
        style={{ background: "var(--brand)" }}
      >
        <span className="material-symbols-rounded text-[18px]">send</span>
        Send to workers
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              Publish version {version} to every worker?
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
              <li className="flex gap-2">
                <span className="material-symbols-rounded text-[18px] text-[var(--brand)]">
                  notifications_active
                </span>
                Every active support worker is notified.
              </li>
              <li className="flex gap-2">
                <span className="material-symbols-rounded text-[18px] text-[var(--brand)]">
                  lock
                </span>
                The next time they open the app they must read and agree before
                they can do anything else, including starting a shift.
              </li>
              <li className="flex gap-2">
                <span className="material-symbols-rounded text-[18px] text-[var(--brand)]">
                  history_edu
                </span>
                Their name, signature and the exact time are recorded against
                this version.
              </li>
              <li className="flex gap-2">
                <span className="material-symbols-rounded text-[18px] text-[var(--brand)]">
                  edit_off
                </span>
                The wording is locked. Changing it later means version{" "}
                {version + 1}.
              </li>
            </ul>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <div className="mt-6 flex gap-2">
              <button
                onClick={() => setOpen(false)}
                disabled={pending}
                className="flex-1 rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)]"
              >
                Not yet
              </button>
              <button
                onClick={publish}
                disabled={pending}
                className="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-60"
                style={{ background: "var(--brand)" }}
              >
                {pending ? "Publishing…" : "Publish and notify"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
