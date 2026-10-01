import "server-only";
import PDFDocument from "pdfkit";
import type { NotesDoc } from "./shiftNotes";

/**
 * The shift notes record, written as a real PDF.
 *
 * Not the browser's print dialog: printing to PDF depends on the reader's
 * printer setup, drops background colours, and on a managed machine can come
 * out blank. Writing the pages here means the file is identical for everyone
 * and the text stays selectable and searchable, which is what an auditor or a
 * plan manager needs.
 */

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const CONTENT = A4.width - MARGIN * 2;

/**
 * Make text safe for the PDF's built-in font.
 *
 * Notes are routinely pasted out of Word or a phone keyboard, which brings
 * carriage returns, curly quotes, en dashes and non-breaking spaces. The
 * standard PDF fonts only cover WinAnsi, so anything outside it came out as a
 * stray capital eth - a page of notes peppered with "D" shapes. Line endings
 * are normalised and the common typographic characters are mapped to their
 * plain equivalents rather than dropped, so the wording survives.
 */
function clean(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2012\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/[\u2022\u25CF\u25AA]/g, "-")
    .replace(/[\u2705\u2714\u2713]/g, "[x]")
    // Anything still outside Latin-1 has no glyph in the built-in fonts.
    .replace(/[^\u0000-\u00FF\n]/g, "")
    // Control characters would draw as boxes.
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type PdfMeta = {
  tenantName: string;
  brand: string;
  generatedBy: string;
};

