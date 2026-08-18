/** Reporting periods for the Sales screens. */

export type PeriodKind = "week" | "month" | "year";

export const PERIOD_LABELS: Record<PeriodKind, string> = {
  week: "This week",
  month: "This month",
  year: "This year",
};

export function parsePeriod(raw?: string): PeriodKind {
  return raw === "week" || raw === "year" ? raw : "month";
}

/**
 * The date range for a period, `offset` periods back from today.
 * Weeks run Monday–Sunday, matching the roster.
 */
export function rangeFor(kind: PeriodKind, offset = 0) {
  const now = new Date();
  let from: Date;
  let to: Date;

  if (kind === "week") {
    from = new Date(now);
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - ((from.getDay() + 6) % 7) - offset * 7);
    to = new Date(from);
    to.setDate(to.getDate() + 6);
  } else if (kind === "year") {
    from = new Date(now.getFullYear() - offset, 0, 1);
    to = new Date(now.getFullYear() - offset, 11, 31);
  } else {
    from = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    to = new Date(now.getFullYear(), now.getMonth() - offset + 1, 0);
  }

  to.setHours(23, 59, 59, 999);
  return { from, to };
}

export function periodLabel(kind: PeriodKind, from: Date, to: Date) {
  const d = (x: Date, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-AU", opts).format(x);

  if (kind === "year") return d(from, { year: "numeric" });
  if (kind === "month")
    return d(from, { month: "long", year: "numeric" });
  return `${d(from, { day: "numeric", month: "short" })} – ${d(to, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}

/** Buckets to chart the period by: days for a week, else months/weeks. */
export function bucketsFor(kind: PeriodKind, from: Date, to: Date) {
  const out: { key: string; label: string; from: Date; to: Date }[] = [];

  if (kind === "week") {
    for (let i = 0; i < 7; i++) {
      const start = new Date(from);
      start.setDate(start.getDate() + i);
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      out.push({
        key: start.toISOString().slice(0, 10),
        label: new Intl.DateTimeFormat("en-AU", { weekday: "short" }).format(start),
        from: start,
        to: end,
      });
    }
    return out;
  }

  if (kind === "month") {
    // Week-by-week within the month.
    const cursor = new Date(from);
    let n = 1;
    while (cursor <= to) {
      const start = new Date(cursor);
      const end = new Date(cursor);
      end.setDate(end.getDate() + 6);
      if (end > to) end.setTime(to.getTime());
      end.setHours(23, 59, 59, 999);
      out.push({ key: `w${n}`, label: `Wk ${n}`, from: start, to: end });
      cursor.setDate(cursor.getDate() + 7);
      n++;
    }
    return out;
  }

  for (let m = 0; m < 12; m++) {
    const start = new Date(from.getFullYear(), m, 1);
    const end = new Date(from.getFullYear(), m + 1, 0, 23, 59, 59, 999);
    out.push({
      key: `m${m}`,
      label: new Intl.DateTimeFormat("en-AU", { month: "narrow" }).format(start),
      from: start,
      to: end,
    });
  }
  return out;
}
