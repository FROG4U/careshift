"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = {
  href: string;
  label: string;
  icon: string;
  badge: number;
};

/**
 * Admin quick-access bottom bar (mobile only — desktop uses the sidebar).
 * Same floating-pill style as the worker app: navy pill, the active tab
 * expands into a bronze pill with its label, unread/pending counts as white
 * badge chips.
 */
export function AdminBottomNav({
  unreadChat,
  pendingTimesheets,
}: {
  unreadChat: number;
  pendingTimesheets: number;
}) {
  const path = usePathname();

  const tabs: Tab[] = [
    { href: "/schedule", label: "Schedule", icon: "calendar_month", badge: 0 },
    { href: "/timesheets", label: "Timesheet", icon: "receipt_long", badge: pendingTimesheets },
    { href: "/live", label: "Live", icon: "sensors", badge: 0 },
    { href: "/messages", label: "Chat", icon: "chat_bubble", badge: unreadChat },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] md:hidden">
      <div
        className="mx-auto flex max-w-md items-center justify-between gap-1 rounded-full px-2 py-2 shadow-[0_10px_34px_rgba(0,49,70,0.28)]"
        style={{ background: "var(--brand)" }}
      >
        {tabs.map((tab) => {
          const active = path === tab.href || path.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`relative flex h-11 items-center justify-center rounded-full transition-all ${
                active ? "flex-1 gap-1.5 px-3" : "w-11"
              }`}
              style={active ? { background: "var(--accent, #886949)" } : undefined}
            >
              <span
                className={`material-symbols-rounded text-[24px] leading-none ${
                  active ? "text-white" : "text-white/55"
                }`}
                style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
              >
                {tab.icon}
              </span>
              {active && (
                <span className="text-[13px] font-bold text-white">{tab.label}</span>
              )}
              {tab.badge > 0 && (
                <span className="absolute right-0.5 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-[var(--brand)] ring-2 ring-[var(--brand)]">
                  {tab.badge > 99 ? "99+" : tab.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
