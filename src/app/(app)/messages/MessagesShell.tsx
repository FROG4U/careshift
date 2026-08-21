"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { initials } from "@/lib/format";
import { startDirect, createGroup } from "./actions";

export type ConvoSummary = {
  id: string;
  type: string;
  title: string;
  memberCount: number;
  lastBody: string;
  lastAt: string;
  unread: number;
  online: boolean;
};
export type DirectoryUser = { id: string; name: string; role: string };

function ago(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h`;
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export function MessagesShell({
  convos,
  directory,
  children,
}: {
  convos: ConvoSummary[];
  directory: DirectoryUser[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [newOpen, setNewOpen] = useState(false);
  const activeId = pathname.split("/")[2]; // /messages/<id>
  const threadOpen = Boolean(activeId);

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Conversation list — hidden on mobile once a thread is open */}
      <aside
        className={`w-full shrink-0 flex-col border-r border-[var(--border)] bg-white md:flex md:w-80 ${
          threadOpen ? "hidden md:flex" : "flex"
        }`}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h1 className="text-lg font-bold text-[var(--text-primary)]">Messages</h1>
          <button
            onClick={() => setNewOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand)] text-white hover:opacity-90"
            title="New message"
          >
            <span className="material-symbols-rounded text-[20px]">edit_square</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {convos.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
              No conversations yet. Tap the pencil to start one.
            </p>
          )}
          {convos.map((c) => (
            <Link
              key={c.id}
              href={`/messages/${c.id}`}
              className={`flex items-center gap-3 px-4 py-3 transition hover:bg-[var(--background)] ${
                activeId === c.id ? "bg-[var(--background)]" : ""
              }`}
            >
              <span className="relative shrink-0">
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold text-white ${
                    c.type === "GROUP" ? "bg-violet-500" : "bg-[var(--brand)]"
                  }`}
                >
                  {c.type === "GROUP" ? (
                    <span className="material-symbols-rounded text-[22px]">group</span>
                  ) : (
                    initials(...(c.title.split(" ") as [string, string]))
                  )}
                </span>
                {c.online && (
                  <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-green-500" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`truncate ${c.unread ? "font-bold text-[var(--text-primary)]" : "font-semibold text-[var(--text-primary)]"}`}>
                    {c.title}
                  </span>
                  <span className="shrink-0 text-xs text-[var(--text-muted)]">
                    {ago(c.lastAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className={`truncate text-sm ${c.unread ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>
                    {c.lastBody}
                  </span>
                  {c.unread > 0 && (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] px-1.5 text-[11px] font-bold text-white">
                      {c.unread}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </aside>

      {/* Thread */}
      <main className={`min-w-0 flex-1 ${threadOpen ? "flex" : "hidden md:flex"}`}>
        {children}
      </main>

      {/* New message / group */}
      {newOpen && (
        <NewChat
          directory={directory}
          onClose={() => setNewOpen(false)}
          onCreated={(id) => {
            setNewOpen(false);
            router.push(`/messages/${id}`);
          }}
        />
      )}
    </div>
  );
}

function NewChat({
  directory,
  onClose,
  onCreated,
}: {
  directory: DirectoryUser[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [mode, setMode] = useState<"DIRECT" | "GROUP">("DIRECT");
  const [picked, setPicked] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function go() {
    setError(null);
    setBusy(true);
    const fd = new FormData();
    try {
      if (mode === "DIRECT") {
        if (!picked[0]) {
          setError("Pick someone to message.");
          return;
        }
        fd.set("userId", picked[0]);
        // You only ever get one direct chat per person, so if one already
        // exists this returns it rather than making a duplicate.
        const id = await startDirect(fd);
        if (typeof id !== "string" || !id) {
          setError("Couldn't start that chat. Please try again.");
          return;
        }
        onCreated(id);
      } else {
        if (!groupName.trim()) {
          setError("Give the group a name.");
          return;
        }
        if (picked.length === 0) {
          setError("Add at least one person to the group.");
          return;
        }
        fd.set("name", groupName.trim());
        picked.forEach((p) => fd.append("members", p));
        const id = await createGroup(fd);
        if (!id) {
          setError("Couldn't create that group. Please try again.");
          return;
        }
        onCreated(id);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">New message</h2>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">✕</button>
        </div>

        <div className="mb-4 inline-flex rounded-lg bg-[var(--background)] p-0.5">
          {(["DIRECT", "GROUP"] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setPicked([]);
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                mode === m ? "bg-white text-[var(--text-primary)] shadow-sm" : "text-[var(--text-secondary)]"
              }`}
            >
              {m === "DIRECT" ? "One-to-one" : "Group"}
            </button>
          ))}
        </div>

        {mode === "GROUP" && (
          <input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Group name (e.g. Brisbane Team)"
            className="mb-3 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm outline-none focus:border-[var(--brand)]"
          />
        )}

        <div className="max-h-72 space-y-1 overflow-y-auto">
          {directory.map((u) => {
            const on = picked.includes(u.id);
            return (
              <button
                key={u.id}
                onClick={() => (mode === "DIRECT" ? setPicked([u.id]) : toggle(u.id))}
                className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition ${
                  on ? "bg-blue-50" : "hover:bg-[var(--background)]"
                }`}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                  {initials(...(u.name.split(" ") as [string, string]))}
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-medium text-[var(--text-primary)]">{u.name}</span>
                  <span className="block text-xs text-[var(--text-muted)]">{u.role.toLowerCase()}</span>
                </span>
                {on && (
                  <span className="material-symbols-rounded text-[20px] text-[var(--brand)]">
                    check_circle
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {error && (
          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {error}
          </p>
        )}

        <button
          onClick={go}
          disabled={busy || (mode === "DIRECT" ? picked.length === 0 : !groupName.trim() || picked.length === 0)}
          className="mt-4 w-full rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy
            ? "Opening…"
            : mode === "DIRECT"
              ? "Start chat"
              : `Create group${picked.length ? ` · ${picked.length + 1} people` : ""}`}
        </button>

        {mode === "DIRECT" && (
          <p className="mt-2 text-center text-[11px] text-[var(--text-muted)]">
            You get one direct chat per person — if you already have one with
            them, this opens it rather than starting a second.
          </p>
        )}
      </div>
    </div>
  );
}