export async function renderShiftNotesPdf(
  doc: NotesDoc,
  meta: PdfMeta,
  /**
   * "notes" is the care record: every word the worker wrote.
   * "hours" is the timesheet: rostered against clocked, and nothing else -
   * the version you hand to a bookkeeper or put in front of a worker who is
   * querying their pay, without the participant's private details in it.
   */
  mode: "notes" | "hours" = "notes",
): Promise<Buffer> {
  const tenant = { name: meta.tenantName };
  const session = { name: meta.generatedBy };
  const brand = meta.brand;
  const generated = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());

  const pdf = new PDFDocument({
    size: "A4",
    // Pages are kept in memory so the footer can say "page 2 of 7" - the
    // total is only known once the last shift has been written.
    bufferPages: true,
    margins: { top: MARGIN, bottom: MARGIN + 18, left: MARGIN, right: MARGIN },
    info: {
      Title: `${mode === "hours" ? "Hours" : "Shift notes"} - ${doc.rangeText}`,
      Author: tenant.name,
      Subject: "Shift notes record",
    },
  });

  const chunks: Buffer[] = [];
  pdf.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) =>
    pdf.on("end", () => resolve(Buffer.concat(chunks))),
  );

  // ── Letterhead ────────────────────────────────────────────────────────
  pdf.rect(MARGIN, MARGIN, CONTENT, 3).fill(brand);
  pdf.fillColor("#0f172a").font("Helvetica-Bold").fontSize(16);
  pdf.text(tenant.name, MARGIN, MARGIN + 14);
  pdf.font("Helvetica").fontSize(9).fillColor("#64748b");
  pdf.text(mode === "hours" ? "Hours Record" : "Shift Notes Record", {
    continued: false,
  });
  pdf.text(`Generated ${generated} by ${session.name}`);
  if (mode === "notes") {
    pdf.text("Contains participant care information - handle confidentially");
  }

  pdf.moveDown(1);
  pdf.font("Helvetica-Bold").fontSize(18).fillColor("#0f172a");
  pdf.text(doc.rangeText);
  pdf.font("Helvetica").fontSize(9.5).fillColor("#475569");
  pdf.text(
    `${doc.clientLabel} · ${doc.workerLabel} · ${doc.rows.length} shift${
      doc.rows.length === 1 ? "" : "s"
    } · ${doc.totalHours.toFixed(1)} hours`,
  );
  if (mode === "notes" && doc.withNotes < doc.rows.length) {
    pdf.fillColor("#b45309");
    pdf.text(
      `${doc.rows.length - doc.withNotes} of these shifts have no notes recorded.`,
    );
  }
  pdf.moveDown(0.8);

  // ── Shifts ────────────────────────────────────────────────────────────
  if (doc.rows.length === 0) {
    pdf.font("Helvetica").fontSize(11).fillColor("#64748b");
    pdf.text("No completed shifts match these filters.", { align: "center" });
  }

  if (mode === "hours") {
    // One line per shift: what was rostered, what was clocked, what is paid.
    // Widths add up to the text column. Names are clipped with an ellipsis
    // rather than wrapped, so every shift stays on one line and the eye can
    // run down the rostered and clocked columns.
    const cols = [
      { label: "Date", w: 62 },
      { label: "Participant", w: 88 },
      { label: "Worker", w: 100 },
      { label: "Rostered", w: 90 },
      { label: "Clocked", w: 90 },
      { label: "Paid h", w: 34 },
      { label: "KM", w: 31 },
    ];
    /** Trim to what actually fits, so a long name cannot spill onto the row below. */
    const fit = (text: string, width: number) => {
      const t = clean(text);
      if (pdf.widthOfString(t) <= width) return t;
      let out = t;
      while (out.length > 1 && pdf.widthOfString(out + "...") > width) {
        out = out.slice(0, -1);
      }
      return out + "...";
    };

    const header = () => {
      pdf.font("Helvetica-Bold").fontSize(8).fillColor("#64748b");
      // One y for the whole row - taking pdf.y per column walks it down the
      // page and leaves the headings in a staircase.
      const hy = pdf.y;
      let x = MARGIN;
      for (const c of cols) {
        pdf.text(fit(c.label.toUpperCase(), c.w - 4), x, hy, { lineBreak: false });
        x += c.w;
      }
      pdf.y = hy;
      pdf.moveDown(0.9);
      pdf
        .moveTo(MARGIN, pdf.y - 3)
        .lineTo(A4.width - MARGIN, pdf.y - 3)
        .strokeColor("#cbd5e1")
        .lineWidth(0.7)
        .stroke();
    };
    header();

    let paid = 0;
    let km = 0;
    for (const r of doc.rows) {
      if (pdf.y > A4.height - MARGIN - 40) {
        pdf.addPage();
        header();
      }
      paid += r.hours;
      km += r.km;
      const cells = [
        r.shortDate,
        r.clientName,
        r.workerName,
        r.timeLabel,
        r.clockedLabel,
        r.hours.toFixed(2),
        r.km ? r.km.toFixed(1) : "-",
      ];
      pdf.font("Helvetica").fontSize(8.5).fillColor("#0f172a");
      const y = pdf.y;
      let x = MARGIN;
      cells.forEach((cell, i) => {
        pdf.text(fit(cell, cols[i].w - 4), x, y, { lineBreak: false });
        x += cols[i].w;
      });
      pdf.y = y;
      pdf.moveDown(1.05);
    }

    pdf
      .moveTo(MARGIN, pdf.y - 2)
      .lineTo(A4.width - MARGIN, pdf.y - 2)
      .strokeColor("#334155")
      .lineWidth(1)
      .stroke();
    pdf.moveDown(0.3);
    pdf.font("Helvetica-Bold").fontSize(9).fillColor("#0f172a");
    pdf.text(
      `${doc.rows.length} shift${doc.rows.length === 1 ? "" : "s"} · ${paid.toFixed(2)} hours paid · ${km.toFixed(1)} km`,
      MARGIN,
      pdf.y,
      { width: CONTENT },
    );
    pdf.moveDown(0.6);
    pdf.font("Helvetica").fontSize(8).fillColor("#64748b");
    pdf.text(
      "Rostered is the shift as scheduled. Clocked is what the worker recorded on the app. Paid hours are the clocked time inside the rostered window, less breaks.",
      { width: CONTENT },
    );
  }

  for (const r of mode === "hours" ? [] : doc.rows) {
    // Start a new page rather than splitting a shift's heading from its note.
    if (pdf.y > A4.height - MARGIN - 120) pdf.addPage();

    pdf
      .moveTo(MARGIN, pdf.y)
      .lineTo(A4.width - MARGIN, pdf.y)
      .strokeColor("#e2e8f0")
      .lineWidth(0.5)
      .stroke();
    pdf.moveDown(0.5);

    pdf.font("Helvetica-Bold").fontSize(10.5).fillColor("#0f172a");
    pdf.text(`${r.dateLabel}   ${r.timeLabel}`);
    pdf.font("Helvetica").fontSize(9).fillColor("#64748b");
    pdf.text(
      `${r.clientName}${r.ndisNumber ? ` (${r.ndisNumber})` : ""} · ${r.workerName} · ${r.hours.toFixed(2)} h`,
    );

    pdf.moveDown(0.3);
    if (r.note) {
      pdf.font("Helvetica").fontSize(10).fillColor("#1e293b");
      pdf.text(clean(r.note), { width: CONTENT, align: "left" });
    } else {
      pdf.font("Helvetica-Oblique").fontSize(10).fillColor("#94a3b8");
      pdf.text("No notes recorded.");
    }

    if (r.tasks.length > 0) {
      pdf.moveDown(0.25);
      pdf.font("Helvetica").fontSize(9).fillColor("#475569");
      for (const t of r.tasks) {
        pdf.text(`${t.done ? "[x]" : "[ ]"} ${clean(t.title)}`, { indent: 8 });
      }
    }

    if (r.handover) {
      pdf.moveDown(0.25);
      pdf.font("Helvetica-Bold").fontSize(8).fillColor("#64748b");
      pdf.text(
        `HANDOVER TO NEXT WORKER - ${r.handoverAck ? "acknowledged" : "not yet read"}`,
      );
      pdf.font("Helvetica").fontSize(9.5).fillColor("#1e293b");
      pdf.text(clean(r.handover), { width: CONTENT });
    }

    pdf.moveDown(0.6);
  }

  // ── Page numbers, written once every page exists ──────────────────────
  const range = pdf.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    pdf.switchToPage(i);
    // The footer sits below the text margin on purpose. Without dropping the
    // bottom margin first, pdfkit treats it as overflow and starts yet
    // another page - which is how a footer ends up on no page at all.
    pdf.page.margins.bottom = 0;
    pdf.font("Helvetica").fontSize(8).fillColor("#94a3b8");
    pdf.text(
      `${tenant.name} · ${mode === "hours" ? "Hours" : "Shift notes"} · Page ${i - range.start + 1} of ${range.count}`,
      MARGIN,
      A4.height - MARGIN + 4,
      { width: CONTENT, align: "center", lineBreak: false },
    );
  }

  pdf.end();
  const buf = await done;

  return buf;
}
