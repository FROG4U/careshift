import "server-only";
import { prisma } from "./prisma";

/**
 * A note that a record has gone.
 *
 * The export API sends only what has changed since the last pull, and a row
 * that no longer exists cannot appear in that list - so without this, Omexx
 * would keep a deleted shift on its books forever. This is the list of what
 * has been removed, which /api/export/deletions hands over.
 *
 * Never allowed to fail the deletion it is recording: a missed line means one
 * stale row in a CRM, a thrown error means an admin cannot delete a shift.
 */
export async function recordDeletion(
  tenantId: string,
  kind: "shift" | "client" | "staff",
  recordIds: string[],
  by?: string | null,
  /** The participant or worker the record hung off, where it helps. */
  parentId?: string | null,
) {
  if (recordIds.length === 0) return;
  try {
    await prisma.deletedRecord.createMany({
      data: recordIds.map((recordId) => ({
        tenantId,
        kind,
        recordId,
        parentId: parentId ?? null,
        deletedBy: by ?? null,
      })),
    });
  } catch {
    /* see the note above */
  }
}
