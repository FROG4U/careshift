/** A lightweight, dependency-free "map" visual: a soft street backdrop with a
 *  geofence circle and a centred pin — evokes the clock-in zone without a live
 *  map tile provider (a real map can be layered on later). */
export function GeofenceMap({ label }: { label?: string }) {
  return (
    <div className="relative h-48 w-full overflow-hidden rounded-2xl bg-gradient-to-br from-sky-50 via-slate-50 to-emerald-50">
      {/* faux streets */}
      <svg
        className="absolute inset-0 h-full w-full text-slate-200"
        preserveAspectRatio="none"
      >
        <g stroke="currentColor" strokeWidth="6" fill="none">
          <path d="M-20 60 L400 40" />
          <path d="M-20 150 L400 130" />
          <path d="M80 -20 L60 260" />
          <path d="M240 -20 L260 260" />
        </g>
        <g stroke="currentColor" strokeWidth="2" fill="none" opacity="0.6">
          <path d="M-20 105 L400 95" />
          <path d="M160 -20 L150 260" />
        </g>
        {/* a couple of "parks" */}
        <rect x="285" y="55" width="70" height="45" rx="8" fill="#bbf7d0" opacity="0.6" />
        <rect x="10" y="150" width="55" height="60" rx="8" fill="#bbf7d0" opacity="0.5" />
      </svg>

      {/* geofence radius */}
      <div className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--brand)]/10 ring-2 ring-[var(--brand)]/25" />

      {/* centre pin with pulse */}
      <span className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-[var(--brand)]/20" />
      <div className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--brand)] text-white shadow-lg ring-4 ring-white">
        <span className="material-symbols-rounded text-[22px]">person</span>
      </div>

      {label && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm backdrop-blur">
          {label}
        </div>
      )}
    </div>
  );
}
