import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { notifyUser } from "@/lib/notify";

/**
 * Voice call signalling.
 *
 * The audio is peer to peer: it goes straight between the two phones over
 * wifi or mobile data and never through this server. All this endpoint does
 * is pass the two ends the handshake they need to find each other, and keep
 * the record of who called whom.
 *
 * Deliberately plain HTTP rather than a websocket. The app already polls, the
 * server sits behind nginx and Passenger, and a call that takes an extra
 * second to connect is a far better trade than a socket that silently fails
 * to upgrade in production. Both ends gather their network candidates before
 * sending, so there is nothing to exchange while the phone rings.
 *
 * GET  ?id=       one call's current state (both ends poll this)
 * GET             the call ringing for me right now, if any
 * POST action=start|answer|decline|end
 */

/** A call older than this was never picked up. */
const RING_TIMEOUT_MS = 45_000;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "signed out" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const call = await prisma.call.findFirst({
      where: {
        id,
        tenantId: session.tenantId,
        OR: [{ fromUserId: session.id }, { toUserId: session.id }],
      },
    });
    if (!call) return NextResponse.json({ error: "gone" }, { status: 404 });

    // Nobody picked up. Recorded as missed so it shows in the log.
    if (
      call.status === "RINGING" &&
      Date.now() - call.createdAt.getTime() > RING_TIMEOUT_MS
    ) {
      await prisma.call.update({
        where: { id: call.id },
        data: { status: "MISSED", endedAt: new Date() },
      });
      return NextResponse.json({ ...call, status: "MISSED" });
    }
    return NextResponse.json(call);
  }

  // Anything ringing for me. Only the newest: a second caller waits.
  const incoming = await prisma.call.findFirst({
    where: {
      tenantId: session.tenantId,
      toUserId: session.id,
      status: "RINGING",
      createdAt: { gt: new Date(Date.now() - RING_TIMEOUT_MS) },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ incoming: incoming ?? null });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "signed out" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    id?: string;
    toUserId?: string;
    conversationId?: string;
    sdp?: string;
  };
  const action = body.action ?? "";

  if (action === "start") {
    if (!body.toUserId || !body.sdp) {
      return NextResponse.json({ error: "missing" }, { status: 400 });
    }
    // Same tenant only, and never yourself.
    const to = await prisma.user.findFirst({
      where: { id: body.toUserId, tenantId: session.tenantId, status: "APPROVED" },
      select: { id: true, name: true },
    });
    if (!to || to.id === session.id) {
      return NextResponse.json({ error: "no such person" }, { status: 404 });
    }

    const call = await prisma.call.create({
      data: {
        tenantId: session.tenantId,
        conversationId: body.conversationId ?? null,
        fromUserId: session.id,
        fromName: session.name,
        toUserId: to.id,
        toName: to.name,
        offer: body.sdp,
      },
    });

    // A push is what makes the phone light up when the app is in the
    // background. The in-app poll handles the case where it is already open.
    notifyUser(to.id, {
      tenantId: session.tenantId,
      type: "CALL",
      title: `${session.name} is calling`,
      body: "Tap to answer",
      url: "/dashboard",
    }).catch(() => {});

    return NextResponse.json({ id: call.id });
  }

  const call = body.id
    ? await prisma.call.findFirst({
        where: {
          id: body.id,
          tenantId: session.tenantId,
          OR: [{ fromUserId: session.id }, { toUserId: session.id }],
        },
      })
    : null;
  if (!call) return NextResponse.json({ error: "gone" }, { status: 404 });

  if (action === "answer") {
    if (call.toUserId !== session.id || !body.sdp) {
      return NextResponse.json({ error: "not yours" }, { status: 403 });
    }
    await prisma.call.update({
      where: { id: call.id },
      data: { status: "ACCEPTED", answer: body.sdp, answeredAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "decline") {
    if (call.toUserId !== session.id) {
      return NextResponse.json({ error: "not yours" }, { status: 403 });
    }
    await prisma.call.update({
      where: { id: call.id },
      data: { status: "DECLINED", endedAt: new Date(), endedBy: session.name },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "end") {
    if (call.status === "ENDED" || call.status === "DECLINED") {
      return NextResponse.json({ ok: true });
    }
    const endedAt = new Date();
    const durationSec = call.answeredAt
      ? Math.max(0, Math.round((endedAt.getTime() - call.answeredAt.getTime()) / 1000))
      : null;
    await prisma.call.update({
      where: { id: call.id },
      data: {
        status: call.answeredAt ? "ENDED" : "MISSED",
        endedAt,
        durationSec,
        endedBy: session.name,
      },
    });

    // Leave a line in the conversation, the way a phone leaves a call log -
    // so the office and the worker can both see a call happened and when.
    if (call.conversationId && call.answeredAt) {
      const mins = Math.floor((durationSec ?? 0) / 60);
      const secs = (durationSec ?? 0) % 60;
      await prisma.message
        .create({
          data: {
            tenantId: session.tenantId,
            conversationId: call.conversationId,
            senderId: call.fromUserId,
            body: `Voice call - ${mins > 0 ? `${mins}m ` : ""}${secs}s`,
          },
        })
        .catch(() => {});
    }
    return NextResponse.json({ ok: true, durationSec });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
