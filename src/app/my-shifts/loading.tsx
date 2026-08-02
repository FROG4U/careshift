// Instant loading feedback for the worker app while a page renders.
export default function Loading() {
  return (
    <div className="loading-delayed flex h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[var(--border)] border-t-[var(--brand)]" />
    </div>
  );
}
