import Link from "next/link";
import { InstallApp } from "@/components/InstallApp";

export const metadata = {
  title: "Install PCG Care",
};

export default function InstallPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-[var(--brand)] text-2xl font-bold text-white shadow-lg">
            P
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Add PCG Care to your phone
          </h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Install it to your home screen so it opens full-screen, just like an
            app from the App Store or Play Store — no download needed.
          </p>
        </div>

        <InstallApp />

        <div className="mt-8 text-center">
          <Link
            href="/my-shifts"
            className="text-sm font-semibold text-[var(--brand)] hover:underline"
          >
            ← Back to my shifts
          </Link>
        </div>
      </div>
    </div>
  );
}
