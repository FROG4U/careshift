"use server";

import { redirect } from "next/navigation";
import { authenticate, createSession } from "@/lib/auth";

export async function loginAction(
  _prev: { error?: string } | undefined,
  formData: FormData,
) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const session = await authenticate(email, password);
  if (!session) {
    return { error: "Invalid email or password." };
  }
  if (session.status === "REJECTED") {
    return { error: "Your account request was declined. Please contact your manager." };
  }
  await createSession(session);
  if (session.status === "PENDING") {
    redirect("/pending");
  }
  redirect(session.role === "WORKER" ? "/my-shifts" : "/dashboard");
}
