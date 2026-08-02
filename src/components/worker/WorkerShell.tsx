"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NotificationBell, type NotifItem } from "@/components/NotificationBell";
import { logoutAction } from "@/app/(app)/actions";

type Tab = {
  href: string;
  label: string;
  icon: string;
  match: (p: string) => boolean;
  chat?: boolean;
  pending?: boolean;
};

const TABS: Tab[] = [
  { href: "/my-shifts", label: "Shifts", icon: "punch_clock", match: (p) => p === "/my-shifts" },
  { href: "/my-shifts/pending", label: "Pending", icon: "pending_actions", match: (p) => p.startsWith("/my-shifts/pending"), pending: true },
  { href: "/my-shifts/calendar", label: "Calendar", icon: "calendar_month", match: (p) => p.startsWith("/my-shifts/calendar") },
  { href: "/my-shifts/chat", label: "Chat", icon: "chat_bubble", match: (p) => p.startsWith("/my-shifts/chat"), chat: true },
  { href: "/my-shifts/completed", label: "Completed", icon: "task_alt", match: (p) => p.startsWith("/my-shifts/completed") },
];

function titleFor(path: string) {
  if (path.startsWith("/my-shifts/calendar")) return "My Calendar";
  if (path.startsWith("/my-shifts/availability")) return "My Availability";
  if (path.startsWith("/my-shifts/chat")) return "Chat";
  if (path.startsWith("/my-shifts/completed")) return "Completed Shifts";
  if (path.startsWith("/my-shifts/profile")) return "Profile";
  if (path.startsWith("/my-shifts/summary")) return "My Hours";
  return "Time Clock";
}

export function WorkerShell({
  brand,
  accent,
  tenantName,
  firstName,
  photoUrl,
  notifications,
  chatUnread,
  pendingCount,
  children,
}: {
  brand: string;
  accent: string;
  tenantName: string;
  firstName: string;
  photoUrl: string | null;
  notifications: NotifItem[];
  chatUnread: number;
  pendingCount: number;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // An open conversation (`/my-shifts/chat/<id>`) takes over the full screen —
  // its own header + message composer replace the app chrome (Instagram-style).
  const isThread = /^\/my-shifts\/chat\/.+/.test(path);
  if (isThread) {
    return (
      <div
        className="h-[100dvh] bg-white max-w-md mx-auto"
        style={{ ["--brand" as string]: brand, ["--accent" as string]: accent }}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      className="relative min-h-screen bg-[#f6f7f9]"
      style={{ ["--brand" as string]: brand, ["--accent" as string]: accent }}
    >
      {/* ── Navy brand top bar ──────────────────────────────────── */}
      <header
        className="sticky top-0 z-30 text-white"
        style={{ background: "var(--brand)" }}
      >
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3.5">
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Menu"
            className="-ml-1 flex h-9 w-9 items-center justify-center rounded-xl text-white transition hover:bg-white/15"
          >
            <span className="material-symbols-rounded text-[24px]">menu</span>
          </button>
          <div className="text-center">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-white/60">
              {tenantName}
            </div>
            <div className="text-base font-bold leading-tight text-white">
              {titleFor(path)}
            </div>
          </div>
          <NotificationBell notifications={notifications} onDark />
        </div>
      </header>

      {/* ── Page content ────────────────────────────────────────── */}
      <main className="mx-auto max-w-md pb-28">{children}</main>

      {/* ── Slide-in hamburger drawer ───────────────────────────── */}
      {menuOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[80%] flex-col bg-white shadow-2xl">
            <div
              className="px-5 pb-5 pt-6 text-white"
              style={{
                background:
                  "linear-gradient(135deg, var(--brand), color-mix(in srgb, var(--brand) 62%, #000))",
              }}
            >
              {photoUrl ? (
                <img src={photoUrl} alt="" className="h-12 w-12 rounded-2xl object-cover" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-lg font-bold">
                  {firstName.charAt(0)}
                </div>
              )}
              <div className="mt-3 text-lg font-bold">Hi {firstName} 👋</div>
              <div className="text-xs opacity-80">{tenantName}</div>
            </div>

            <nav className="flex-1 overflow-y-auto p-3">
              <DrawerLink href="/my-shifts/availability" icon="event_busy" label="My availability" onClick={() => setMenuOpen(false)} />
              <DrawerLink href="/my-shifts/summary" icon="schedule" label="My hours & mileage" onClick={() => setMenuOpen(false)} />
              <DrawerLink href="/my-shifts/profile" icon="badge" label="My profile" onClick={() => setMenuOpen(false)} />
              <DrawerLink href="/install" icon="install_mobile" label="Get the app" onClick={() => setMenuOpen(false)} />
              <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                More coming soon
              </p>
              <div className="rounded-xl bg-slate-50 px-3 py-3 text-xs text-slate-400">
                Tell me what else to put in this menu and I'll add it.
              </div>
            </nav>

            <form action={logoutAction} className="border-t border-slate-100 p-3">
              <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50">
                <span className="material-symbols-rounded text-[20px]">logout</span>
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Instagram-style floating pill nav ───────────────────── */}
      <nav className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)]">
        <div
          className="mx-auto flex max-w-md items-center justify-between gap-1 rounded-full px-2 py-2 shadow-[0_10px_34px_rgba(0,49,70,0.28)]"
          style={{ background: "var(--brand)" }}
        >
          {TABS.map((tab) => (
            <TabItem
              key={tab.href}
              tab={tab}
              active={tab.match(path)}
              chatUnread={chatUnread}
              pendingCount={pendingCount}
            />
          ))}
        </div>
      </nav>
    </div>
  );
}

function TabItem({
  tab,
  active,
  chatUnread,
  pendingCount,
}: {
  tab: Tab;
  active: boolean;
  chatUnread: number;
  pendingCount: number;
}) {
  const badge = tab.chat ? chatUnread : tab.pending ? pendingCount : 0;

  return (
    <Link
      href={tab.href}
      className={`relative flex h-11 items-center justify-center rounded-full transition-all ${
        active ? "flex-1 gap-1.5 px-3" : "w-11"
      }`}
      style={active ? { background: "var(--accent, #886949)" } : undefined}
    >
      <span
        className={`material-symbols-rounded text-[24px] leading-none ${active ? "text-white" : "text-white/55"}`}
        style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
      >
        {tab.icon}
      </span>
      {active && (
        <span className="text-[13px] font-bold text-white">{tab.label}</span>
      )}
      {badge > 0 && (
        <span
          className={`absolute top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold ring-2 text-[var(--brand)] ${
            active ? "right-1 ring-[var(--accent,#886949)]" : "right-0.5 ring-[var(--brand)]"
          }`}
        >
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </Link>
  );
}

function DrawerLink({
  href,
  icon,
  label,
  onClick,
}: {
  href: string;
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
    >
      <span className="material-symbols-rounded text-[20px] text-[var(--brand)]">{icon}</span>
      {label}
    </Link>
  );
}
