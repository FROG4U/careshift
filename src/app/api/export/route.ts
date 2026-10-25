import { NextResponse } from "next/server";
import { authenticateApiKey, ipOf, logApiRequest } from "@/lib/apiKey";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/export - what is here and how to ask for it.
 *
 * Doubles as the connection test: a key that can read this is a key that
 * works, which saves a round of "is it me or is it you".
 */
export async function GET(req: Request) {
  const started = Date.now();
  const auth = await authenticateApiKey(req);
  if ("fail" in auth) {
    return NextResponse.json(
      { error: auth.fail.error },
      { status: auth.fail.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  const { caller } = auth;
  const tenant = await prisma.tenant.findUnique({
    where: { id: caller.tenantId },
    select: { name: true },
  });

  await logApiRequest({
    tenantId: caller.tenantId,
    tokenId: caller.tokenId,
    path: "/api/export",
    query: null,
    status: 200,
    rows: null,
    ms: Date.now() - started,
    ip: ipOf(req),
  });

  const base = new URL(req.url).origin + "/api/export";

  return NextResponse.json(
    {
      ok: true,
      provider: tenant?.name ?? "PCG Shift Care",
      issuedTo: caller.tokenName,
      access: "read only",
      serverNow: new Date().toISOString(),

      howTo: {
        auth: "Send the key as: Authorization: Bearer <key>",
        incremental:
          "Pass ?since=<timestamp> to get only what has changed. Use the `nextSince` from your last answer, not your own clock: it already allows for rows changing while a pull is running.",
        paging:
          "An answer carries at most `limit` rows (default 500, max 5000). If `hasMore` is true, ask again with ?cursor=<nextCursor> and the same filters.",
        matching:
          "Match on the id columns (shift_id, participant_id, employee_id). They are assigned at creation and never change, so re-running an import updates rather than duplicates.",
        deletions:
          "An incremental pull cannot mention a record that no longer exists. Read /deletions with the same `since` to find what has gone.",
        formats: "JSON by default. Add ?format=csv for the same rows as a CSV file.",
        times:
          "Every timestamp ending _utc is a UTC instant and is what you should store. The _local columns are the same moment in the branch's own timezone, for people to read.",
      },

      datasets: [
        {
          name: "shifts",
          url: `${base}/shifts`,
          supports: ["since", "from", "to", "branch", "limit", "cursor", "format"],
          note: "Every shift. `paid_hours` is what reaches payroll: clocked time trimmed to the rostered window, less breaks, extended only where the office authorised it.",
        },
        {
          name: "shift-notes",
          url: `${base}/shift-notes`,
          supports: ["since", "from", "to", "branch", "limit", "cursor", "format"],
          note: "The progress note and handover note each worker wrote, with real participant names.",
        },
        {
          name: "timesheets",
          url: `${base}/timesheets`,
          supports: ["from", "to", "branch", "limit", "cursor", "format"],
          note: "Approved hours per worker for a period. from and to are required.",
        },
        {
          name: "payroll",
          url: `${base}/payroll`,
          supports: ["from", "to", "branch", "format"],
          note: "One line per worker per earnings rate, plus mileage and super. from and to are required. Hours are to four decimals on purpose: rounding them changes the total.",
        },
        {
          name: "staff",
          url: `${base}/staff`,
          supports: ["since", "limit", "cursor", "format"],
          note: "employee_id is the key to match workers on, not the email, which can change.",
        },
        {
          name: "participants",
          url: `${base}/participants`,
          supports: ["since", "limit", "cursor", "format"],
          note: "Participants and their plan dates, budget and agreed weekly hours.",
        },
        {
          name: "deletions",
          url: `${base}/deletions`,
          supports: ["since", "limit", "cursor", "format"],
          note: "Records that have been deleted, so an incremental import can remove them too.",
        },
      ],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
