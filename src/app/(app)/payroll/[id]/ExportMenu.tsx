"use client";

import { useEffect, useRef, useState } from "react";

export type WorkerOption = { id: string; name: string };

/**
 * Export dropdown for a pay run: CSV or PDF, for everyone or one worker.
 * PDF uses the browser's print dialog (Save as PDF) against a print stylesheet
 * on the report page — no server-side PDF engine needed.
 */
export function ExportMenu({
  periodId,
  workers,
}: {
  periodId: string;
  workers: WorkerOption[];
}) {
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState(""); // "" = everyone
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const csvUrl = (detail: boolean) => {
    const p = new URLSearchParams();
    if (who) p.set("staff", who);
    if (detail) p.set("detail", "1");
    const q = p.toString();
    return `/payroll/${periodId}/export${q ? `?${q}` : ""}`;
  };

  function printPdf() {
    // Standalone official document (no sidebar/notification) that auto-prints.
    const q = who ? `?staff=${who}` : "";
    window.open(`/payroll-doc/${periodId}${q}`, "_blank");
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--background)]"
      >
        <span className="material-symbols-rounded text-[18px]">download</span>
        Export
        <span className="material-symbols-rounded text-[18px]">expand_more</span>
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-[var(--border)] bg-white p-3 shadow-xl">
          <label className="block text-xs font-semibold text-[var(--text-secondary)]">
            Who to include
            <select
              value={who}
              onChange={(e) => setWho(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand)]"
            >
              <option value="">Everyone in this pay run</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>

          <div className="my-2 border-t border-[var(--border)]" />

          <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Spreadsheet (CSV)
          </p>
          <a
            href={csvUrl(false)}
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm whitespace-nowrap text-[var(--text-primary)] hover:bg-[var(--background)]"
            onClick={() => setOpen(false)}
          >
            <span className="material-symbols-rounded text-[18px] text-emerald-600">
              table_view
            </span>
            Summary (one row per worker)
          </a>
          <a
            href={csvUrl(true)}
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm whitespace-nowrap text-[var(--text-primary)] hover:bg-[var(--background)]"
            onClick={() => setOpen(false)}
          >
            <span className="material-symbols-rounded text-[18px] text-emerald-600">
              format_list_bulleted
            </span>
            Detailed (one row per shift)
          </a>

          <div className="my-2 border-t border-[var(--border)]" />

          <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Document (PDF)
          </p>
          <button
            onClick={printPdf}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm whitespace-nowrap text-[var(--text-primary)] hover:bg-[var(--background)]"
          >
            <span className="material-symbols-rounded text-[18px] text-red-600">
              picture_as_pdf
            </span>
            Print / Save as PDF
          </button>
        </div>
      )}
    </div>
  );
}

/** Auto-opens the print dialog when the report is loaded with ?print=. */
export function PrintTrigger() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);
  return null;
}
