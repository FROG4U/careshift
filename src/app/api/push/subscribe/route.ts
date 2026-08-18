import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pushEnabled } from "@/lib/push";

/**
 * GET  — the VAPID public key the browser needs in order to subscribe.
 *        Served at runtime (rather than baked in at build time) so rotating
 *        the keys only needs a restart, not a rebuild.
 */
export async function GET() {
  if (!pushEnabled()) {
    return NextResponse.json({ enabled: false });
  }
  return NextResponse.json({
    enabled: true,
    publicKey: process.env.VAPID_PUBLIC_KEY,
  });
}

/** POST — save (or refresh) this device's push subscription for the user. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let body: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const endpoint = body.endpoint;
  const p256dh = body.keys?.p256dh;
  const auth = body.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json(
      { ok: false, error: "incomplete subscription" },
      { status: 400 },
    );
  }

  // The endpoint uniquely identifies the device, so re-subscribing (or a
  // different user on a shared device) updates the existing row.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: {
      userId: session.id,
      tenantId: session.tenantId,
      p256dh,
      auth,
      userAgent: req.headers.get("user-agent")?.slice(0, 255) ?? null,
    },
    create: {
      tenantId: session.tenantId,
      userId: session.id,
      endpoint,
      p256dh,
      auth,
      userAgent: req.headers.get("user-agent")?.slice(0, 255) ?? null,
    },
  });

  return NextResponse.json({ ok: true });
}

/** DELETE — the user turned notifications off on this device. */
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  let endpoint: string | undefined;
  try {
    endpoint = (await req.json())?.endpoint;
  } catch {
    /* ignore */
  }
  if (endpoint) {
    await prisma.pushSubscription
      .deleteMany({ where: { endpoint, userId: session.id } })
      .catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
