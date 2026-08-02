"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { initials } from "@/lib/format";
import {
  sendMessage,
  toggleReaction,
  uploadAttachment,
} from "../actions";

export type Member = { id: string; name: string };
export type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  attachmentUrl: string | null;
  attachmentType: string | null;
  createdAt: string;
  replyTo: { senderName: string; body: string } | null;
  likes: { userId: string; name: string }[];
};

function time(iso: string) {
  return new Date(iso).toLocaleTimeString("en-AU", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Render @mentions bold. */
function renderBody(body: string) {
  return body.split(/(@[\w']+)/g).map((part, i) =>
    part.startsWith("@") ? (
      <span key={i} className="font-semibold text-sky-200 [.bubble-them_&]:text-sky-600">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export function Thread({
  conversationId,
  title,
  isGroup,
  memberCount,
  meId,
  members,
  messages,
  backHref,
}: {
  conversationId: string;
  title: string;
  isGroup: boolean;
  memberCount: number;
  meId: string;
  members: Member[];
  messages: ChatMessage[];
  /** Where the back arrow goes. When set, the arrow always shows (worker app). */
  backHref?: string;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [attach, setAttach] = useState<{ url: string; type: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [mention, setMention] = useState<Member[] | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to newest.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Poll for new messages while the thread is open (near real-time).
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [router]);

  function onType(v: string) {
    setText(v);
    // @mention autocomplete on the last token.
    const m = v.match(/@(\w*)$/);
    if (m) {
      const q = m[1].toLowerCase();
      setMention(members.filter((mm) => mm.name.toLowerCase().includes(q)).slice(0, 5));
    } else setMention(null);
  }

  function pickMention(name: string) {
    setText((t) => t.replace(/@\w*$/, `@${name.split(" ")[0]} `));
    setMention(null);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    const res = await uploadAttachment(fd);
    if (res) setAttach(res);
    e.target.value = "";
  }

  async function send() {
    if ((!text.trim() && !attach) || sending) return;
    setSending(true);
    const fd = new FormData();
    fd.set("conversationId", conversationId);
    fd.set("body", text.trim());
    if (replyTo) fd.set("parentId", replyTo.id);
    if (attach) {
      fd.set("attachmentUrl", attach.url);
      fd.set("attachmentType", attach.type);
    }
    await sendMessage(fd);
    setText("");
    setReplyTo(null);
    setAttach(null);
    setMention(null);
    setSending(false);
    router.refresh();
  }

  return (
    <div className="flex h-full w-full flex-col bg-[var(--background)]">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-[var(--border)] bg-white px-4 py-2.5">
        <Link href={backHref ?? "/messages"} className={backHref ? "" : "md:hidden"}>
          <span className="material-symbols-rounded text-[24px] text-[var(--brand)]">
            arrow_back_ios
          </span>
        </Link>
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white ${
            isGroup ? "bg-violet-500" : "bg-[var(--brand)]"
          }`}
        >
          {isGroup ? (
            <span className="material-symbols-rounded text-[18px]">group</span>
          ) : (
            initials(...(title.split(" ") as [string, string]))
          )}
        </span>
        <div className="leading-tight">
          <div className="font-semibold text-[var(--text-primary)]">{title}</div>
          {isGroup && (
            <div className="text-xs text-[var(--text-muted)]">{memberCount} people</div>
          )}
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 space-y-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-[var(--text-muted)]">
            Say hello 👋
          </p>
        )}
        {messages.map((m, i) => {
          const mine = m.senderId === meId;
          const prev = messages[i - 1];
          const showName = isGroup && !mine && prev?.senderId !== m.senderId;
          const iLiked = m.likes.some((l) => l.userId === meId);
          return (
            <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
              {showName && (
                <span className="mb-0.5 ml-2 text-[11px] font-medium text-[var(--text-muted)]">
                  {m.senderName}
                </span>
              )}
              <div className={`group/msg flex max-w-[78%] items-end gap-1.5 ${mine ? "flex-row-reverse" : ""}`}>
                <div className="relative">
                  {/* Reply quote */}
                  {m.replyTo && (
                    <div className={`mb-1 rounded-lg px-2.5 py-1 text-xs ${mine ? "bg-blue-100 text-blue-900" : "bg-slate-200 text-slate-600"}`}>
                      <span className="font-semibold">{m.replyTo.senderName}</span>{" "}
                      <span className="opacity-80">{m.replyTo.body.slice(0, 60)}</span>
                    </div>
                  )}
                  <div
                    className={`bubble ${mine ? "bubble-me" : "bubble-them"} whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] leading-snug ${
                      mine
                        ? "bg-[var(--brand)] text-white"
                        : "bg-white text-[var(--text-primary)] shadow-sm"
                    }`}
                    onDoubleClick={() => {
                      const fd = new FormData();
                      fd.set("messageId", m.id);
                      toggleReaction(fd).then(() => router.refresh());
                    }}
                  >
                    {m.attachmentUrl && m.attachmentType === "image" && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.attachmentUrl}
                        alt="attachment"
                        className="mb-1 max-h-64 rounded-xl"
                      />
                    )}
                    {m.body && <span>{renderBody(m.body)}</span>}
                    <span className={`ml-2 align-bottom text-[10px] ${mine ? "text-white/70" : "text-slate-400"}`}>
                      {time(m.createdAt)}
                    </span>
                  </div>
                  {/* Like badge */}
                  {m.likes.length > 0 && (
                    <div
                      className={`absolute -bottom-2 ${mine ? "left-1" : "right-1"} flex items-center gap-0.5 rounded-full border border-[var(--border)] bg-white px-1.5 py-0.5 text-[11px] shadow-sm`}
                      title={m.likes.map((l) => l.name).join(", ")}
                    >
                      ❤️ {m.likes.length}
                    </div>
                  )}
                </div>

                {/* Hover actions */}
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover/msg:opacity-100">
                  <button
                    onClick={() => {
                      const fd = new FormData();
                      fd.set("messageId", m.id);
                      toggleReaction(fd).then(() => router.refresh());
                    }}
                    className={`flex h-7 w-7 items-center justify-center rounded-full hover:bg-slate-100 ${iLiked ? "grayscale-0" : "opacity-60"}`}
                    title="Like"
                  >
                    ❤️
                  </button>
                  <button
                    onClick={() => setReplyTo(m)}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                    title="Reply"
                  >
                    <span className="material-symbols-rounded text-[16px]">reply</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-[var(--border)] bg-white px-3 py-2">
        {replyTo && (
          <div className="mb-2 flex items-center justify-between rounded-lg bg-[var(--background)] px-3 py-1.5 text-xs">
            <span className="truncate text-[var(--text-secondary)]">
              Replying to <b>{replyTo.senderName}</b>: {replyTo.body.slice(0, 50)}
            </span>
            <button onClick={() => setReplyTo(null)} className="text-[var(--text-muted)]">✕</button>
          </div>
        )}
        {attach && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-[var(--background)] px-3 py-1.5 text-xs">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={attach.url} alt="" className="h-10 w-10 rounded object-cover" />
            <span className="flex-1 text-[var(--text-secondary)]">Photo attached</span>
            <button onClick={() => setAttach(null)} className="text-[var(--text-muted)]">✕</button>
          </div>
        )}

        {/* @mention picker */}
        {mention && mention.length > 0 && (
          <div className="mb-2 overflow-hidden rounded-xl border border-[var(--border)]">
            {mention.map((mm) => (
              <button
                key={mm.id}
                onClick={() => pickMention(mm.name)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--background)]"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">
                  {initials(...(mm.name.split(" ") as [string, string]))}
                </span>
                {mm.name}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
          <button
            onClick={() => camRef.current?.click()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--brand)] hover:bg-[var(--background)]"
            title="Take photo"
          >
            <span className="material-symbols-rounded text-[22px]">photo_camera</span>
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--brand)] hover:bg-[var(--background)]"
            title="Attach"
          >
            <span className="material-symbols-rounded text-[22px]">image</span>
          </button>
          <textarea
            value={text}
            onChange={(e) => onType(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Message…  use @ to mention"
            className="max-h-28 flex-1 resize-none rounded-2xl border border-[var(--border)] bg-[var(--background)] px-3.5 py-2 text-[15px] outline-none focus:border-[var(--brand)]"
          />
          <button
            onClick={send}
            disabled={sending || (!text.trim() && !attach)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-white disabled:opacity-40"
            title="Send"
          >
            <span className="material-symbols-rounded text-[20px]">arrow_upward</span>
          </button>
        </div>
      </div>
    </div>
  );
}
