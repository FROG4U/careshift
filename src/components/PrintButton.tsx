"use client";

/**
 * Explicit "Print / Save as PDF" control for the standalone document pages.
 *
 * Deliberately NOT an auto-print: firing window.print() on load hijacks the
 * page before the reader has seen it, and if they cancel the dialog they're
 * left on a bare document with no obvious way back. Both controls hide when
 * actually printing.
 */
export function PrintButton({ backHref }: { backHref?: string }) {
  return (
    <div className="no-print mb-5 flex items-center gap-2 print:hidden">
      <button
        onClick={() => window.print()}
        className="flex items-center gap-2 rounded-lg bg-[var(--brand,#003146)] px-4 py-2 text-sm font-semibold text-white shadow-sm"
      >
        <span className="material-symbols-rounded text-[18px]">print</span>
        Print / Save as PDF
      </button>
      {backHref && (
        <a
          href={backHref}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600"
        >
          Back
        </a>
      )}
      <span className="text-xs text-slate-500">
        In the print dialog choose <strong>Save as PDF</strong> as the printer.
      </span>
    </div>
  );
}
