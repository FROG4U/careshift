import Link from "next/link";
import { logoutAction } from "@/app/(app)/actions";

export function WorkerNav({
  active,
  name,
}: {
  active: "shifts" | "hours";
  name: string;
}) {
  const tab = (key: "shifts" | "hours", href: string, label: string) => (
    <Link
      href={href}
      className={`flex-1 rounded-lg py-2 text-center text-sm font-semibold transition ${
        active === key
          ? "bg-white text-[var(--brand)] shadow-sm"
          : "text-slate-500"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="mx-auto max-w-md px-4 pt-4">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-sm text-slate-500">Hi {name.split(" ")[0]} 👋</p>
        <div className="flex items-center gap-3">
          <Link
            href="/install"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--brand)] hover:underline"
          >
            <span className="material-symbols-rounded text-[16px]">install_mobile</span>
            Get the app
          </Link>
          <form action={logoutAction}>
            <button className="text-xs font-medium text-slate-400 hover:text-slate-600">
              Sign out
            </button>
          </form>
        </div>
      </div>
      <div className="flex gap-1 rounded-xl bg-slate-200/70 p-1">
        {tab("shifts", "/my-shifts", "Shifts")}
        {tab("hours", "/my-shifts/summary", "My hours")}
      </div>
    </div>
  );
}
