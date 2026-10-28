import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { authenticateApiKey, ipOf, logApiRequest } from "@/lib/apiKey";
import {
  UPLOAD_DIR,
  LEGACY_UPLOAD_DIR,
  contentTypeFor,
  safeName,
} from "@/lib/uploads";

/**
 * GET /api/export/files/:name - an uploaded image, for a system holding an
 * export key rather than a signed-in person.
 *
 * The ordinary /api/files route needs a session cookie, which Omexx has no
 * way of holding. Without this, every photo link in the export would be a
 * dead end: the incident would arrive and its evidence would not.
 *
 * Same file, same rules, different door. The key is read only, and this
 * serves nothing that is not already reachable through the datasets.
 */
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const started = Date.now();
  const auth = await authenticateApiKey(req);
  if ("fail" in auth) {
    return new NextResponse(auth.fail.error, { status: auth.fail.status });
  }
  const { caller } = auth;

  const { name: raw } = await params;
  const name = safeName(raw);

  const finish = (status: number) =>
    logApiRequest({
      tenantId: caller.tenantId,
      tokenId: caller.tokenId,
      path: `/api/export/files/${name ?? "?"}`,
      query: null,
      status,
      rows: status === 200 ? 1 : null,
      ms: Date.now() - started,
      ip: ipOf(req),
    });

  if (!name) {
    await finish(404);
    return new NextResponse("Not found", { status: 404 });
  }

  for (const dir of [UPLOAD_DIR, LEGACY_UPLOAD_DIR]) {
    try {
      const bytes = await readFile(path.join(dir, name));
      await finish(200);
      return new NextResponse(new Uint8Array(bytes), {
        headers: {
          "Content-Type": contentTypeFor(name),
          // Never a shared cache: these are photographs of participants,
          // their homes and incidents.
          "Cache-Control": "private, no-store",
        },
      });
    } catch {
      // Try the next directory.
    }
  }

  await finish(404);
  return new NextResponse("Not found", { status: 404 });
}
