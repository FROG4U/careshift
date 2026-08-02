import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");
  // Workers go to the mobile clock-in view; office staff to the dashboard.
  redirect(session.role === "WORKER" ? "/my-shifts" : "/dashboard");
}
