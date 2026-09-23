import "server-only";
import { prisma } from "./prisma";
import type { SessionUser } from "./auth";

/**
 * Worker terms and conditions: versions, rendering and acceptance.
 *
 * The terms are stored as plain text in a small markup (below) rather than as
 * HTML. Two reasons: the office edits them in a textarea without being able to
 * break the page or paste a script in, and the same text renders identically
 * in the admin preview, the worker's pop-up and the printable copy.
 *
 * Clause numbers are worked out at render time, so inserting a clause in the
 * middle renumbers everything after it. That's why the wording never says
 * "see clause 7" - it names the clause instead.
 *
 *   ## Heading            a numbered clause heading
 *   ### Heading           a sub-heading inside a clause
 *   - item                bullet
 *   1. item               numbered step
 *   > text                a note box
 *   >! text               a "never do this" box
 *   >+ text               a "this protects you" box
 *   | a | b |             table row (the first row of a run is the header)
 *   **bold**              bold
 *   blank line            new paragraph
 */

export type TermsBlock = { kind: string; html: string };

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Inline markup. Runs AFTER escaping, so nothing an admin types can inject. */
const inline = (s: string) =>
  esc(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

/** Count the clauses without rendering - used for "23 clauses" summaries. */
export function clauseCount(src: string): number {
  return src.split("\n").filter((l) => /^##\s+\S/.test(l)).length;
}

/** The clause headings in order, for a contents list. */
export function clauseTitles(src: string): string[] {
  return src
    .split("\n")
    .filter((l) => /^##\s+\S/.test(l))
    .map((l) => l.replace(/^##\s+/, "").trim());
}

/**
 * Render the markup to HTML for the app's own styling.
 *
 * Deliberately small: no images, no links, no raw HTML. Terms are text.
 */
export function renderTerms(src: string): string {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let clause = 0;
  let i = 0;

  const flushParagraph = (buf: string[]) => {
    if (buf.length) out.push(`<p>${inline(buf.join(" "))}</p>`);
    buf.length = 0;
  };

  const para: string[] = [];

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    if (!t) {
      flushParagraph(para);
      i += 1;
      continue;
    }

    // Clause heading
    if (/^##\s+/.test(t) && !/^###/.test(t)) {
      flushParagraph(para);
      clause += 1;
      const title = t.replace(/^##\s+/, "");
      out.push(
        `<h2 class="tc-clause" id="clause-${clause}"><span class="tc-n">${clause}</span> ${inline(title)}</h2>`,
      );
      i += 1;
      continue;
    }

    // Sub-heading
    if (/^###\s+/.test(t)) {
      flushParagraph(para);
      out.push(`<h3 class="tc-sub">${inline(t.replace(/^###\s+/, ""))}</h3>`);
      i += 1;
      continue;
    }

    // Callout boxes
    const call = /^>([!+]?)\s+(.*)$/.exec(t);
    if (call) {
      flushParagraph(para);
      const kind = call[1] === "!" ? "stop" : call[1] === "+" ? "good" : "note";
      const body: string[] = [call[2]];
      i += 1;
      while (i < lines.length) {
        const nxt = /^>([!+]?)\s+(.*)$/.exec(lines[i].trim());
        if (!nxt || nxt[1] !== call[1]) break;
        body.push(nxt[2]);
        i += 1;
      }
      const items = body.filter((b) => b.startsWith("- "));
      const inner = items.length
        ? `<ul>${items.map((b) => `<li>${inline(b.slice(2))}</li>`).join("")}</ul>`
        : body.map((b) => `<p>${inline(b)}</p>`).join("");
      out.push(`<div class="tc-call tc-${kind}">${inner}</div>`);
      continue;
    }

    // Table - a run of pipe rows, first one is the header
    if (t.startsWith("|")) {
      flushParagraph(para);
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i]
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => c.trim());
        // A markdown-style separator row (|---|---|) is ignored.
        if (!cells.every((c) => /^-{2,}$/.test(c))) rows.push(cells);
        i += 1;
      }
      if (rows.length) {
        const [head, ...body] = rows;
        out.push(
          `<div class="tc-scroll"><table class="tc-table"><thead><tr>${head
            .map((c) => `<th>${inline(c)}</th>`)
            .join("")}</tr></thead><tbody>${body
            .map(
              (r) =>
                `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`,
            )
            .join("")}</tbody></table></div>`,
        );
      }
      continue;
    }

    // Bullets
    if (/^-\s+/.test(t)) {
      flushParagraph(para);
      const items: string[] = [];
      while (i < lines.length && /^-\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^-\s+/, ""));
        i += 1;
      }
      out.push(
        `<ul class="tc-list">${items.map((it) => `<li>${inline(it)}</li>`).join("")}</ul>`,
      );
      continue;
    }

    // Numbered steps
    if (/^\d+\.\s+/.test(t)) {
      flushParagraph(para);
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i += 1;
      }
      out.push(
        `<ol class="tc-steps">${items.map((it) => `<li>${inline(it)}</li>`).join("")}</ol>`,
      );
      continue;
    }

    para.push(t);
    i += 1;
  }
  flushParagraph(para);
  return out.join("\n");
}

export type PendingTerms = {
  id: string;
  version: number;
  title: string;
  html: string;
  changeNote: string | null;
  publishedAt: string | null;
  /** True when this worker accepted an earlier version already. */
  isUpdate: boolean;
};

/**
 * The published terms this worker still has to agree to, or null.
 *
 * Only ever the CURRENT published version: someone who joins today agrees to
 * today's words, not to every version that came before.
 */
export async function pendingTermsFor(
  session: SessionUser,
): Promise<PendingTerms | null> {
  if (session.role !== "WORKER") return null;

  const current = await prisma.termsVersion.findFirst({
    where: { tenantId: session.tenantId, status: "PUBLISHED" },
    orderBy: { version: "desc" },
  });
  if (!current) return null;

  const [mine, any] = await Promise.all([
    prisma.termsAcceptance.findUnique({
      where: { termsId_userId: { termsId: current.id, userId: session.id } },
      select: { id: true },
    }),
    prisma.termsAcceptance.count({ where: { userId: session.id } }),
  ]);
  if (mine) return null;

  return {
    id: current.id,
    version: current.version,
    title: current.title,
    html: renderTerms(current.content),
    changeNote: current.changeNote,
    publishedAt: current.publishedAt?.toISOString() ?? null,
    isUpdate: any > 0,
  };
}

/** The live version everyone is working to, or null before the first publish. */
export async function currentTerms(tenantId: string) {
  return prisma.termsVersion.findFirst({
    where: { tenantId, status: "PUBLISHED" },
    orderBy: { version: "desc" },
  });
}

/**
 * Who has agreed to a version and who has not.
 *
 * "Outstanding" is every approved worker with an active staff record - the
 * same people a broadcast reaches - so the office can chase the gap.
 */
export async function acceptanceReport(tenantId: string, termsId: string) {
  const [accepted, workers] = await Promise.all([
    prisma.termsAcceptance.findMany({
      where: { termsId },
      orderBy: { acceptedAt: "asc" },
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.user.findMany({
      where: {
        tenantId,
        status: "APPROVED",
        role: "WORKER",
        staff: { active: true },
      },
      select: {
        id: true,
        name: true,
        email: true,
        staff: { select: { branch: { select: { name: true } } } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const done = new Set(accepted.map((a) => a.userId));
  return {
    accepted,
    outstanding: workers.filter((w) => !done.has(w.id)),
    total: workers.length,
  };
}
