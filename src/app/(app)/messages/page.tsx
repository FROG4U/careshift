export default async function MessagesIndex({
  searchParams,
}: {
  searchParams: Promise<{ missing?: string }>;
}) {
  const { missing } = await searchParams;

  return (
    <div className="hidden flex-1 flex-col items-center justify-center text-center md:flex">
      {missing && (
        <div className="mb-4 max-w-sm rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          That conversation isn&apos;t available — it may have been deleted, or
          you&apos;re not one of its members.
        </div>
      )}
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
