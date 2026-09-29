import "server-only";
import PDFDocument from "pdfkit";
import type { CommsReport } from "./commsReport";

/**
 * The communication record as a real PDF.
 *
 * Same approach as the shift notes: written here rather than through the
 * browser's print dialog, so the file is the same for everyone and the text
 * stays selectable. The summary and the key points sit at the front, because
 * whoever asked for this wants the short version first and the full
 * transcript underneath as the evidence for it.
 */

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const CONTENT = A4.width - MARGIN * 2;

/** Notes are pasted from phones and Word; the built-in fonts only do WinAnsi. */
function clean(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—‒−]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/[•●▪]/g, "-")
    .replace(/[^\u0000-ÿ\n]/g, "")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
    .trim();
}

const mmss = (s: number | null) =>
  s == null ? "-" : `${Math.floor(s / 60)}m ${s % 60}s`;

export async function renderCommsPdf(
  report: CommsReport,
  meta: { tenantName: string; brand: string; generatedBy: string },
): Promise<Buffer> {
  const pdf = new PDFDocument({
    size: "A4",
    bufferPages: true,
    margins: { top: MARGIN, bottom: MARGIN + 18, left: MARGIN, right: MARGIN },
    info: {
      Title: `Communication record - ${report.rangeLabel}`,
      Author: meta.tenantName,
      Subject: "Communication record",
    },
  });
  const chunks: Buffer[] = [];
  pdf.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((r) => pdf.on("end", () => r(Buffer.concat(chunks))));

  const generated = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());

  // Letterhead
  pdf.rect(MARGIN, MARGIN, CONTENT, 3).fill(meta.brand);
  pdf.fillColor("#0f172a").font("Helvetica-Bold").fontSize(16);
  pdf.text(meta.tenantName, MARGIN, MARGIN + 14);
  pdf.font("Helvetica").fontSize(9).fillColor("#64748b");
  pdf.text("Communication Record");
  pdf.text(`Generated ${generated} by ${meta.generatedBy}`);
  pdf.text("Contains participant care information - handle confidentially");

  pdf.moveDown(1);
  pdf.font("Helvetica-Bold").fontSize(18).fillColor("#0f172a");
  pdf.text(report.rangeLabel);

  // ── Summary, boxed so it reads as the front page of the document ──────
  pdf.moveDown(0.6);
  const boxTop = pdf.y;
  pdf.font("Helvetica").fontSize(10).fillColor("#1e293b");
  const summaryLines = [
    `${report.messages.length} message${report.messages.length === 1 ? "" : "s"} across ${report.threads.length} conversation${report.threads.length === 1 ? "" : "s"}, and ${report.calls.length} call${report.calls.length === 1 ? "" : "s"}.`,
    report.perPerson.length
      ? `Who wrote them: ${report.perPerson.map((p) => `${p.name} (${p.count})`).join(", ")}.`
      : "No messages in this period.",
    report.threads.length ? `Conversations: ${report.threads.join("; ")}.` : "",
    report.keyPoints.length
      ? `${report.keyPoints.length} message${report.keyPoints.length === 1 ? " is" : "s are"} flagged below as key points.`
      : "No messages matched the key point words.",
  ].filter(Boolean);

  pdf.rect(MARGIN, boxTop, CONTENT, summaryLines.length * 14 + 34).fill("#f1f5f9");
  pdf.fillColor("#0f172a").font("Helvetica-Bold").fontSize(10);
  pdf.text("Summary", MARGIN + 12, boxTop + 10);
  pdf.font("Helvetica").fontSize(9.5).fillColor("#1e293b");
  for (const line of summaryLines) {
    pdf.text(clean(line), MARGIN + 12, pdf.y + 2, { width: CONTENT - 24 });
  }
  pdf.y = boxTop + summaryLines.length * 14 + 44;
  pdf.x = MARGIN;

  // ── Key points ────────────────────────────────────────────────────────
  if (report.keyPoints.length > 0) {
    pdf.font("Helvetica-Bold").fontSize(13).fillColor("#0f172a");
    pdf.text("Key points");
    pdf.font("Helvetica").fontSize(8.5).fillColor("#64748b");
    pdf.text(
      "Messages mentioning an incident, medication, a complaint, an absence, lateness, a roster change or pay. Everything else is in the full record below.",
      { width: CONTENT },
    );
    pdf.moveDown(0.4);

    for (const m of report.keyPoints) {
      if (pdf.y > A4.height - MARGIN - 90) pdf.addPage();
      const top = pdf.y;
      pdf.rect(MARGIN, top, 3, 12).fill("#b45309");
      pdf.font("Helvetica-Bold").fontSize(9).fillColor("#b45309");
      pdf.text(m.flags.join(" · "), MARGIN + 10, top, { width: CONTENT - 10 });
      pdf.font("Helvetica").fontSize(9).fillColor("#475569");
      pdf.text(
        `${m.dateLabel} ${m.timeLabel} - ${clean(m.senderName)} (${clean(m.conversationTitle)})`,
        MARGIN + 10,
        pdf.y,
        { width: CONTENT - 10 },
      );
      pdf.fontSize(10).fillColor("#0f172a");
      pdf.text(clean(m.body), MARGIN + 10, pdf.y + 1, { width: CONTENT - 10 });
      pdf.moveDown(0.6);
      pdf.x = MARGIN;
    }
    pdf.moveDown(0.4);
  }

  // ── Calls ─────────────────────────────────────────────────────────────
  if (report.calls.length > 0) {
    if (pdf.y > A4.height - MARGIN - 120) pdf.addPage();
    pdf.font("Helvetica-Bold").fontSize(13).fillColor("#0f172a");
    pdf.text("Calls", MARGIN, pdf.y);
    pdf.font("Helvetica").fontSize(8.5).fillColor("#64748b");
    pdf.text("Who rang whom and for how long. No audio is recorded.", { width: CONTENT });
    pdf.moveDown(0.3);
    pdf.fontSize(9.5).fillColor("#1e293b");
    for (const c of report.calls) {
      if (pdf.y > A4.height - MARGIN - 40) pdf.addPage();
      pdf.text(
        `${c.dateLabel} ${c.timeLabel} - ${clean(c.fromName)} called ${clean(c.toName)} - ${c.status.toLowerCase()}${
          c.durationSec != null ? `, ${mmss(c.durationSec)}` : ""
        }`,
        MARGIN,
        pdf.y,
        { width: CONTENT },
      );
    }
    pdf.moveDown(0.6);
  }

  // ── Full record ───────────────────────────────────────────────────────
  if (pdf.y > A4.height - MARGIN - 120) pdf.addPage();
  pdf.font("Helvetica-Bold").fontSize(13).fillColor("#0f172a");
  pdf.text("Full record", MARGIN, pdf.y);
  pdf.moveDown(0.3);

  if (report.messages.length === 0) {
    pdf.font("Helvetica").fontSize(10).fillColor("#64748b");
    pdf.text("No messages match these filters.", { align: "center" });
  }

  let lastThread = "";
  let lastDay = "";
  for (const m of report.messages) {
    if (pdf.y > A4.height - MARGIN - 70) pdf.addPage();

    if (m.conversationTitle !== lastThread) {
      pdf.moveDown(0.4);
      pdf.font("Helvetica-Bold").fontSize(10.5).fillColor("#0f172a");
      pdf.text(clean(m.conversationTitle), MARGIN, pdf.y, { width: CONTENT });
      lastThread = m.conversationTitle;
      lastDay = "";
    }
    if (m.dateLabel !== lastDay) {
      pdf.font("Helvetica-Bold").fontSize(8.5).fillColor("#64748b");
      pdf.text(m.dateLabel.toUpperCase(), MARGIN, pdf.y + 2, { width: CONTENT });
      lastDay = m.dateLabel;
    }

    pdf.font("Helvetica-Bold").fontSize(9).fillColor("#334155");
    pdf.text(`${m.timeLabel}  ${clean(m.senderName)}`, MARGIN, pdf.y + 1, {
      width: CONTENT,
      continued: false,
    });
    pdf.font("Helvetica").fontSize(9.5).fillColor(m.deleted ? "#94a3b8" : "#0f172a");
    pdf.text(clean(m.body) || (m.attachment ? "(photo)" : ""), MARGIN + 10, pdf.y, {
      width: CONTENT - 10,
    });
    if (m.attachment && m.body) {
      pdf.fontSize(8.5).fillColor("#64748b").text("(photo attached)", MARGIN + 10, pdf.y);
    }
    pdf.x = MARGIN;
  }

  // Page numbers
  const range = pdf.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    pdf.switchToPage(i);
    pdf.page.margins.bottom = 0;
    pdf.font("Helvetica").fontSize(8).fillColor("#94a3b8");
    pdf.text(
      `${meta.tenantName} · Communication record · Page ${i - range.start + 1} of ${range.count}`,
      MARGIN,
      A4.height - MARGIN + 4,
      { width: CONTENT, align: "center", lineBreak: false },
    );
  }

  pdf.end();
  return done;
}
