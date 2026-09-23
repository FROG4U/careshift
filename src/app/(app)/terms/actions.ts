"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isAdmin, isSuperAdmin } from "@/lib/roles";
import { notifyUser } from "@/lib/notify";
import { TERMS_TEMPLATE } from "@/lib/termsTemplate";

/**
 * Worker terms: drafting, versioning and publishing.
 *
 * Rules that make an acceptance worth something:
 *  - a PUBLISHED version is never edited, only superseded by the next one;
 *  - publishing is a super-admin action, because it puts a pop-up in front of
 *    every worker and asks for their signature;
 *  - acceptances are never deleted, even when the version is superseded.
 */

async function requireAdmin() {
  const session = await getSession();
  if (!session || !isAdmin(session.role)) return null;
  return session;
}

/** First run: create version 1 as a draft from the PCG template. */
export async function createFromTemplate() {
  const session = await requireAdmin();
  if (!session) return { error: "You don't have permission to do that." };

  const existing = await prisma.termsVersion.count({
    where: { tenantId: session.tenantId },
  });
  if (existing > 0) return { error: "Terms already exist. Edit the draft or create a new version." };

  const created = await prisma.termsVersion.create({
    data: {
      tenantId: session.tenantId,
      version: 1,
      title: "Support Worker Terms and Conditions",
      content: TERMS_TEMPLATE,
      changeNote: "First version.",
      status: "DRAFT",
    },
  });
  revalidatePath("/terms");
  redirect(`/terms/${created.id}`);
}

/**
 * Start the next version from the current wording.
 *
 * A change to a published version has to become version N+1: workers agreed to
 * the old words, and the record has to keep pointing at them.
 */
export async function createNextVersion() {
  const session = await requireAdmin();
  if (!session) return { error: "You don't have permission to do that." };

  const [latest, draft] = await Promise.all([
    prisma.termsVersion.findFirst({
      where: { tenantId: session.tenantId },
      orderBy: { version: "desc" },
    }),
    prisma.termsVersion.findFirst({
      where: { tenantId: session.tenantId, status: "DRAFT" },
    }),
  ]);
  if (!latest) return { error: "There are no terms yet." };
  if (draft) redirect(`/terms/${draft.id}`);

  const created = await prisma.termsVersion.create({
    data: {
      tenantId: session.tenantId,
      version: latest.version + 1,
      title: latest.title,
      content: latest.content,
      changeNote: "",
      status: "DRAFT",
    },
  });
  revalidatePath("/terms");
  redirect(`/terms/${created.id}`);
}

/** Save the draft's wording. Published versions are read-only. */
export async function saveDraft(formData: FormData) {
  const session = await requireAdmin();
  if (!session) return { error: "You don't have permission to do that." };

  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const changeNote = String(formData.get("changeNote") ?? "").trim();
  if (!title || !content) return { error: "Give it a title and some wording." };

  const row = await prisma.termsVersion.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!row) return { error: "That version no longer exists." };
  if (row.status !== "DRAFT") {
    return { error: "Published terms can't be edited. Create the next version instead." };
  }

  await prisma.termsVersion.update({
    where: { id },
    data: { title, content, changeNote: changeNote || null },
  });
  revalidatePath("/terms");
  revalidatePath(`/terms/${id}`);
  return { ok: true, savedAt: new Date().toISOString() };
}

/**
 * Publish: the draft becomes the live terms, the previous version is marked
 * superseded, and every active worker is asked to agree on their next visit.
 */
export async function publishVersion(formData: FormData) {
  const session = await getSession();
  if (!session || !isSuperAdmin(session.role)) {
    return { error: "Only a super admin can publish terms to the workers." };
  }

  const id = String(formData.get("id") ?? "");
  const row = await prisma.termsVersion.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!row) return { error: "That version no longer exists." };
  if (row.status !== "DRAFT") return { error: "That version is already published." };

  const workers = await prisma.user.findMany({
    where: {
      tenantId: session.tenantId,
      status: "APPROVED",
      role: "WORKER",
      staff: { active: true },
    },
    select: { id: true },
  });

  await prisma.$transaction([
    prisma.termsVersion.updateMany({
      where: { tenantId: session.tenantId, status: "PUBLISHED" },
      data: { status: "SUPERSEDED" },
    }),
    prisma.termsVersion.update({
      where: { id },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
        publishedById: session.id,
        publishedByName: session.name,
      },
    }),
  ]);

  // The pop-up is what actually collects the agreement; the notification is
  // what makes them open the app. A failed push must never undo the publish.
  await Promise.all(
    workers.map((w) =>
      notifyUser(w.id, {
        tenantId: session.tenantId,
        type: "ANNOUNCEMENT",
        title:
          row.version === 1
            ? "Terms and conditions to agree"
            : `Updated terms and conditions (version ${row.version})`,
        body: "Open the app and read them. You need to agree before your next shift.",
        url: "/my-shifts",
      }).catch(() => {}),
    ),
  );

  revalidatePath("/terms");
  revalidatePath(`/terms/${id}`);
  revalidatePath("/my-shifts");
  return { ok: true, sentTo: workers.length };
}

/** Throw away a draft that was never published. */
export async function deleteDraft(formData: FormData) {
  const session = await requireAdmin();
  if (!session) return { error: "You don't have permission to do that." };

  const id = String(formData.get("id") ?? "");
  const row = await prisma.termsVersion.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!row) return { error: "That version no longer exists." };
  if (row.status !== "DRAFT") return { error: "Published terms can't be deleted." };

  await prisma.termsVersion.delete({ where: { id } });
  revalidatePath("/terms");
  redirect("/terms");
}
