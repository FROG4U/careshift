import "server-only";
import { NextResponse } from "next/server";
import {
  authenticateApiKey,
  ipOf,
  logApiRequest,
} from "./apiKey";
import {
  BadRequest,
  DATASETS,
  nextSince,
  parseQuery,
  type DatasetName,
} from "./exportData";
import { toCsv } from "./exportCsv";

/**
 * One answer, the same shape every time.
 *
 * Every endpoint under /api/export goes through here, so the key check, the
 * paging, the two output formats and the audit line are written once. An
 * endpoint that forgot one of those is how an export turns into a leak.
 */
export async function serveExport(req: Request, dataset: DatasetName) {
  const started = Date.now();
  const url = new URL(req.url);
  const path = `/api/export/${dataset}`;
  const ip = ipOf(req);

  const auth = await authenticateApiKey(req);
  if ("fail" in auth) {
    // Logged without a tenant: a rejected key is exactly what the office
    // would want to see, and we don't know whose it was meant to be.
    return NextResponse.json(
      { error: auth.fail.error },
      { status: auth.fail.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  const { caller } = auth;

  const finish = (status: number, rows: number | null) =>
    logApiRequest({
      tenantId: caller.tenantId,
      tokenId: caller.tokenId,
      path,
      query: url.search || null,
      status,
      rows,
      ms: Date.now() - started,
      ip,
    });

  const q = parseQuery(url.searchParams);
  if ("error" in q) {
    await finish(400, null);
    return NextResponse.json({ error: q.error }, { status: 400 });
  }

  try {
    const generatedAt = new Date();
    const page = await DATASETS[dataset](caller.tenantId, q);
    await finish(200, page.rows.length);

    const headers: Record<string, string> = {
      "Cache-Control": "no-store",
      "X-Has-More": String(page.hasMore),
      "X-Next-Since": nextSince(generatedAt),
    };
    if (page.nextCursor) headers["X-Next-Cursor"] = page.nextCursor;

    if (url.searchParams.get("format") === "csv") {
      return new NextResponse(toCsv(page.rows), {
        headers: {
          ...headers,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${dataset}.csv"`,
        },
      });
    }

    return NextResponse.json(
      {
        dataset,
        generatedAt: generatedAt.toISOString(),
        // What to send as `since` next time. It deliberately overlaps this
        // pull, because rows can change while one is running and a row seen
        // twice costs nothing while a row missed costs a shift.
        nextSince: nextSince(generatedAt),
        count: page.rows.length,
        hasMore: page.hasMore,
        nextCursor: page.nextCursor,
        rows: page.rows,
      },
      { headers },
    );
  } catch (e) {
    if (e instanceof BadRequest) {
      await finish(400, null);
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error(`export ${dataset} failed`, e);
    await finish(500, null);
    return NextResponse.json(
      { error: "Something went wrong at our end. Try again; if it keeps happening, tell PCG." },
      { status: 500 },
    );
  }
}
