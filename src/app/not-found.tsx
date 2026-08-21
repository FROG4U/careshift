import Link from "next/link";

/**
 * Shown for any page that genuinely doesn't exist.
 *
 * The default Next.js 404 is a bare dead end with no way back, which is how
 * a small routing slip turns into "the app is broken". This at least tells
 * someone what happened and gets them home in one tap.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background,#faf8f5)] p-6">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
          <span className="material-symbols-rounded text-[24px] text-slate-500">
            help
          </span>
        </div>
        <h1 className="text-lg font-bold text-slate-900">
          We couldn&apos;t find that page
        </h1>
        <p className="mt-1.5 text-sm text-slate-500">
          It may have been removed, or the link was out of date.
        </p>
        <Link
          href="/"
          className="mt-5 block w-full rounded-xl bg-[var(--brand,#003146)] px-4 py-3 text-sm font-bold text-white"
        >
          Back to the app
        </Link>
      </div>
    </div>
  );
}
