import { requireTenant } from "@/lib/tenant";
import { runLiveChecks } from "@/lib/liveShifts";
import { LiveShiftsView } from "./LiveShiftsView";

// Always run fresh — this page reflects "right now".
export const dynamic = "force-dynamic";

export default async function LivePage() {
  const { tenant } = await requireTenant();
  const shifts = await runLiveChecks(tenant.id, tenant.lateGraceMin ?? 5);
  return <LiveShiftsView shifts={shifts} />;
}
