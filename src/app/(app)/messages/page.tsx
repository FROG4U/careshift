export default function MessagesIndex() {
  return (
    <div className="hidden flex-1 flex-col items-center justify-center text-center md:flex">
      <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-3xl bg-[var(--pastel-blue)]">
        <span className="material-symbols-rounded text-[32px] text-blue-500">forum</span>
      </div>
      <p className="font-medium text-[var(--text-primary)]">Your messages</p>
      <p className="mt-1 max-w-xs text-sm text-[var(--text-secondary)]">
        Pick a conversation on the left, or start a new one with the pencil.
      </p>
    </div>
  );
}
