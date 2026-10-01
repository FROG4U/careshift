import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSession } from "@/lib/auth";
import {
  UPLOAD_DIR,
  LEGACY_UPLOAD_DIR,
  contentTypeFor,
  safeName,
} from "@/lib/uploads";

/**
 * GET /api/files/:name - an uploaded image, read from disk at request time.
 *
 * Signed in only: these are photographs of participants, their homes and
 * incidents, and a guessable link is not a permission.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const session = await getSession();
  if (!session) return new NextResponse("Not signed in", { status: 401 });

  const { name: raw } = await params;
  const name = safeName(raw);
  if (!name) return new NextResponse("Not found", { status: 404 });

  // The new home first, then where files used to be written.
  for (const dir of [UPLOAD_DIR, LEGACY_UPLOAD_DIR]) {
    try {
      const bytes = await readFile(path.join(dir, name));
      return new NextResponse(new Uint8Array(bytes), {
        headers: {
          "Content-Type": contentTypeFor(name),
          // Private: a shared cache must never hand a participant's photo to
          // the next person who asks for it.
          "Cache-Control": "private, max-age=86400",
        },
      });
    } catch {
      // Try the next directory.
    }
  }
  return new NextResponse("Not found", { status: 404 });
}
