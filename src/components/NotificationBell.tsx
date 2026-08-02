"use client";

import { useState, useTransition } from "react";
import { markNotificationsRead } from "@/app/(app)/actions";

export type NotifItem = {
  id: string;
  title: string;
  body: string | null;
  read: boolean;
  createdAt: Date | string;
};

function ago(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  const mins = Math.round((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export function NotificationBell({
  notifications,
  onDark = false,
}: {
  notifications: NotifItem[];
  onDark?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const unread = notifications.filter((n) => !n.read).length;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) start(() => markNotificationsRead());
  }

  return (
    <div className="relative">
      <button
        onClick={toggle}
        className={`relative flex h-9 w-9 items-center justify-center rounded-lg ${
          onDark ? "bg-white/15 text-white" : "text-slate-500 hover:bg-slate-100"
        }`}
        title="Notifications"
      >
        <span className="material-symbols-rounded text-[20px]">notifications</span>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 max-w-[85vw] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800">
              Notifications
            </div>
            <ul className="max-h-96 divide-y divide-slate-100 overflow-auto">
              {notifications.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-slate-400">
                  No notifications yet.
                </li>
              )}
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={`px-4 py-3 ${n.read ? "" : "bg-blue-50/40"}`}
                >
                  <div className="text-sm font-medium text-slate-800">
                    {n.title}
                  </div>
                  {n.body && (
                    <div className="mt-0.5 text-xs text-slate-500">{n.body}</div>
                  )}
                  <div className="mt-1 text-[11px] text-slate-400">
                    {ago(n.createdAt)}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
