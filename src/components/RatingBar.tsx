export type Band = "GREEN" | "AMBER" | "RED" | "BUILDING";

const BAND_STYLE: Record<Band, { bar: string; text: string; chip: string; label: string }> = {
  GREEN: {
    bar: "bg-emerald-500",
    text: "text-emerald-700",
    chip: "bg-emerald-50 text-emerald-700",
    label: "On track",
  },
  AMBER: {
    bar: "bg-amber-500",
    text: "text-amber-700",
    chip: "bg-amber-50 text-amber-700",
    label: "Needs attention",
  },
  RED: {
    bar: "bg-red-500",
    text: "text-red-700",
    chip: "bg-red-50 text-red-700",
    label: "Action required",
  },
  // Too few shifts to judge anyone on. Deliberately neutral: branding someone
  // "Action required" off a single shift says more about the sample than the
  // worker.
  BUILDING: {
    bar: "bg-slate-400",
    text: "text-slate-600",
    chip: "bg-slate-100 text-slate-600",
    label: "Building record",
  },
};

// Monochrome variant for the black-and-white worker app — band shown by shade.
const MONO_STYLE: Record<Band, { bar: string; text: string; chip: string; label: string }> = {
  GREEN: {
    bar: "bg-neutral-800",
    text: "text-neutral-800",
    chip: "bg-neutral-100 text-neutral-600",
    label: "On track",
  },
  AMBER: {
    bar: "bg-neutral-500",
    text: "text-neutral-700",
    chip: "bg-neutral-100 text-neutral-600",
    label: "Needs attention",
  },
  RED: {
    bar: "bg-neutral-900",
    text: "text-neutral-900",
    chip: "bg-neutral-200 text-neutral-800",
    label: "Action required",
  },
  BUILDING: {
    bar: "bg-neutral-400",
    text: "text-neutral-600",
    chip: "bg-neutral-100 text-neutral-600",
    label: "Building record",
  },
};

/**
 * Green → amber → red reliability bar. Used on the worker's own profile and on
 * the admin's view of that worker.
 */
export function RatingBar({
  score,
  band,
  size = "md",
  showLabel = true,
  mono = false,
}: {
  score: number;
  band: Band;
  size?: "sm" | "md";
  showLabel?: boolean;
  mono?: boolean;
}) {
  const s = (mono ? MONO_STYLE : BAND_STYLE)[band];
  const h = size === "sm" ? "h-1.5" : "h-2.5";
  return (
    <div className="min-w-28">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span
          className={`font-bold ${s.text} ${size === "sm" ? "text-xs" : "text-sm"}`}
        >
          {score}%
        </span>
        {showLabel && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.chip}`}>
            {s.label}
          </span>
        )}
      </div>
      <div className={`w-full overflow-hidden rounded-full bg-slate-200 ${h}`}>
        <div
          className={`${h} rounded-full ${s.bar} transition-all`}
          style={{ width: `${Math.max(2, score)}%` }}
        />
      </div>
    </div>
  );
}

/** Compact stat used under the bar (e.g. "3 late starts"). */
export function RatingStat({
  value,
  label,
  tone = "muted",
}: {
  value: number | string;
  label: string;
  tone?: "muted" | "bad";
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-center">
      <div
        className={`text-base font-bold ${
          tone === "bad" && Number(value) > 0
            ? "text-red-600"
            : "text-[var(--text-primary)]"
        }`}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </div>
    </div>
  );
}
