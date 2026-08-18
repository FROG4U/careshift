"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { AU_STATES } from "@/lib/constants";
import { calendarDateFromKey } from "@/lib/timezone";
import { isManager } from "@/lib/roles";

const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();

async function requireManager() {
  const ctx = await requireTenant();
  if (!isManager(ctx.session.role)) {
    throw new Error("Not authorised");
  }
  return ctx;
}

/**
 * A holiday is a CALENDAR DATE, not an instant, so it is stored at UTC
 * midnight. Storing it at *server* local midnight would make the stored value
 * depend on where the server runs, and reading it back from a branch in a
 * different Australian timezone could slide it onto the wrong day.
 */
function toCalendarDate(iso: string) {
  return calendarDateFromKey(iso);
}

export async function createHoliday(formData: FormData) {
  const { tenant } = await requireManager();
  const date = str(formData.get("date"));
  const name = str(formData.get("name"));
  const state = str(formData.get("state")) || null;
  if (!date || !name) return;

  await prisma.publicHoliday.create({
    data: { tenantId: tenant.id, date: toCalendarDate(date), name, state },
  });
  revalidatePath("/settings/holidays");
}

export async function updateHoliday(formData: FormData) {
  const { tenant } = await requireManager();
  const id = str(formData.get("id"));
  const date = str(formData.get("date"));
  const name = str(formData.get("name"));
  const state = str(formData.get("state")) || null;
  if (!id || !date || !name) return;

  await prisma.publicHoliday.updateMany({
    where: { id, tenantId: tenant.id },
    data: { date: toCalendarDate(date), name, state },
  });
  revalidatePath("/settings/holidays");
}

export async function deleteHoliday(formData: FormData) {
  const { tenant } = await requireManager();
  const id = str(formData.get("id"));
  await prisma.publicHoliday.deleteMany({ where: { id, tenantId: tenant.id } });
  revalidatePath("/settings/holidays");
}

// ── URL import ────────────────────────────────────────────────────────────

export type ImportResult = {
  ok: boolean;
  message: string;
  added?: number;
  skipped?: number;
  sample?: string[];
};

/** Normalise a date cell: accepts 2026-01-01, 20260101, 01/01/2026. */
function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy)
    return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime()))
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return null;
}

/** Map a jurisdiction cell to our state codes. Bar/comma separated = many. */
function parseStates(raw: string): (string | null)[] {
  const s = raw.trim().toUpperCase();
  if (!s || s === "NATIONAL" || s === "ALL") return [null];
  const parts = s.split(/[|,;/]+/).map((p) => p.trim()).filter(Boolean);
  const found = parts.filter((p) =>
    (AU_STATES as readonly string[]).includes(p),
  );
  // Listed in every state = effectively national.
  if (found.length >= AU_STATES.length) return [null];
  return found.length ? found : [null];
}

