"use client";

import { useEffect } from "react";

/**
 * Explicit "Print / Save as PDF" control for the standalone document pages.
 *
 * Deliberately NOT an auto-print: firing window.print() on load hijacks the
 * page before the reader has seen it, and if they cancel the dialog they're
 * left on a bare document with no obvious way back. Both controls hide when
 * actually printing.
 */
export function PrintButton({
  backHref,
  downloadHref,
  auto = false,
}: {
  backHref?: string;
  /** Straight PDF download, for readers whose print dialog is no help. */
  downloadHref?: string;
  /** Open the print dialog once the document has rendered. */
  auto?: boolean;
}) {
  useEffect(() => {
    if (!auto) return;
    // Long enough for fonts and the logo to land - printing mid-render is how
    // a document comes out half empty.
    const t = setTimeout(() => window.print(), 700);
    return () => clearTimeout(t);
  }, [auto]);

  return (
    <div className="no-print mb-5 flex items-center gap-2 print:hidden">
      <button
        onClick={() => window.print()}
        className="flex items-center gap-2 rounded-lg bg-[var(--brand,#003146)] px-4 py-2 text-sm font-semibold text-white shadow-sm"
      >
        <span className="material-symbols-rounded text-[18px]">print</span>
        Print / Save as PDF
      </button>
      {downloadHref && (
        <a
          href={downloadHref}
          className="flex items-center gap-2 rounded-lg border border-[var(--brand,#003146)] px-4 py-2 text-sm font-semibold text-[var(--brand,#003146)]"
        >
          <span className="material-symbols-rounded text-[18px]">download</span>
          Download PDF
        </a>
      )}
      {backHref && (
        <a
          href={backHref}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600"
        >
          Back
        </a>
      )}
      <span className="text-xs text-slate-500">
        Download saves the file straight away. Print is there if you want paper.
      </span>
    </div>
  );
}
