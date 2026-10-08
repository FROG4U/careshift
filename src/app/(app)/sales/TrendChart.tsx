"use client";

import { useState } from "react";

/**
 * Income against cost, period by period.
 *
 * The bars used to carry a browser `title`, which means waiting a second for
 * a grey box and nothing at all on a tablet. Hovering - or tapping - a column
 * now shows the figures that column is made of, including the profit, which
 * is the number anyone looking at this chart is actually after.
 */

export type TrendBar = {
  key: string;
  label: string;
  /** The longer label for the tooltip, e.g. "September 2026". */
  fullLabel: string;
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number | null;
  hours: number;
  shifts: number;
};

const aud = (n: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(n);

export function TrendChart({ bars }: { bars: TrendBar[] }) {
  const [active, setActive] = useState<string | null>(null);
  const peak = Math.max(1, ...bars.map((b) => Math.max(b.revenue, b.cost)));
  const shown = bars.find((b) => b.key === active) ?? null;

  return (
    <div className="relative">
      {/* The figures for the column under the pointer. Pinned above the bars
          rather than following the mouse, so it never covers what you are
          pointing at and behaves the same under a finger. */}
      <div className="mb-2 h-[62px]">
        {shown ? (
          <div className="inline-flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-[var(--border)] bg-white px-3 py-2 shadow-sm">
            <span className="text-sm font-bold text-[var(--text-primary)]">
              {shown.fullLabel}
            </span>
            <span className="flex items-center gap-1.5 text-sm">
              <span className="h-2.5 w-2.5 rounded-sm bg-[var(--brand)]" />
              <span className="text-[var(--text-secondary)]">Income</span>
              <span className="font-semibold">{aud(shown.revenue)}</span>
            </span>
            <span className="flex items-center gap-1.5 text-sm">
              <span className="h-2.5 w-2.5 rounded-sm bg-orange-400" />
              <span className="text-[var(--text-secondary)]">Cost</span>
              <span className="font-semibold">{aud(shown.cost)}</span>
            </span>
            <span className="text-sm">
              <span className="text-[var(--text-secondary)]">Profit </span>
              <span
                className={`font-semibold ${
                  shown.profit >= 0 ? "text-emerald-700" : "text-red-600"
                }`}
              >
                {aud(shown.profit)}
              </span>
              {shown.marginPct != null && (
                <span className="text-[var(--text-secondary)]">
                  {" "}
                  ({shown.marginPct.toFixed(0)}%)
                </span>
              )}
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              {shown.hours.toFixed(1)} h · {shown.shifts} shift
              {shown.shifts === 1 ? "" : "s"}
            </span>
          </div>
        ) : (
          <p className="pt-2 text-xs text-[var(--text-muted)]">
            Hover or tap a month to see its figures.
          </p>
        )}
      </div>

      <div
        className="flex items-end gap-2 overflow-x-auto pb-1"
        style={{ height: 200 }}
        onMouseLeave={() => setActive(null)}
      >
        {bars.map((b) => {
          const rH = Math.round((b.revenue / peak) * 150);
          const cH = Math.round((b.cost / peak) * 150);
          const on = active === b.key;
          return (
            <button
              key={b.key}
              type="button"
              onMouseEnter={() => setActive(b.key)}
              onFocus={() => setActive(b.key)}
              onClick={() => setActive(on ? null : b.key)}
              className={`flex min-w-[38px] flex-1 cursor-default flex-col items-center gap-1 rounded-lg px-0.5 pt-1 transition-colors ${
                on ? "bg-[var(--background)]" : ""
              }`}
              aria-label={`${b.fullLabel}: income ${aud(b.revenue)}, cost ${aud(
                b.cost,
              )}, profit ${aud(b.profit)}`}
            >
              <div className="flex h-[150px] w-full items-end justify-center gap-1">
                <div
                  className="w-1/2 rounded-t bg-[var(--brand)] transition-all"
                  style={{ height: `${rH}px`, opacity: active && !on ? 0.45 : 1 }}
                />
                <div
                  className="w-1/2 rounded-t bg-orange-400 transition-all"
                  style={{ height: `${cH}px`, opacity: active && !on ? 0.45 : 1 }}
                />
              </div>
              <div
                className={`text-[11px] font-medium ${
                  on ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"
                }`}
              >
                {b.label}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