/** Split a CSV line, honouring quoted fields. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if (c === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((v) => v.trim().replace(/^"|"$/g, ""));
}

type Parsed = { date: string; name: string; state: string | null };

function parseCsv(text: string): Parsed[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idxOf = (re: RegExp) => header.findIndex((h) => re.test(h));
  const di = idxOf(/date/);
  const ni = idxOf(/holiday.*name|^name$|holiday/);
  const ji = idxOf(/jurisdiction|state|territory/);
  if (di === -1 || ni === -1) return [];

  const rows: Parsed[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const date = parseDate(cells[di] ?? "");
    const name = (cells[ni] ?? "").trim();
    if (!date || !name) continue;
    for (const st of parseStates(ji === -1 ? "" : (cells[ji] ?? ""))) {
      rows.push({ date, name, state: st });
    }
  }
  return rows;
}

function parseJson(text: string): Parsed[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  // Accept a bare array, or a wrapper like { result: { records: [...] } }.
  const arr: unknown[] = Array.isArray(data)
    ? data
    : (((data as Record<string, unknown>)?.records ??
        ((data as Record<string, unknown>)?.result as Record<string, unknown>)
          ?.records ??
        (data as Record<string, unknown>)?.data ??
        (data as Record<string, unknown>)?.holidays) as unknown[]) ?? [];
  if (!Array.isArray(arr)) return [];

  const rows: Parsed[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const key = (re: RegExp) =>
      Object.keys(o).find((k) => re.test(k.toLowerCase()));
    const dk = key(/date/);
    const nk = key(/holiday.*name|^name$|title|holiday/);
    const jk = key(/jurisdiction|state|territory|counties|region/);
    if (!dk || !nk) continue;
    const date = parseDate(String(o[dk] ?? ""));
    const name = String(o[nk] ?? "").trim();
    if (!date || !name) continue;
    for (const st of parseStates(jk ? String(o[jk] ?? "") : "")) {
      rows.push({ date, name, state: st });
    }
  }
  return rows;
}

/**
 * Fetch a machine-readable holiday feed (CSV or JSON) and add any dates we
 * don't already have. Idempotent — re-running never duplicates.
 */
export async function importHolidaysFromUrl(
  _prev: ImportResult | undefined,
  formData: FormData,
): Promise<ImportResult> {
  const { tenant } = await requireManager();
  const url = str(formData.get("url"));
  const yearFilter = str(formData.get("year"));
  if (!/^https?:\/\//i.test(url))
    return { ok: false, message: "Enter a full URL starting with http(s)://" };

  let text: string;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "CareShift/1.0 (+holiday-import)" },
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    if (!res.ok)
      return {
        ok: false,
        message: `The source returned HTTP ${res.status}. Many government pages block automated requests — try a direct CSV/JSON link.`,
      };
    text = await res.text();
  } catch {
    return {
      ok: false,
      message:
        "Couldn't reach that URL (blocked or timed out). It needs to be a direct CSV or JSON file, not a web page.",
    };
  }

  const trimmed = text.trimStart();
  let rows = trimmed.startsWith("{") || trimmed.startsWith("[")
    ? parseJson(text)
    : parseCsv(text);
  if (rows.length === 0) rows = parseCsv(text); // JSON parse failed → try CSV

  if (rows.length === 0)
    return {
      ok: false,
      message:
        "No holidays found. The file needs a date column and a holiday-name column (CSV or JSON). If this is an HTML page, it won't work.",
    };

  if (yearFilter) rows = rows.filter((r) => r.date.startsWith(yearFilter));

  // Skip anything already stored for the same date + state.
  const existing = await prisma.publicHoliday.findMany({
    where: { tenantId: tenant.id },
    select: { date: true, state: true },
  });
  const have = new Set(
    existing.map(
      (e) =>
        `${e.date.getFullYear()}-${String(e.date.getMonth() + 1).padStart(2, "0")}-${String(e.date.getDate()).padStart(2, "0")}|${e.state ?? ""}`,
    ),
  );

  const toAdd = rows.filter((r) => !have.has(`${r.date}|${r.state ?? ""}`));
  // De-dupe within the file itself.
  const seen = new Set<string>();
  const unique = toAdd.filter((r) => {
    const k = `${r.date}|${r.state ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  if (unique.length) {
    await prisma.publicHoliday.createMany({
      data: unique.map((r) => ({
        tenantId: tenant.id,
        date: toCalendarDate(r.date),
        name: r.name,
        state: r.state,
      })),
    });
  }

  revalidatePath("/settings/holidays");
  return {
    ok: true,
    message: `Imported ${unique.length} holiday${unique.length === 1 ? "" : "s"}.`,
    added: unique.length,
    skipped: rows.length - unique.length,
    sample: unique
      .slice(0, 6)
      .map((r) => `${r.date} · ${r.name}${r.state ? ` (${r.state})` : " (National)"}`),
  };
}
