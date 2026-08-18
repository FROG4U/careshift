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

/**
 * A custom from/to range typed by the user. Returns null unless both dates
 * are valid and the right way round.
 */
export function parseRange(
  fromRaw?: string,
  toRaw?: string,
): { from: Date; to: Date } | null {
  if (!fromRaw || !toRaw) return null;
  const from = new Date(`${fromRaw}T00:00:00`);
  const to = new Date(`${toRaw}T23:59:59.999`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  if (to < from) return null;
  return { from, to };
}

export function rangeLabel(from: Date, to: Date) {
  const d = (x: Date) =>
    new Intl.DateTimeFormat("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(x);
  return `${d(from)} – ${d(to)}`;
}

/**
 * Chart buckets for an arbitrary range, picking a sensible granularity:
 * daily up to a fortnight, weekly up to ~4 months, monthly beyond that.
 */
export function autoBuckets(from: Date, to: Date) {
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000));
  const out: { key: string; label: string; from: Date; to: Date }[] = [];

  const fmt = (d: Date, o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-AU", o).format(d);

  if (days <= 14) {
    for (let i = 0; i <= days; i++) {
      const start = new Date(from);
      start.setDate(start.getDate() + i);
      start.setHours(0, 0, 0, 0);
      if (start > to) break;
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      out.push({
        key: start.toISOString().slice(0, 10),
        label: fmt(start, { day: "numeric" }),
        from: start,
        to: end,
      });
    }
    return out;
  }

  if (days <= 120) {
    const cursor = new Date(from);
    cursor.setHours(0, 0, 0, 0);
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

  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  while (cursor <= to) {
    const start = new Date(cursor);
    const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
    out.push({
      key: `${start.getFullYear()}-${start.getMonth()}`,
      label: fmt(start, { month: "short" }),
      from: start,
      to: end > to ? to : end,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
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
