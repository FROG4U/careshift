"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * A worker agreeing to the current terms.
 *
 * Deliberately strict about what is stored: the version they agreed to, the
 * name they typed, their signature, and the moment. That is the whole point of
 * the pop-up - without those four things an "I agree" tick proves nothing.
 */
export async function acceptTerms(formData: FormData) {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };

  const termsId = String(formData.get("termsId") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim();
  const signature = String(formData.get("signature") ?? "").trim();
  const signatureType =
    String(formData.get("signatureType") ?? "TYPED") === "DRAWN"
      ? "DRAWN"
      : "TYPED";

  if (fullName.length < 3) return { error: "Type your full name." };
  if (!signature) return { error: "Add your signature." };
  if (signatureType === "DRAWN" && !signature.startsWith("data:image/")) {
    return { error: "That signature didn't save. Try again." };
  }

  // Only the version that is live right now can be agreed to, and only for
  // this tenant - a stale tab must not sign an old version.
  const version = await prisma.termsVersion.findFirst({
    where: { id: termsId, tenantId: session.tenantId, status: "PUBLISHED" },
    select: { id: true },
  });
  if (!version) {
    return { error: "These terms have been updated. Refresh and read them again." };
  }

  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0].trim() ||
    h.get("x-real-ip") ||
    null;

  await prisma.termsAcceptance.upsert({
    where: { termsId_userId: { termsId: version.id, userId: session.id } },
    // Already agreed (a double tap, or two tabs): keep the first record.
    update: {},
    create: {
      tenantId: session.tenantId,
      termsId: version.id,
      userId: session.id,
      staffId: session.staffId,
      fullName,
      signatureType,
      signature,
      ip,
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    },
  });

  revalidatePath("/my-shifts");
  revalidatePath("/my-shifts/terms");
  return { ok: true };
}
