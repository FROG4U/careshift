/**
 * CSV for the export API.
 *
 * JSON is the real format; CSV exists because loading a file by hand is how
 * an integration gets checked when something looks wrong, and because PCG
 * already has five CSVs from the first handover that people recognise.
 */

/** Every column any row uses, in the order they first appear. */
function columnsOf(rows: Record<string, unknown>[]) {
  const cols: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!cols.includes(key)) cols.push(key);
    }
  }
  return cols;
}

function cell(value: unknown) {
  if (value == null) return "";
  const text = typeof value === "boolean" ? String(value) : String(value);
  // Quote anything a spreadsheet would otherwise split or swallow. Notes carry
  // line breaks and commas as a matter of course.
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: Record<string, unknown>[]) {
  const cols = columnsOf(rows);
  if (cols.length === 0) return "";
  const lines = [cols.join(",")];
  for (const row of rows) {
    lines.push(cols.map((c) => cell(row[c])).join(","));
  }
  return lines.join("\n") + "\n";
}
