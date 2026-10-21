"use client";

import { useTransition } from "react";
import { issueQrCard } from "./actions";

/**
 * Issue or replace a participant's clock-in card.
 *
 * Replacing stops the old card working, so it asks first - the office would
 * otherwise find out by a worker standing in a hallway unable to clock on.
 */
export function QrCardActions({
  clientId,
  hasCard,
  participantName,
}: {
  clientId: string;
  hasCard: boolean;
  participantName: string;
}) {
  const [pending, startTx] = useTransition();

  const run = () => {
    if (
      hasCard &&
      !confirm(
        `Replace ${participantName}'s card?\n\nThe card currently at their home will stop working straight away, so print the new one and take it out there.`,
      )
    ) {
      return;
    }
    const fd = new FormData();
    fd.set("clientId", clientId);
    startTx(async () => {
      await issueQrCard(fd);
    });
  };

  return (
    <button
      onClick={run}
      disabled={pending}
      className={`rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-60 ${
        hasCard
          ? "border border-[var(--border)] bg-white text-[var(--text-primary)]"
          : "bg-[var(--brand)] text-white shadow-sm"
      }`}
    >
      {pending
        ? "Working..."
        : hasCard
          ? "Replace this card"
          : "Create the clock-in card"}
    </button>
  );
}
