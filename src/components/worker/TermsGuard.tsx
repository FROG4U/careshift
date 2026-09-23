"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptTerms } from "@/app/my-shifts/terms/actions";
import type { PendingTerms } from "@/lib/terms";

/**
 * The terms pop-up.
 *
 * Blocks the whole worker app until the person has read the terms and signed.
 * Three things make it an agreement rather than a tick box: they have to reach
 * the bottom of the wording, type their own full name, and sign - by finger or
 * by typing their name. All three, plus the exact time, are recorded against
 * the version they saw.
 */
export function TermsGuard({
  terms,
  suggestedName,
}: {
  terms: PendingTerms;
  suggestedName: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [readToEnd, setReadToEnd] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [fullName, setFullName] = useState(suggestedName);
  const [mode, setMode] = useState<"TYPED" | "DRAWN">("TYPED");
  const [drawn, setDrawn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the page behind from scrolling while this is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // A short document on a big screen can be fully visible without scrolling -
  // don't ask someone to scroll something that has no scroll.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && el.scrollHeight <= el.clientHeight + 8) setReadToEnd(true);
  }, []);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) setReadToEnd(true);
  }

  function submit() {
    setError(null);
    const signature = mode === "DRAWN" ? (drawn ?? "") : fullName.trim();
    if (!agreed) return setError("Tick the box to say you agree.");
    if (fullName.trim().length < 3) return setError("Type your full name.");
    if (!signature) return setError("Add your signature.");

    const fd = new FormData();
    fd.set("termsId", terms.id);
    fd.set("fullName", fullName.trim());
    fd.set("signature", signature);
    fd.set("signatureType", mode);
    start(async () => {
      const res = await acceptTerms(fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-stretch justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="flex h-full w-full max-w-2xl flex-col bg-white sm:h-[92vh] sm:rounded-3xl sm:shadow-2xl">
        {/* Header */}
        <div className="shrink-0 border-b border-slate-200 px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {terms.isUpdate ? "Updated terms" : "Before you start"} · Version{" "}
            {terms.version}
          </p>
          <h2 className="mt-0.5 text-lg font-bold text-slate-900">{terms.title}</h2>
          {terms.changeNote && (
            <p className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <span className="font-semibold">What changed: </span>
              {terms.changeNote}
            </p>
          )}
        </div>

        {/* The terms themselves */}
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="tc-body min-h-0 flex-1 overflow-y-auto px-5 py-4 text-[13.5px]"
          dangerouslySetInnerHTML={{ __html: terms.html }}
        />

        {/* Sign */}
        <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
          {!readToEnd ? (
            <p className="rounded-xl bg-white px-3 py-3 text-center text-sm font-medium text-slate-500">
              Scroll to the end to agree
            </p>
          ) : (
            <>
              <label className="flex items-start gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  I have read and understood these terms, and I agree to them.
                </span>
              </label>

              <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Your full name
              </label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
              />

              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Signature
                </span>
                <div className="ml-auto flex rounded-lg bg-slate-200 p-0.5">
                  {(["TYPED", "DRAWN"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                        mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
                      }`}
                    >
                      {m === "TYPED" ? "Type it" : "Sign it"}
                    </button>
                  ))}
                </div>
              </div>

              {mode === "TYPED" ? (
                <div className="mt-2 flex h-20 items-center justify-center rounded-xl border border-slate-300 bg-white px-3">
                  <span
                    className="text-2xl text-slate-900"
                    style={{ fontFamily: "'Brush Script MT', cursive" }}
                  >
                    {fullName || "Your name"}
                  </span>
                </div>
              ) : (
                <SignaturePad onChange={setDrawn} />
              )}

              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

              <button
                onClick={submit}
                disabled={pending}
                className="mt-3 w-full rounded-xl px-4 py-3.5 text-sm font-bold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
                style={{ background: "var(--brand)" }}
              >
                {pending ? "Saving…" : "Agree and continue"}
              </button>
              <p className="mt-2 text-center text-[11px] text-slate-400">
                Your name, signature and the date and time are recorded against
                version {terms.version}. You can read the terms again any time
                from the menu.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Finger or mouse signature, saved as a small PNG. */
function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    // Size the bitmap to the element so the line isn't stretched or blurry.
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
  }, []);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  return (
    <div className="mt-2">
      <canvas
        ref={ref}
        className="h-20 w-full touch-none rounded-xl border border-slate-300 bg-white"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const ctx = e.currentTarget.getContext("2d");
          if (!ctx) return;
          const { x, y } = pos(e);
          ctx.beginPath();
          ctx.moveTo(x, y);
          drawing.current = true;
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = e.currentTarget.getContext("2d");
          if (!ctx) return;
          const { x, y } = pos(e);
          ctx.lineTo(x, y);
          ctx.stroke();
          setHasInk(true);
        }}
        onPointerUp={(e) => {
          drawing.current = false;
          onChange(e.currentTarget.toDataURL("image/png"));
        }}
      />
      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
        <span>Sign with your finger</span>
        <button
          type="button"
          onClick={() => {
            const canvas = ref.current;
            const ctx = canvas?.getContext("2d");
            if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
            setHasInk(false);
            onChange(null);
          }}
          className="font-semibold text-slate-500 hover:underline"
        >
          {hasInk ? "Clear" : ""}
        </button>
      </div>
    </div>
  );
}
