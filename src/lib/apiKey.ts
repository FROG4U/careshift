import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./prisma";

/**
 * The key on the export API's front door.
 *
 * One read-only key per system that pulls from us - today that is Omexx, PCG's
 * CRM. The key is generated here, shown to the office once, and typed into the
 * other system by them. We keep only its SHA-256, so this database being read
 * by the wrong person still hands them nothing that works.
 *
 * Rotating issues a new key and gives the old one a day to live, so the far
 * end can be changed over without a failed overnight sync.
 */

/** Readable, so a key found in a log or a config file is identifiable. */
const KEY_PREFIX = "pcgsc_";
/** How long a new key lasts unless the office says otherwise. */
export const DEFAULT_KEY_DAYS = 365;
/** How long a rotated key keeps working. */
export const ROTATION_GRACE_HOURS = 24;

export function newApiKey() {
  const key = KEY_PREFIX + randomBytes(30).toString("base64url");
  return { key, hash: hashApiKey(key), prefix: key.slice(0, 12) };
}

export function hashApiKey(key: string) {
  return createHash("sha256").update(key.trim()).digest("hex");
}

export type ApiCaller = {
  tenantId: string;
  tokenId: string;
  tokenName: string;
};

export type AuthFailure = { status: number; error: string };

/** The key from an Authorization header, or the `?key=` some tools insist on. */
function keyFrom(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const bearer = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (bearer) return bearer[1].trim();
  const direct = req.headers.get("x-api-key");
  if (direct) return direct.trim();
  return null;
}

export async function authenticateApiKey(
  req: Request,
): Promise<{ caller: ApiCaller } | { fail: AuthFailure }> {
  const key = keyFrom(req);
  if (!key) {
    return {
      fail: {
        status: 401,
        error: "No key. Send it as an Authorization: Bearer <key> header.",
      },
    };
  }

  const token = await prisma.apiToken.findUnique({
    where: { hash: hashApiKey(key) },
    select: {
      id: true,
      tenantId: true,
      name: true,
      expiresAt: true,
      retiresAt: true,
      revokedAt: true,
    },
  });
  if (!token) return { fail: { status: 401, error: "That key is not valid." } };

  const now = new Date();
  if (token.revokedAt) {
    return { fail: { status: 403, error: "That key has been switched off." } };
  }
  if (token.retiresAt && token.retiresAt <= now) {
    return {
      fail: {
        status: 403,
        error:
          "That key was replaced and has now stopped working. Use the key issued when it was rotated.",
      },
    };
  }
  if (token.expiresAt && token.expiresAt <= now) {
    return { fail: { status: 403, error: "That key has expired." } };
  }

  return {
    caller: { tenantId: token.tenantId, tokenId: token.id, tokenName: token.name },
  };
}

/**
 * Keep a line for every call. Without it there is no way to notice a key being
 * used from somewhere it should not be, or to answer "what did they take".
 * Never allowed to break the response it is recording.
 */
export async function logApiRequest(data: {
  tenantId: string;
  tokenId: string | null;
  path: string;
  query: string | null;
  status: number;
  rows: number | null;
  ms: number;
  ip: string | null;
}) {
  try {
    await prisma.apiRequest.create({
      data: { ...data, query: data.query?.slice(0, 500) ?? null },
    });
    if (data.tokenId) {
      await prisma.apiToken.update({
        where: { id: data.tokenId },
        data: { lastUsedAt: new Date() },
      });
    }
  } catch {
    /* the log is for the office; it must never fail a sync */
  }
}

/** The caller's address as nginx passes it through. */
export function ipOf(req: Request) {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim().slice(0, 60);
  return req.headers.get("x-real-ip")?.slice(0, 60) ?? null;
}
