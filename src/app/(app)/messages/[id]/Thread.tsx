"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { initialsFromName } from "@/lib/format";
import { EmojiPicker } from "@/components/EmojiPicker";
import { GroupPanel, type PanelMember } from "./GroupPanel";
import {
  sendMessage,
  toggleReaction,
  setTyping,
  clearTyping,
  deleteMessage,
  uploadAttachment,
} from "../actions";

export type Member = { id: string; name: string };
export type ChatMessage = {
  /** True once the sender has deleted it — content is gone, row remains. */
  deleted?: boolean;
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
  callNumber,
  panel,
  online,
  presence,
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
  /** The other person's phone (DMs only) — shows a tap-to-call button. */
  callNumber?: string | null;
  panel?: {
    isOwner: boolean;
    archived: boolean;
    members: PanelMember[];
    directory: PanelMember[];
  };
  /** Presence (DMs only): whether the other person is online + a status label. */
  online?: boolean;
  presence?: string | null;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [attach, setAttach] = useState<{ url: string; type: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [mention, setMention] = useState<Member[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  /** Messages typed but not yet confirmed by the server. */
  const [pending, setPending] = useState<
    { key: string; body: string; attachmentUrl: string | null }[]
  >([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const atBottomRef = useRef(true);

  // Anything the server has now confirmed can stop being shown optimistically.
  useEffect(() => {
    if (pending.length === 0) return;
    setPending((p) =>
      p.filter(
        (o) =>
          !messages.some(
            (m) => m.body === o.body && m.senderId === meId,
          ),
      ),
    );
    // Only reconcile when the server list actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  /**
   * Scroll to the newest message — but only if the reader was already at the
   * bottom. Yanking someone back down while they're reading history is the
   * quickest way to make a chat feel broken.
   */
  useEffect(() => {
    if (!atBottomRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, pending.length]);

  // Who's typing, and who has seen the latest message.
  const [typing, setTyping_] = useState<string[]>([]);
  const [readers, setReaders] = useState<string[]>([]);
  const [lastMine, setLastMine] = useState(false);
  const countRef = useRef<number | null>(null);

  /**
   * Light poll for typing + read receipts. A full page refresh only happens
   * when the message count actually changes, so the indicator can be
   * responsive without re-rendering the thread every couple of seconds.
   */
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/chat/state?c=${conversationId}`, {
          cache: "no-store",
        });
        if (!res.ok || !alive) return;
        const data = await res.json();
        setTyping_(data.typing ?? []);
        setReaders(data.readers ?? []);
        setLastMine(Boolean(data.lastMessageMine));
        if (countRef.current !== null && data.count !== countRef.current) {
          router.refresh();
        }
        countRef.current = data.count;
      } catch {
        /* offline — try again on the next tick */
      }
    };
    tick();
    const t = setInterval(tick, 2500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [conversationId, router]);

  /**
   * Poll for new messages, but only while the tab is actually visible —
   * a backgrounded thread refreshing every 5s wastes the worker's data and
   * battery for nothing. Refresh immediately when it regains focus so it is current.
   */
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(() => router.refresh(), 5000);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
        start();
      } else stop();
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
  }, [router]);

  // Tell the others I'm typing, at most once every couple of seconds.
  const lastPing = useRef(0);
  function pingTyping() {
    const now = Date.now();
    if (now - lastPing.current < 2000) return;
    lastPing.current = now;
    setTyping(conversationId).catch(() => {});
  }

  function onType(v: string) {
    setText(v);
    if (v.trim()) pingTyping();
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

  /**
   * Shrink an image before upload.
   *
   * A photo straight off a phone or camera is routinely 5-15MB, which blew
   * past the server's 8MB cap and failed silently — the commonest reason
   * attaching "didn't work". Resizing to 1600px also makes it upload in a
   * fraction of the time on mobile data.
   */
  async function compress(file: File): Promise<Blob> {
    if (!file.type.startsWith("image/")) return file;
    const bitmap = await createImageBitmap(file).catch(() => null);
    if (!bitmap) return file;

    const max = 1600;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.8),
    );
  }

  /** Shared by the file picker, the camera, drag-and-drop and paste. */
  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    setUploadError(null);

    if (!file.type.startsWith("image/")) {
      setUploadError("Only images can be attached.");
      return;
    }

    setUploading(true);
    try {
      const blob = await compress(file);
      if (blob.size > 8 * 1024 * 1024) {
        setUploadError("That image is too large, even after shrinking.");
        return;
      }
      const fd = new FormData();
      fd.set(
        "file",
        new File([blob], file.name.replace(/\.\w+$/, ".jpg"), {
          type: blob.type || "image/jpeg",
        }),
      );
      const res = await uploadAttachment(fd);
      if (res) setAttach(res);
      else setUploadError("Couldn't upload that image. Please try again.");
    } catch {
      setUploadError("Couldn't read that image.");
    } finally {
      setUploading(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    await handleFile(e.target.files?.[0]);
    e.target.value = "";
  }

  async function send() {
    const body = text.trim();
    if ((!body && !attach) || sending) return;

    setSending(true);
    const fd = new FormData();
    fd.set("conversationId", conversationId);
    fd.set("body", body);
    if (replyTo) fd.set("parentId", replyTo.id);
    if (attach) {
      fd.set("attachmentUrl", attach.url);
      fd.set("attachmentType", attach.type);
    }

    // Show it straight away rather than after a server round-trip — a chat
    // that pauses on every send feels broken on a poor connection.
    const key = `${Date.now()}-${Math.random()}`;
    setPending((p) => [...p, { key, body, attachmentUrl: attach?.url ?? null }]);

    // Clear the composer immediately so they can keep typing.
    setText("");
    setReplyTo(null);
    setAttach(null);
    setMention(null);
    atBottomRef.current = true;

    try {
      await sendMessage(fd);
      clearTyping(conversationId).catch(() => {});
      router.refresh();
    } catch {
      // Put it back so nothing is silently lost.
      setPending((p) => p.filter((o) => o.key !== key));
      setText(body);
      setUploadError("Message didn't send. Please try again.");
    } finally {
      setSending(false);
    }
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
        <span className="relative shrink-0">
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white ${
              isGroup ? "bg-violet-500" : "bg-[var(--brand)]"
            }`}
          >
            {isGroup ? (
              <span className="material-symbols-rounded text-[18px]">group</span>
            ) : (
              initialsFromName(title)
            )}
          </span>
          {!isGroup && online && (
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-green-500" />
          )}
        </span>
        <div className="leading-tight">
          <div className="font-semibold text-[var(--text-primary)]">{title}</div>
          {isGroup ? (
            <div className="text-xs text-[var(--text-muted)]">{memberCount} people</div>
          ) : presence ? (
            <div className="flex items-center gap-1 text-xs">
              {online && <span className="h-1.5 w-1.5 rounded-full bg-green-500" />}
              <span className={online ? "font-medium text-green-600" : "text-[var(--text-muted)]"}>
                {presence}
              </span>
            </div>
          ) : null}
        </div>
        {!isGroup && callNumber && (
          <a
            href={`tel:${callNumber}`}
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-[var(--brand)] transition hover:bg-[var(--background)]"
            title={`Call ${title}`}
            aria-label={`Call ${title}`}
          >
            <span className="material-symbols-rounded text-[24px]">call</span>
          </a>
        )}

        {panel && (
          <div className={callNumber && !isGroup ? "" : "ml-auto"}>
            <GroupPanel
              conversationId={conversationId}
              title={title}
              isGroup={isGroup}
              isOwner={panel.isOwner}
              archived={panel.archived}
              members={panel.members}
              directory={panel.directory}
              meId={meId}
            />
          </div>
        )}
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          // 80px of slack so "near enough" still counts as at the bottom.
          atBottomRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
        className={`relative flex-1 space-y-1 overflow-y-auto px-4 py-4 ${
          dragOver ? "bg-[var(--brand)]/5 ring-2 ring-inset ring-[var(--brand)]/30" : ""
        }`}
      >
        {dragOver && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <span className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white shadow-lg">
              Drop the image to attach it
            </span>
          </div>
        )}
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
                  {m.deleted ? (
                    <div className="rounded-2xl border border-dashed border-[var(--border)] px-3.5 py-2 text-[13px] italic text-[var(--text-muted)]">
                      This message was deleted
                    </div>
                  ) : (
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
                  )}
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

                {/* Actions — always visible on touch, hover-reveal on desktop */}
                <div className="flex shrink-0 items-center gap-0.5 opacity-70 transition md:opacity-0 md:group-hover/msg:opacity-100">
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
                  {/* Only the sender can delete, and only their own message */}
                  {mine && !m.deleted && (
                    <button
                      onClick={() => {
                        if (!confirm("Delete this message?")) return;
                        const fd = new FormData();
                        fd.set("id", m.id);
                        deleteMessage(fd).then(() => router.refresh());
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:bg-red-50 hover:text-red-600"
                      title="Delete"
                    >
                      <span className="material-symbols-rounded text-[16px]">delete</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {/* Seen receipt on my own latest message */}
        {lastMine && readers.length > 0 && pending.length === 0 && (
          <div className="flex justify-end pr-1">
            <span className="text-[11px] text-[var(--text-muted)]">
              Seen{isGroup ? ` by ${readers.length}` : ""}
            </span>
          </div>
        )}

        {/* Someone is typing */}
        {typing.length > 0 && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-white px-3 py-2 shadow-sm">
              <span className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
              </span>
              <span className="text-xs text-[var(--text-secondary)]">
                {typing.length === 1
                  ? `${typing[0].split(" ")[0]} is typing`
                  : `${typing.length} people are typing`}
              </span>
            </div>
          </div>
        )}

        {/* Sent, awaiting the server */}
        {pending.map((o) => (
          <div key={o.key} className="flex justify-end">
            <div className="max-w-[75%] rounded-2xl rounded-br-md bg-[var(--brand)]/70 px-3.5 py-2 text-white">
              {o.attachmentUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={o.attachmentUrl}
                  alt=""
                  className="mb-1 max-h-52 rounded-lg object-cover opacity-80"
                />
              )}
              {o.body && <p className="whitespace-pre-wrap text-sm">{o.body}</p>}
              <span className="mt-0.5 block text-right text-[10px] text-white/70">
                sending…
              </span>
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-[var(--border)] bg-white px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
        {replyTo && (
          <div className="mb-2 flex items-center justify-between rounded-lg bg-[var(--background)] px-3 py-1.5 text-xs">
            <span className="truncate text-[var(--text-secondary)]">
              Replying to <b>{replyTo.senderName}</b>: {replyTo.body.slice(0, 50)}
            </span>
            <button onClick={() => setReplyTo(null)} className="text-[var(--text-muted)]">✕</button>
          </div>
        )}
        {uploading && (
          <div className="mb-2 flex items-center gap-2 rounded-xl bg-[var(--background)] px-3 py-2 text-xs text-[var(--text-secondary)]">
            <span className="material-symbols-rounded animate-spin text-[16px]">
              progress_activity
            </span>
            Preparing image…
          </div>
        )}

        {uploadError && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
            <span>{uploadError}</span>
            <button
              onClick={() => setUploadError(null)}
              className="font-semibold text-red-500"
            >
              Dismiss
            </button>
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
                  {initialsFromName(mm.name)}
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
          <EmojiPicker onPick={(e) => setText((t) => t + e)} />
          <textarea
            value={text}
            onChange={(e) => onType(e.target.value)}
            onPaste={(e) => {
              // Paste a screenshot straight into the chat — the way people
              // actually share things on a desktop.
              const item = Array.from(e.clipboardData.items).find((i) =>
                i.type.startsWith("image/"),
              );
              if (item) {
                e.preventDefault();
                handleFile(item.getAsFile());
              }
            }}
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
