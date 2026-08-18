import "server-only";
import webpush from "web-push";
import { prisma } from "./prisma";

/**
 * Web push delivery.
 *
 * Every in-app notification we already create (shift offered, running late,
 * swap request, new message…) also fires a real push here, so workers see it
 * on their phone without the app being open.
 *
 * Push is best-effort by design: if the VAPID keys aren't configured, or a
 * device's subscription has expired, that must NEVER break the action that
 * triggered it (publishing a shift, sending a message). Failures are swallowed.
 *
 * iOS note: Safari only delivers web push when the app has been installed to
 * the Home Screen (iOS 16.4+). Android/desktop Chrome work in the browser too.
 */

let configured = false;

/** True when VAPID keys are present, so we can actually send. */
function ensureConfigured(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? "mailto:info@pristinecaregroup.au",
      publicKey,
      privateKey,
    );
    configured = true;
  }
  return true;
}

export type PushPayload = {
  title: string;
  body?: string | null;
  /** Where tapping the notification should land. */
  url?: string;
  /** Same tag replaces an earlier notification instead of stacking. */
  tag?: string;
};

/** Send a push to every device belonging to these users. Never throws. */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<void> {
  try {
    if (userIds.length === 0) return;
    if (!ensureConfigured()) return;

    const subs = await prisma.pushSubscription.findMany({
      where: { userId: { in: userIds } },
    });
    if (subs.length === 0) return;

    const data = JSON.stringify({
      title: payload.title,
      body: payload.body ?? "",
      url: payload.url ?? "/",
      tag: payload.tag,
    });

    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: s.endpoint,
              keys: { p256dh: s.p256dh, auth: s.auth },
            },
            data,
          );
          await prisma.pushSubscription.update({
            where: { id: s.id },
            data: { lastUsedAt: new Date() },
          });
        } catch (err) {
          // 404/410 mean the browser threw the subscription away (app removed,
          // notifications revoked). Drop the row so we stop trying.
          const status = (err as { statusCode?: number })?.statusCode;
          if (status === 404 || status === 410) {
            await prisma.pushSubscription
              .delete({ where: { id: s.id } })
              .catch(() => {});
          }
        }
      }),
    );
  } catch {
    // Push must never break the thing that triggered it.
  }
}

/** Is push configured on this server? Used by the opt-in UI. */
export function pushEnabled(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}
