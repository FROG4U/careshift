"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({
  href,
  label,
  icon,
  badge,
}: {
  href: string;
  label: string;
  icon: string;
  /** Optional count shown as a pill on the right (hidden when 0/undefined). */
  badge?: number;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
        active
          ? "bg-[var(--brand)] text-white shadow-sm"
          : "text-[var(--text-secondary)] hover:bg-[var(--background)] hover:text-[var(--text-primary)]"
      }`}
    >
      {/* Keyline (outline) icon — stays outline on the active item too, just a
          touch heavier for legibility on the coloured background. */}
      <span
        className="material-symbols-rounded text-[21px] leading-none"
        style={{
          fontVariationSettings: `'FILL' 0, 'wght' ${
            active ? 400 : 300
          }, 'GRAD' 0, 'opsz' 24`,
        }}
      >
        {icon}
      </span>

      <span className="flex-1">{label}</span>

      {badge != null && badge > 0 && (
        <span
          className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums ${
            active
              ? "bg-white/25 text-white"
              : "bg-[var(--brand)] text-white"
          }`}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}
