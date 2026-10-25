import { serveExport } from "@/lib/exportRoute";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return serveExport(req, "participants");
}
