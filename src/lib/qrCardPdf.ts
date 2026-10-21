import "server-only";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";

/**
 * The card that goes on the wall at a participant's home: a QR code a support
 * worker scans to clock on and off, with the instructions next to it.
 *
 * A straight PDF download rather than a print-this-page: these get printed by
 * whoever is going out there next, often on whatever printer is to hand, and
 * a file they can keep and reprint beats a browser print dialog.
 *
 * Deliberately plain and large. It is read by someone standing in a hallway,
 * sometimes in poor light, holding a phone.
 */

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const CONTENT = A4.width - MARGIN * 2;

export type QrCardMeta = {
  participantName: string;
  /** Shown so the right card ends up at the right address. */
  address: string | null;
  /** The URL the code carries. */
  url: string;
  /** Last few characters of the code, so the office can identify the card. */
  reference: string;
  issuedLabel: string;
  tenantName: string;
  brand: string;
  businessLines: string[];
};

export async function renderQrCardPdf(meta: QrCardMeta): Promise<Buffer> {
  // Error correction "H": these cards live on walls, get scuffed, get a
  // thumbprint on them. H survives about 30% of the code being unreadable.
  const png = await QRCode.toBuffer(meta.url, {
    errorCorrectionLevel: "H",
    margin: 1,
    width: 900,
    type: "png",
  });

  const pdf = new PDFDocument({
    size: "A4",
    bufferPages: true,
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    info: {
      Title: `Clock-in card - ${meta.participantName}`,
      Author: meta.tenantName,
      Subject: "Support worker clock-in QR card",
    },
  });
  const chunks: Buffer[] = [];
  pdf.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((r) =>
    pdf.on("end", () => r(Buffer.concat(chunks))),
  );

  const brand = meta.brand || "#003146";

  // ── Letterhead ────────────────────────────────────────────────────────
  pdf.rect(0, 0, A4.width, 86).fill(brand);
  pdf
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(20)
    .text(meta.tenantName, MARGIN, 26, { width: CONTENT });
  pdf
    .font("Helvetica")
    .fontSize(11)
    .fillColor("#dbeafe")
    .text("Support worker clock-in", MARGIN, 52, { width: CONTENT });

  // ── Who and where ─────────────────────────────────────────────────────
  pdf
    .fillColor("#0f172a")
    .font("Helvetica-Bold")
    .fontSize(30)
    .text(meta.participantName, MARGIN, 118, { width: CONTENT, align: "center" });
  if (meta.address) {
    pdf
      .font("Helvetica")
      .fontSize(12)
      .fillColor("#475569")
      .text(meta.address, MARGIN, 156, { width: CONTENT, align: "center" });
  }

  // ── The code ──────────────────────────────────────────────────────────
  // Big on purpose: it is read by a phone held at arm's length in a hallway.
  const size = 292;
  const x = (A4.width - size) / 2;
  const y = 196;
  pdf
    .roundedRect(x - 16, y - 16, size + 32, size + 32, 14)
    .lineWidth(1.5)
    .strokeColor("#cbd5e1")
    .stroke();
  pdf.image(png, x, y, { width: size, height: size });

  // ── What to do with it ────────────────────────────────────────────────
  let ty = y + size + 44;
  pdf
    .fillColor(brand)
    .font("Helvetica-Bold")
    .fontSize(15)
    .text("Scan this to start and finish your shift", MARGIN, ty, {
      width: CONTENT,
      align: "center",
    });
  ty += 30;

  const steps = [
    "Open PCG Shift Care on your phone and tap Scan card.",
    "Hold your phone up to this code until it beeps.",
    "Scan it again on your way out to finish the shift.",
  ];
  pdf.font("Helvetica").fontSize(12).fillColor("#0f172a");
  for (const [i, step] of steps.entries()) {
    pdf.circle(MARGIN + 36, ty + 6, 9).fill(brand);
    pdf
      .fillColor("#ffffff")
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(String(i + 1), MARGIN + 33, ty + 2, { width: 12, align: "center" });
    pdf
      .fillColor("#0f172a")
      .font("Helvetica")
      .fontSize(12)
      .text(step, MARGIN + 56, ty, { width: CONTENT - 70 });
    ty += 26;
  }

  // The reason the card exists, said plainly.
  ty += 8;
  pdf.roundedRect(MARGIN, ty, CONTENT, 54, 10).fill("#f1f5f9");
  pdf
    .fillColor(brand)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text("No signal here? It still works.", MARGIN + 16, ty + 12, {
      width: CONTENT - 32,
    });
  pdf
    .fillColor("#334155")
    .font("Helvetica")
    .fontSize(10.5)
    .text(
      "The scan is saved on your phone with the time and sends itself as soon as you are back in range. Do not wait for bars - just scan and carry on.",
      MARGIN + 16,
      ty + 28,
      { width: CONTENT - 32 },
    );
  ty += 70;

  // ── Footer ────────────────────────────────────────────────────────────
  pdf
    .moveTo(MARGIN, A4.height - MARGIN - 52)
    .lineTo(A4.width - MARGIN, A4.height - MARGIN - 52)
    .lineWidth(0.8)
    .strokeColor("#e2e8f0")
    .stroke();
  pdf
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor("#64748b")
    .text(meta.businessLines.join("  |  "), MARGIN, A4.height - MARGIN - 42, {
      width: CONTENT,
      align: "center",
    });
  pdf.text(
    `Card ${meta.reference} - issued ${meta.issuedLabel}. If this card is damaged or missing, tell the office and a new one will be sent.`,
    MARGIN,
    A4.height - MARGIN - 28,
    { width: CONTENT, align: "center" },
  );

  pdf.end();
  return done;
}
