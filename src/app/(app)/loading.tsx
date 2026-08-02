// Shown instantly while a page loads (data comes from Sydney, so there's a
// beat) — gives immediate feedback on navigation instead of a frozen screen.
export default function Loading() {
  return (
    <div className="loading-delayed flex h-[70vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[var(--border)] border-t-[var(--brand)]" />
    </div>
  );
}
