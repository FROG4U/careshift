"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveDraft, deleteDraft } from "../actions";

/**
 * The draft editor.
 *
 * Plain text in the app's own markup rather than a rich editor: the office can
 * see exactly what a worker will read, nothing can arrive half-formatted, and
 * the same text renders the same way in the pop-up. Preview is what was last
 * saved, so "Save" and "look at it" are one action.
 */
export function TermsEditor({
  id,
  title,
  content,
  changeNote,
  preview,
  canPublish,
}: {
  id: string;
  title: string;
  content: string;
  changeNote: string;
  preview: string;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ title, content, changeNote });
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"edit" | "preview">("edit");

  const dirty =
    form.title !== title ||
    form.content !== content ||
    form.changeNote !== changeNote;

  function save() {
    setError(null);
    setMsg(null);
    const fd = new FormData();
    fd.set("id", id);
    fd.set("title", form.title);
    fd.set("content", form.content);
    fd.set("changeNote", form.changeNote);
    start(async () => {
      const res = await saveDraft(fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setMsg("Saved");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm">
        <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          Title
        </label>
        <input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
        />

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          What changed in this version
        </label>
        <input
          value={form.changeNote}
          onChange={(e) => setForm({ ...form, changeNote: e.target.value })}
          placeholder="e.g. Added the attendance clause and updated the office number"
          className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Workers see this line on the pop-up, so they know why they are being
          asked to agree again.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
        <div className="flex items-center gap-1 border-b border-[var(--border)] px-3 py-2">
          {(["edit", "preview"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                tab === t
                  ? "bg-[var(--brand)] text-white"
                  : "text-[var(--text-secondary)] hover:bg-[var(--background)]"
              }`}
            >
              {t === "edit" ? "Wording" : "Preview (saved)"}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            {msg && <span className="text-xs font-medium text-emerald-700">{msg}</span>}
            {dirty && (
              <span className="text-xs font-medium text-amber-700">
                Unsaved changes
              </span>
            )}
            <button
              onClick={save}
              disabled={pending || !dirty}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
              style={{ background: "var(--brand)" }}
            >
              {pending ? "Saving…" : "Save draft"}
            </button>
          </div>
        </div>

        {tab === "edit" ? (
          <div className="p-4">
            <textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              spellCheck
              className="h-[32rem] w-full resize-y rounded-xl border border-[var(--border)] p-4 font-mono text-[13px] leading-relaxed"
            />
            <details className="mt-3 text-xs text-[var(--text-secondary)]">
              <summary className="cursor-pointer font-semibold">
                How to format it
              </summary>
              <ul className="mt-2 space-y-1 pl-4">
                <li>
                  <code>## Heading</code> starts a clause. Numbers are added
                  automatically, so you can insert one anywhere.
                </li>
                <li>
                  <code>### Heading</code> is a sub-heading inside a clause.
                </li>
                <li>
                  <code>- text</code> is a bullet, <code>1. text</code> is a
                  numbered step.
                </li>
                <li>
                  <code>&gt; text</code> is a note box, <code>&gt;! text</code>{" "}
                  is a red &quot;never do this&quot; box, <code>&gt;+ text</code>{" "}
                  is a green &quot;this protects you&quot; box.
                </li>
                <li>
                  <code>| one | two |</code> makes a table row. The first row is
                  the heading.
                </li>
                <li>
                  <code>**bold**</code> makes text bold. A blank line starts a
                  new paragraph.
                </li>
              </ul>
            </details>
          </div>
        ) : (
          <div className="p-6">
            {dirty && (
              <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                This is the last saved wording. Save to see your latest changes.
              </p>
            )}
            <h2 className="mb-4 text-lg font-bold text-[var(--text-primary)]">
              {title}
            </h2>
            <div
              className="tc-body text-sm"
              dangerouslySetInnerHTML={{ __html: preview }}
            />
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!canPublish && (
        <p className="text-sm text-[var(--text-secondary)]">
          A super admin publishes this to the workers.
        </p>
      )}

      <button
        type="button"
        onClick={() => {
          if (!confirm("Delete this draft? The wording is not recoverable.")) return;
          const fd = new FormData();
          fd.set("id", id);
          start(async () => {
            const res = await deleteDraft(fd);
            if (res?.error) setError(res.error);
          });
        }}
        disabled={pending}
        className="text-sm font-medium text-red-600 hover:underline disabled:opacity-60"
      >
        Delete this draft
      </button>
    </div>
  );
}
