import "server-only";
import path from "node:path";

/**
 * Where uploaded images live.
 *
 * NOT inside public/. Next indexes that folder when it builds, so anything
 * written there afterwards is a 404 until the next deploy - which is exactly
 * what happened to every chat photo sent between releases. Files now go to a
 * plain data directory and are served by /api/files, which reads from disk on
 * each request.
 *
 * It also fixes a quieter problem: /uploads/<name> was public to anyone with
 * the link. These are photographs of participants and their homes, so they
 * now need a login.
 */
export const UPLOAD_DIR =
  process.env.UPLOAD_DIR || path.join(process.cwd(), "data", "uploads");

/** Where the older images still sit, from when they went into public/. */
export const LEGACY_UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

/** The link stored on a message or an incident photo. */
export const fileUrl = (name: string) => `/api/files/${name}`;

/**
 * Only a bare file name is ever accepted, so a crafted link cannot walk out
 * of the uploads folder and read the server's own files.
 */
export function safeName(name: string): string | null {
  const base = path.basename(name);
  if (base !== name) return null;
  if (!/^[A-Za-z0-9._-]+$/.test(base)) return null;
  if (base.startsWith(".")) return null;
  return base;
}

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".pdf": "application/pdf",
};

export const contentTypeFor = (name: string) =>
  TYPES[path.extname(name).toLowerCase()] ?? "application/octet-stream";
