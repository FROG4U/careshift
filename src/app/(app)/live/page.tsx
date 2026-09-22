import { requireScope } from "@/lib/tenant";
import { runLiveChecks } from "@/lib/liveShifts";
import { LiveShiftsView } from "./LiveShiftsView";

// Always run fresh — this page reflects "right now".
export const dynamic = "force-dynamic";

export default async function LivePage() {
  const { tenant, scope } = await requireScope();
  const shifts = await runLiveChecks(
    tenant.id,
    tenant.lateGraceMin ?? 5,
    scope.all ? null : scope.ops,
  );
  return <LiveShiftsView shifts={shifts} />;
}
