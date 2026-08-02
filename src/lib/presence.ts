// Presence: a user is "online" if their heartbeat landed within the last 2
// minutes (heartbeat runs ~every 45s while the app is open).
const ONLINE_MS = 2 * 60_000;

export function isOnline(lastSeenAt: Date | string | null | undefined): boolean {
  if (!lastSeenAt) return false;
  const t = new Date(lastSeenAt).getTime();
  return Date.now() - t < ONLINE_MS;
}

/** "Online", "Active 5m ago", "Active 2h ago", or "Offline". */
export function presenceLabel(
  lastSeenAt: Date | string | null | undefined,
): string {
  if (!lastSeenAt) return "Offline";
  if (isOnline(lastSeenAt)) return "Online";
  const mins = Math.round((Date.now() - new Date(lastSeenAt).getTime()) / 60000);
  if (mins < 60) return `Active ${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `Active ${h}h ago`;
  const d = Math.round(h / 24);
  return `Active ${d}d ago`;
}
