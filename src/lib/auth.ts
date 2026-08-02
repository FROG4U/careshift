import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import type { Role } from "./constants";

const COOKIE = "careshift_session";
const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "dev-secret-change-me",
);

export type SessionUser = {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: Role;
  staffId: string | null;
  /** Account approval state ∈ PENDING | APPROVED | REJECTED. */
  status: string;
};

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      id: payload.id as string,
      tenantId: payload.tenantId as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as Role,
      staffId: (payload.staffId as string | null) ?? null,
      // Older sessions (issued before approval existed) have no status — treat
      // them as APPROVED so existing logins keep working.
      status: (payload.status as string | undefined) ?? "APPROVED",
    };
  } catch {
    return null;
  }
}

/** Look up a user by email + password and return a session payload, or null. */
export async function authenticate(email: string, password: string) {
  const user = await prisma.user.findFirst({
    where: { email: email.toLowerCase().trim() },
  });
  if (!user) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  const session: SessionUser = {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    name: user.name,
    role: user.role as Role,
    staffId: user.staffId,
    status: user.status,
  };
  return session;
}
