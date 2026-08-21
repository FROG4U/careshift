"use client";

import { useState } from "react";
import {
  addGroupMembers,
  removeGroupMember,
  deleteConversation,
  toggleArchive,
} from "../actions";
import { initialsFromName } from "@/lib/format";
import { Sheet } from "@/components/ui/Sheet";

export type PanelMember = { id: string; name: string; role: string };

/**
 * Group details: who's in it, adding and removing people, archiving, and
 * deleting the group.
 *
 * Only the person who created the group can remove others or delete it —
 * anyone can leave. A direct chat can't be deleted at all, only archived, so
 * one person can't erase a two-way record of what was said about someone's
 * care.
 */
export function GroupPanel({
  conversationId,
  title,
  isGroup,
  isOwner,
  archived,
  members,
  directory,
  meId,
}: {
  conversationId: string;
  title: string;
  isGroup: boolean;
  isOwner: boolean;
  archived: boolean;
  members: PanelMember[];
  directory: PanelMember[];
  meId: string;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const memberIds = new Set(members.map((m) => m.id));
  const addable = directory.filter((d) => !memberIds.has(d.id));

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Details"
        aria-label="Conversation details"
        className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--background)]"
      >
        <span className="material-symbols-rounded text-[22px]">info</span>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} labelledBy="group-panel-title">
        <h2 id="group-panel-title" className="text-lg font-bold text-slate-900">
          {title}
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">
          {isGroup ? `${members.length} people` : "Direct message"}
        </p>

        {/* Members */}
        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            People
          </div>
          <ul className="space-y-1">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-3 rounded-xl px-2 py-2"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                  {initialsFromName(m.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">
                    {m.name}
                    {m.id === meId && " (you)"}
                  </span>
                  <span className="block text-xs text-slate-500">{m.role}</span>
                </span>

                {isGroup && (m.id === meId || isOwner) && (
                  <form action={removeGroupMember}>
                    <input type="hidden" name="conversationId" value={conversationId} />
                    <input type="hidden" name="userId" value={m.id} />
                    <button className="text-xs font-semibold text-slate-400 hover:text-red-600">
                      {m.id === meId ? "Leave" : "Remove"}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Add people */}
        {isGroup && addable.length > 0 && (
          <div className="mt-4">
            {adding ? (
              <form
                action={async (fd) => {
                  await addGroupMembers(fd);
                  setPicked([]);
                  setAdding(false);
                }}
              >
                <input type="hidden" name="conversationId" value={conversationId} />
                <div className="mb-2 max-h-44 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-1">
                  {addable.map((d) => (
                    <label
                      key={d.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        name="userIds"
                        value={d.id}
                        checked={picked.includes(d.id)}
                        onChange={() =>
                          setPicked((p) =>
                            p.includes(d.id)
                              ? p.filter((x) => x !== d.id)
                              : [...p, d.id],
                          )
                        }
                      />
                      <span className="flex-1 truncate">{d.name}</span>
                      <span className="text-xs text-slate-400">{d.role}</span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={picked.length === 0}
                    className="flex-1 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                  >
                    Add {picked.length || ""}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAdding(false);
                      setPicked([]);
                    }}
                    className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setAdding(true)}
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700"
              >
                + Add people
              </button>
            )}
          </div>
        )}

        {/* Archive / delete */}
        <div className="mt-5 space-y-2 border-t border-slate-100 pt-4">
          <form action={toggleArchive}>
            <input type="hidden" name="conversationId" value={conversationId} />
            <button className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">
              {archived ? "Unarchive" : "Archive"} this conversation
            </button>
          </form>
          <p className="text-center text-[11px] text-slate-400">
            Archiving only hides it for you.
          </p>

          {isGroup && isOwner && (
            <form
              action={deleteConversation}
              onSubmit={(e) => {
                if (
                  !confirm(
                    "Delete this group for everyone? The messages cannot be recovered.",
                  )
                ) {
                  e.preventDefault();
                }
              }}
            >
              <input type="hidden" name="conversationId" value={conversationId} />
              <button className="mt-2 w-full rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600">
                Delete group for everyone
              </button>
            </form>
          )}

          {!isGroup && (
            <p className="text-center text-[11px] text-slate-400">
              Direct messages can&apos;t be deleted — both people keep the record.
            </p>
          )}
        </div>
      </Sheet>
    </>
  );
}
