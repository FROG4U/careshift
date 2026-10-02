import "server-only";
import PDFDocument from "pdfkit";
import type { AttendanceRow } from "./attendanceReport";
import type { AttendanceSettings } from "./reliability";

/**
 * The attendance record as a PDF, in the same visual language as the hours
 * and notes reports: brand band, boxed figures, a dark table header.
 *
 * Carries the thresholds it judged by and the shifts behind each score,
 * because this is the document someone is shown in a conversation about
 * their punctuality.
 */

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const CONTENT = A4.width - MARGIN * 2;

const BAND_COLOUR: Record<string, string> = {
  GREEN: "#15803d",
  AMBER: "#b45309",
  RED: "#b91c1c",
};

/** Keep text inside its column; pdfkit's own ellipsis wraps instead. */
function fitter(pdf: PDFKit.PDFDocument) {
  return (text: string, width: number) => {
    const t = String(text ?? "")
      .replace(/[–—]/g, "-")
      .replace(/[^\u0000-ÿ]/g, "");
    if (pdf.widthOfString(t) <= width) return t;
    let out = t;
    while (out.length > 1 && pdf.widthOfString(out + "...") > width) {
      out = out.slice(0, -1);
    }
    return out + "...";
  };
}

export async function renderAttendancePdf(
  rows: AttendanceRow[],
  cfg: AttendanceSettings,
  meta: { tenantName: string; brand: string; generatedBy: string },
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
    bufferPages: true,
    margins: { top: MARGIN, bottom: MARGIN + 18, left: MARGIN, right: MARGIN },
    info: { Title: "Attendance record", Author: tenant.name, Subject: "Attendance" },
  });
  const chunks: Buffer[] = [];
  pdf.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((r) => pdf.on("end", () => r(Buffer.concat(chunks))));
  const fit = fitter(pdf);

  // ── Letterhead ────────────────────────────────────────────────────────
  pdf.rect(0, 0, A4.width, 74).fill(brand);
  pdf.roundedRect(MARGIN, 20, 34, 34, 8).fill("#ffffff");
  pdf.fillColor(brand).font("Helvetica-Bold").fontSize(18);
  pdf.text(tenant.name.charAt(0).toUpperCase(), MARGIN, 30, { width: 34, align: "center" });
  pdf.fillColor("#ffffff").font("Helvetica-Bold").fontSize(15);
  pdf.text(tenant.name, MARGIN + 46, 22, { width: CONTENT - 46, lineBreak: false });
  pdf.font("Helvetica").fontSize(9).opacity(0.75);
  pdf.text("Attendance record", MARGIN + 46, 40, { width: CONTENT - 46, lineBreak: false });
  pdf.text(`Generated ${generated} by ${session.name}`, MARGIN + 46, 52, {
    width: CONTENT - 46,
    lineBreak: false,
  });
  pdf.opacity(1);

  pdf.y = 96;
  pdf.x = MARGIN;
  pdf.font("Helvetica-Bold").fontSize(20).fillColor("#0f172a");
  pdf.text(
    rows.length === 1 ? rows[0].name : "Worker reliability",
    MARGIN,
    pdf.y,
  );
  pdf.font("Helvetica").fontSize(9).fillColor("#64748b");
  pdf.text(
    `A shift counts as clean when the worker starts within ${cfg.lateGraceMin} min of the rostered start and does not leave more than ${cfg.earlyFinishGraceMin} min early. Staying past the end is never a penalty. Recent shifts count for more than old ones. ${cfg.ratingGreenAt} and above is green, ${cfg.ratingAmberAt} to ${cfg.ratingGreenAt - 1} is amber.`,
    MARGIN,
    pdf.y + 2,
    { width: CONTENT },
  );

  // ── Summary figures ───────────────────────────────────────────────────
  const counts = {
    green: rows.filter((r) => r.band === "GREEN").length,
    amber: rows.filter((r) => r.band === "AMBER").length,
    red: rows.filter((r) => r.band === "RED").length,
  };
  // "Workers 1, Green 0, Amber 0, Red 1" tells one person nothing. Their own
  // report leads with their own figures.
  const one = rows.length === 1 ? rows[0] : null;
  const stats: [string, string][] = one
    ? [
        ["Score", String(one.score)],
        ["Shifts judged", String(one.total)],
        ["Clean", `${one.clean} of ${one.total}`],
        ["Avg late", one.avgLateLabel],
      ]
    : [
        ["Workers", String(rows.length)],
        ["Green", String(counts.green)],
        ["Amber", String(counts.amber)],
        ["Red", String(counts.red)],
      ];
  const sw = (CONTENT - 24) / 4;
  const stop = pdf.y + 14;
  stats.forEach(([label, value], i) => {
    const x = MARGIN + i * (sw + 8);
    pdf.roundedRect(x, stop, sw, 44, 8).fill("#f1f5f9");
    pdf.fillColor("#64748b").font("Helvetica").fontSize(8);
    pdf.text(label.toUpperCase(), x + 10, stop + 9, { width: sw - 20, lineBreak: false });
    pdf.fillColor("#0f172a").font("Helvetica-Bold").fontSize(15);
    pdf.text(value, x + 10, stop + 21, { width: sw - 20, lineBreak: false });
  });
  pdf.y = stop + 58;
  pdf.x = MARGIN;

  // ── One row per worker ────────────────────────────────────────────────
  // Widths add up to the text column exactly - over it and the last heading
  // walks off the edge of the band.
  const cols = [
    { label: "Worker", w: 133, right: false },
    { label: "Branch", w: 58, right: false },
    { label: "Score", w: 36, right: true },
    { label: "Shifts", w: 38, right: true },
    { label: "Clean", w: 34, right: true },
    { label: "Late", w: 30, right: true },
    { label: "Early", w: 38, right: true },
    { label: "Stayed", w: 40, right: true },
    { label: "Notices", w: 44, right: true },
    { label: "Avg late", w: 48, right: true },
  ];
  const ROW = 15;
  const header = () => {
    const hy = pdf.y;
    pdf.rect(MARGIN, hy - 4, CONTENT, 18).fill(brand);
    pdf.font("Helvetica-Bold").fontSize(7.5).fillColor("#ffffff");
    let x = MARGIN;
    for (const c of cols) {
      pdf.text(fit(c.label.toUpperCase(), c.w - 8), x + 4, hy + 1, {
        width: c.w - 8,
        align: c.right ? "right" : "left",
        lineBreak: false,
      });
      x += c.w;
    }
    pdf.y = hy + 18;
    pdf.x = MARGIN;
  };
  header();

  rows.forEach((r, i) => {
    if (pdf.y > A4.height - MARGIN - 40) {
      pdf.addPage();
      pdf.y = MARGIN;
      header();
    }
    const y = pdf.y;
    if (i % 2 === 1) pdf.rect(MARGIN, y - 3, CONTENT, ROW).fill("#f8fafc");

    const cells = [
      r.name,
      r.branch,
      String(r.score),
      String(r.total),
      String(r.clean),
      String(r.lateStarts),
      String(r.earlyFinishes),
      String(r.stayedLate),
      String(r.lateNotices),
      r.avgLateLabel,
    ];
    let x = MARGIN;
    cells.forEach((cell, c) => {
      // The score carries the colour, so a red worker is findable at a glance.
      pdf
        .font(c === 2 ? "Helvetica-Bold" : "Helvetica")
        .fontSize(8.5)
        .fillColor(c === 2 ? BAND_COLOUR[r.band] : "#0f172a");
      pdf.text(fit(cell, cols[c].w - 8), x + 4, y, {
        width: cols[c].w - 8,
        align: cols[c].right ? "right" : "left",
        lineBreak: false,
      });
      x += cols[c].w;
    });
    pdf.y = y + ROW;
    pdf.x = MARGIN;
  });

  // ── The shifts behind each score ──────────────────────────────────────
  // Twelve each is enough to show a pattern across a team. For one person
  // the whole history is the point, so show all of it.
  const perWorker = rows.length === 1 ? 60 : 12;
  const flagged = (r: AttendanceRow) =>
    r.lines.filter((l) => l.lateStart || l.earlyFinish).slice(0, perWorker);

  const withIssues = rows.filter((r) => flagged(r).length > 0);
  if (withIssues.length > 0) {
    pdf.y += 14;
    pdf.font("Helvetica-Bold").fontSize(12).fillColor("#0f172a");
    pdf.text("The shifts behind the scores", MARGIN, pdf.y);
    pdf.font("Helvetica").fontSize(8).fillColor("#64748b");
    pdf.text(
      one
        ? "Every shift that counted against the score: started late, or left early, most recent first."
        : "Only shifts that counted against a score: started late, or left early. Up to twelve per worker, most recent first.",
      MARGIN,
      pdf.y + 2,
      { width: CONTENT },
    );
    pdf.moveDown(0.6);

    for (const r of withIssues) {
      if (pdf.y > A4.height - MARGIN - 70) {
        pdf.addPage();
        pdf.y = MARGIN;
      }
      const hy = pdf.y + 8;
      pdf.font("Helvetica-Bold").fontSize(9.5).fillColor("#0f172a");
      pdf.text(`${r.name}  (${r.score})`, MARGIN, hy, {
        width: CONTENT,
        lineBreak: false,
      });
      pdf.y = hy + 12;
      pdf.x = MARGIN;
      pdf.font("Helvetica").fontSize(8.5).fillColor("#334155");
      for (const l of flagged(r)) {
        if (pdf.y > A4.height - MARGIN - 30) {
          pdf.addPage();
          pdf.y = MARGIN;
        }
        const why = [
          l.lateStart ? `started ${l.startDelta}` : null,
          l.earlyFinish ? `finished ${l.endDelta}` : null,
        ]
          .filter(Boolean)
          .join(", ");
        const ly = pdf.y + 2;
        pdf.text(
          fit(
            `${l.dateLabel} · ${l.clientName} · rostered ${l.rostered} · clocked ${l.actual} · ${why}`,
            CONTENT - 10,
          ),
          MARGIN + 10,
          ly,
          { lineBreak: false },
        );
        pdf.y = ly + 11;
        pdf.x = MARGIN;
      }
    }
  }

  const range = pdf.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    pdf.switchToPage(i);
    pdf.page.margins.bottom = 0;
    pdf.font("Helvetica").fontSize(8).fillColor("#94a3b8");
    pdf.text(
      `${tenant.name} · Attendance · Page ${i - range.start + 1} of ${range.count}`,
      MARGIN,
      A4.height - MARGIN + 4,
      { width: CONTENT, align: "center", lineBreak: false },
    );
  }

  pdf.end();
  return done;
}
