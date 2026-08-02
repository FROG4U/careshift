"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export type SidebarCounts = {
  unreadChat: number;
  pendingSwaps: number;
  pendingLeave: number;
  pendingTimesheets: number;
  pendingApprovals: number;
};

type Item = {
  href: string;
  label: string;
  icon: string;
  badgeKey?: keyof SidebarCounts;
  managerOnly?: boolean;
};

type Group = { title: string; items: Item[] };

const GROUPS: Group[] = [
  {
    title: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
      { href: "/schedule", label: "Schedule", icon: "calendar_month" },
    ],
  },
  {
    title: "People",
    items: [
      { href: "/clients", label: "Participants", icon: "people" },
      { href: "/staff", label: "Staff", icon: "badge" },
      { href: "/approvals", label: "Approvals", icon: "how_to_reg", badgeKey: "pendingApprovals", managerOnly: true },
    ],
  },
  {
    title: "Operations",
    items: [
      { href: "/live", label: "Live Shifts", icon: "sensors" },
      { href: "/timesheets", label: "Timesheets", icon: "receipt_long", badgeKey: "pendingTimesheets" },
      { href: "/swaps", label: "Shift Swaps", icon: "swap_horiz", badgeKey: "pendingSwaps" },
      { href: "/leave", label: "Availability", icon: "event_busy", badgeKey: "pendingLeave" },
      { href: "/attendance", label: "Attendance", icon: "fact_check", managerOnly: true },
      { href: "/payroll", label: "Payroll Period", icon: "payments", managerOnly: true },
    ],
  },
  {
    title: "Communication",
    items: [
      { href: "/messages", label: "Messages", icon: "chat_bubble", badgeKey: "unreadChat" },
    ],
  },
  {
    title: "Account",
    items: [{ href: "/settings", label: "Settings", icon: "settings" }],
  },
];

export function AdminSidebar({
  tenantName,
  name,
  email,
  isManager,
  counts,
  logout,
}: {
  tenantName: string;
  name: string;
  email: string;
  isManager: boolean;
  counts: SidebarCounts;
  logout: (formData: FormData) => void;
}) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (title: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(title) ? next.delete(title) : next.add(title);
      return next;
    });

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <aside
      className="hidden w-64 shrink-0 flex-col text-white md:flex"
      style={{ background: "var(--brand)" }}
    >
      {/* Logo / org */}
      <div className="flex items-center gap-3 px-5 py-5">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-bold text-white shadow-md"
          style={{ background: "var(--accent, #886949)" }}
        >
          {tenantName[0]}
        </div>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-bold">{tenantName}</div>
          <div className="text-xs font-medium text-white/50">Care Platform</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto pb-3">
        {GROUPS.map((group) => {
          const items = group.items.filter((i) => !i.managerOnly || isManager);
          if (items.length === 0) return null;
          const isCollapsed = collapsed.has(group.title);
          return (
            <div key={group.title} className="mb-0.5">
              <button
                onClick={() => toggle(group.title)}
                className="flex w-full items-center justify-between px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-white/40 transition hover:text-white/60"
              >
                {group.title}
                <span className="material-symbols-rounded text-[18px]">
                  {isCollapsed ? "expand_more" : "expand_less"}
                </span>
              </button>

              {!isCollapsed &&
                items.map((item) => {
                  const active =
                    path === item.href || path.startsWith(item.href + "/");
                  const badge = item.badgeKey ? counts[item.badgeKey] : 0;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 border-l-[3px] px-5 py-2.5 text-sm transition ${
                        active
                          ? "border-[var(--accent,#886949)] bg-white/10 font-semibold text-white"
                          : "border-transparent text-white/75 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <span
                        className="material-symbols-rounded text-[22px]"
                        style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
                      >
                        {item.icon}
                      </span>
                      <span className="flex-1">{item.label}</span>
                      {badge > 0 && (
                        <span
                          className="flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white"
                          style={{ background: "var(--accent, #886949)" }}
                        >
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
            </div>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 px-2">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
            style={{ background: "var(--accent, #886949)" }}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{name}</div>
            <div className="truncate text-xs text-white/50">{email}</div>
          </div>
        </div>
        <form action={logout}>
          <button className="mt-2 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-medium text-white/70 transition hover:bg-white/10 hover:text-white">
            <span className="material-symbols-rounded text-[18px]">logout</span>
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
