"use client";

import { useState, useTransition } from "react";
import { CopyButton } from "../CopyButton";
import {
  createApiKey,
  rotateApiKey,
  revokeApiKey,
  setNotifyUrl,
  pushNow,
} from "./actions";

/**
 * The export key, on screen.
 *
 * The whole point of this component is the moment after a key is made: it is
 * shown once, in full, and never again, because only its hash is kept. So the
 * copy step is deliberately hard to walk past.
 */

export type KeyRow = {
  id: string;
  name: string;
  prefix: string;
  createdBy: string;
  createdLabel: string;
  expiresLabel: string | null;
  lastUsedLabel: string | null;
  /** "active" | "retiring" | "expired" | "off" */
  state: string;
  retiresLabel: string | null;
  calls: number;
  /** Where we knock when there is new data. Empty until they give us one. */
  notifyUrl: string;
  notifiedLabel: string | null;
  notifyResult: string | null;
};

export function KeyManager({
  keys,
  apiBase,
}: {
  keys: KeyRow[];
  apiBase: string;
}) {
  const [pending, startTx] = useTransition();
  const [fresh, setFresh] = useState<{ key: string; note: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("Omexx");

  const live = keys.filter((k) => k.state === "active" || k.state === "retiring");

  const run = (fn: () => Promise<{ error?: string; key?: string; oldStopsAt?: string }>, note: string) => {
    setError(null);
    startTx(async () => {
      const res = await fn();
      if (res?.error) return setError(res.error);
      if (res?.key) {
        setFresh({
          key: res.key,
          note: res.oldStopsAt
            ? `The old key keeps working until ${new Date(res.oldStopsAt).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}, so there is time to change it over.`
            : note,
        });
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* The one chance to copy it. */}
      {fresh && (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
          <h3 className="flex items-center gap-2 font-bold text-amber-900">
            <span className="material-symbols-rounded text-[20px]">key</span>
            Copy this now. It is never shown again.
          </h3>
          <p className="mt-1 text-sm text-amber-900">
            Only a one-way fingerprint of it is kept here, so nobody at PCG -
            including this screen - can read it back. If it is lost, rotate the
            key and hand over the new one.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="flex-1 break-all rounded-lg border border-amber-300 bg-white px-3 py-2 font-mono text-sm text-slate-900">
              {fresh.key}
            </code>
            <CopyButton value={fresh.key} label="Copy the key" />
          </div>
          <p className="mt-3 text-sm text-amber-900">{fresh.note}</p>
          <p className="mt-2 text-xs text-amber-800">
            Put it straight into the other system. Do not send it in an email or
            a chat message. It does not expire, so this is a one-off: it keeps
            working until you switch it off or rotate it.
          </p>
          <button
            onClick={() => setFresh(null)}
            className="mt-3 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white"
          >
            I have copied it
          </button>
        </div>
      )}

      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {/* ── The keys ── */}
      {keys.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] p-6 text-center">
          <p className="text-sm text-[var(--text-secondary)]">
            No key has been issued. Nothing can read the export API until one is.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Who is it for?"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              disabled={pending}
              onClick={() => {
                const fd = new FormData();
                fd.set("name", name);
                run(() => createApiKey(fd), "Add it to the other system now.");
              }}
              className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {pending ? "Working..." : "Create the key"}
            </button>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {keys.map((k) => (
            <li
              key={k.id}
              className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[var(--text-primary)]">
                      {k.name}
                    </span>
                    <StateChip state={k.state} retiresLabel={k.retiresLabel} />
                  </div>
                  <code className="mt-1 block font-mono text-xs text-[var(--text-muted)]">
                    {k.prefix}...
                  </code>
                  <p className="mt-2 text-xs text-[var(--text-secondary)]">
                    Issued by {k.createdBy} on {k.createdLabel}
                    {k.expiresLabel ? (
                      <> - expires {k.expiresLabel}</>
                    ) : (
                      <> - does not expire</>
                    )}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {k.lastUsedLabel
                      ? `Last used ${k.lastUsedLabel}`
                      : "Never used yet"}
                    {k.calls > 0 && <> - {k.calls} calls in the last 7 days</>}
                  </p>
                </div>

                {(k.state === "active" || k.state === "retiring") && (
                  <div className="flex gap-2">
                    <button
                      disabled={pending}
                      onClick={() => {
                        if (
                          !confirm(
                            `Rotate ${k.name}'s key?\n\nYou will get a new key to give them. The old one keeps working for 24 hours so their sync does not break while they change it over.`,
                          )
                        )
                          return;
                        const fd = new FormData();
                        fd.set("tokenId", k.id);
                        run(() => rotateApiKey(fd), "");
                      }}
                      className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-60"
                    >
                      Rotate
                    </button>
                    <button
                      disabled={pending}
                      onClick={() => {
                        if (
                          !confirm(
                            `Switch off ${k.name}'s key?\n\nIt stops working immediately and their sync will fail until you issue a new one. Do this if you think the key is in the wrong hands.`,
                          )
                        )
                          return;
                        const fd = new FormData();
                        fd.set("tokenId", k.id);
                        run(() => revokeApiKey(fd), "");
                      }}
                      className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-60"
                    >
                      Switch off
                    </button>
                  </div>
                )}
              </div>

              {k.state === "active" && <PushPanel row={k} />}
            </li>
          ))}
        </ul>
      )}

      {live.length > 0 && (
        <div className="rounded-2xl bg-[var(--background)] p-4">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            What to send them
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="flex-1 break-all rounded-lg border border-[var(--border)] bg-white px-3 py-2 font-mono text-xs">
              {apiBase}
            </code>
            <CopyButton value={apiBase} label="Copy the address" />
          </div>
          <p className="mt-2 text-xs text-[var(--text-secondary)]">
            The address goes in an email. The key does not - put that into their
            system yourself. Opening that address with the key returns the list
            of everything available and is the quickest way to prove it works.
          </p>
        </div>
      )}

      {keys.length > 0 && live.length === 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Who is it for?"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            disabled={pending}
            onClick={() => {
              const fd = new FormData();
              fd.set("name", name);
              run(() => createApiKey(fd), "Add it to the other system now.");
            }}
            className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Working..." : "Issue a new key"}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Telling the far end there is something new.
 *
 * The button sends a nudge, not the data: they pull what they want with the
 * key they already hold. Until they give us an address it says so plainly
 * rather than sitting there looking broken.
 */
function PushPanel({ row }: { row: KeyRow }) {
  const [pending, startTx] = useTransition();
  const [url, setUrl] = useState(row.notifyUrl);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = url.trim() !== row.notifyUrl;

  const run = (
    fn: () => Promise<{ error?: string; ok?: boolean; detail?: string; cleared?: boolean }>,
    good: string,
  ) => {
    setMsg(null);
    startTx(async () => {
      const res = await fn();
      if (res?.error) return setMsg({ ok: false, text: res.error });
      setMsg({ ok: true, text: res?.detail ? `${good} ${res.detail}.` : good });
    });
  };

  const fd = (extra?: Record<string, string>) => {
    const f = new FormData();
    f.set("tokenId", row.id);
    for (const [k, v] of Object.entries(extra ?? {})) f.set(k, v);
    return f;
  };

  return (
    <div className="mt-4 border-t border-[var(--border)] pt-4">
      <p className="text-sm font-semibold text-[var(--text-primary)]">
        Tell them when something changes
      </p>
      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
        {row.notifyUrl
          ? "Press Push now and they are told straight away, instead of waiting for their next scheduled pull. We send a nudge, not the data: they come and fetch it with the key they already have."
          : `Ask ${row.name} for a web address to notify, then paste it here. Until then they only see changes on their own schedule.`}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
        />
        <button
          disabled={pending || !dirty}
          onClick={() => run(() => setNotifyUrl(fd({ notifyUrl: url })), "Address saved.")}
          className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-50"
        >
          Save address
        </button>
        <button
          disabled={pending || !row.notifyUrl || dirty}
          onClick={() => run(() => pushNow(fd()), "Pushed.")}
          className="flex items-center gap-1.5 rounded-xl bg-[var(--brand)] px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          <span className="material-symbols-rounded text-[18px]">sync</span>
          {pending ? "Pushing..." : "Push now"}
        </button>
      </div>

      {msg && (
        <p
          className={`mt-2 text-xs font-medium ${
            msg.ok ? "text-emerald-700" : "text-red-600"
          }`}
        >
          {msg.text}
        </p>
      )}
      {!msg && row.notifiedLabel && (
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Last pushed {row.notifiedLabel}
          {row.notifyResult && <> - {row.notifyResult}</>}
        </p>
      )}
    </div>
  );
}

function StateChip({
  state,
  retiresLabel,
}: {
  state: string;
  retiresLabel: string | null;
}) {
  const look: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700",
    retiring: "bg-amber-50 text-amber-800",
    expired: "bg-slate-100 text-slate-500",
    off: "bg-red-50 text-red-700",
  };
  const label: Record<string, string> = {
    active: "working",
    retiring: `stops ${retiresLabel ?? "soon"}`,
    expired: "expired",
    off: "switched off",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${look[state] ?? look.expired}`}
    >
      {label[state] ?? state}
    </span>
  );
}
