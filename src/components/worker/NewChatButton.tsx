"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startDirect } from "@/app/(app)/messages/actions";
import { Sheet } from "@/components/ui/Sheet";

export type ChatContact = { id: string; name: string; role: string };

/**
 * Lets a worker start a conversation from their phone.
 *
 * Workers previously had no way to begin one at all — they could only reply
 * to a thread the office started, which is no use when they're the one who
 * needs to raise something.
 */
export function NewChatButton({ contacts }: { contacts: ChatContact[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const visible = q.trim()
    ? contacts.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()))
    : contacts;

  async function start(userId: string) {
    setBusy(userId);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("userId", userId);
      const res = await startDirect(fd);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.push(`/my-shifts/chat/${res.id}`);
    } catch {
      setError("Couldn't start that chat. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="New chat"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brand)] text-white shadow-sm active:scale-95"
      >
        <span className="material-symbols-rounded text-[22px]">edit_square</span>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} labelledBy="new-chat-title">
        <h2 id="new-chat-title" className="mb-1 text-lg font-bold text-slate-900">
          New message
        </h2>
        <p className="mb-3 text-sm text-slate-500">
          Pick someone from your team to message.
        </p>

        {contacts.length > 8 && (
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name…"
            className="mb-3 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base outline-none focus:border-[var(--brand)]"
          />
        )}

        {error && (
          <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            No one to message yet.
          </p>
        ) : (
          <ul className="space-y-1">
            {visible.map((c) => (
              <li key={c.id}>
                <button
                  disabled={busy !== null}
                  onClick={() => start(c.id)}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition active:bg-slate-50 disabled:opacity-50"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-sm font-bold text-white">
                    {c.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-slate-900">
                      {c.name}
                    </span>
                    <span className="block text-xs text-slate-500">{c.role}</span>
                  </span>
                  {busy === c.id && (
                    <span className="material-symbols-rounded animate-spin text-[18px] text-slate-400">
                      progress_activity
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </>
  );
}
