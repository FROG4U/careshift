import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

/**
 * The servers a call uses to find a route between two phones.
 *
 * STUN alone gets most calls connected. On mobile networks that hide their
 * users behind a carrier NAT the two ends cannot see each other at all and
 * need a relay (TURN) to pass the audio through. TURN credentials are short
 * lived, so they are minted here rather than shipped in the page.
 *
 * With no TURN configured the call still works on most wifi and many mobile
 * networks - it simply fails to connect on the awkward ones.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "signed out" }, { status: 401 });

  const iceServers: RTCIceServer[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ];

  // Cloudflare mints a fresh username and password per call.
  const cfId = process.env.TURN_CF_KEY_ID;
  const cfToken = process.env.TURN_CF_API_TOKEN;
  if (cfId && cfToken) {
    try {
      const res = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${cfId}/credentials/generate-ice-servers`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cfToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ttl: 600 }),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as {
          iceServers?: RTCIceServer | RTCIceServer[];
        };
        const got = data.iceServers;
        if (Array.isArray(got)) iceServers.push(...got);
        else if (got) iceServers.push(got);
      }
    } catch {
      // A relay we cannot reach is not a reason to block the call.
    }
  }

  // Or a plain TURN server of our own (coturn), set in the environment.
  const url = process.env.TURN_URL;
  if (url && process.env.TURN_USERNAME && process.env.TURN_PASSWORD) {
    iceServers.push({
      urls: url.split(",").map((u) => u.trim()),
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_PASSWORD,
    });
  }

  return NextResponse.json({ iceServers });
}
