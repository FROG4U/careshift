"use client";

import { useState } from "react";
import {
  AGREEMENT_TYPES,
  AGREEMENT_LABELS,
  type AgreementType,
} from "@/lib/constants";
import { updateChargeDefaults, updateSuperRate } from "./actions";

export type ChargeDefaultRow = {
  agreementType: string;
  weekdayDay: number;
  weekdayEvening: number;
  weekdayNight: number;
  saturday: number;
  sunday: number;
  publicHoliday: number;
  mileageRate: number;
};

const BANDS = [
  ["weekdayDay", "Weekday day", "6am – 8pm"],
  ["weekdayEvening", "Weekday evening", "8pm – midnight"],
  ["weekdayNight", "Weekday night", "past midnight / before 6am"],
  ["saturday", "Saturday", "all day"],
  ["sunday", "Sunday", "all day"],
  ["publicHoliday", "Public holiday", "all day"],
] as const;

const field =
  "w-full rounded-lg border border-[var(--border)] bg-white py-2 pl-6 pr-2 text-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15";

function RateInput({
  name,
  value,
  suffix,
}: {
  name: string;
  value: number;
  suffix?: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-[var(--text-muted)]">
        $
      </span>
      <input
        name={name}
        type="number"
        step="0.01"
        min="0"
        defaultValue={value || ""}
        placeholder="0.00"
        className={field}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-[var(--text-muted)]">
          {suffix}
        </span>
      )}
    </div>
  );
}

/**
 * What the provider CHARGES, per funding agreement. Separate from pay levels
 * (what the worker earns) — the gap between the two is the margin shown on
 * the Sales screens.
 */
export function ChargeRatesManager({
  defaults,
  superPct,
}: {
  defaults: ChargeDefaultRow[];
  superPct: number;
}) {
  const [tab, setTab] = useState<AgreementType>("NDIS");
  const current =
    defaults.find((d) => d.agreementType === tab) ??
    ({
      agreementType: tab,
      weekdayDay: 0,
      weekdayEvening: 0,
      weekdayNight: 0,
      saturday: 0,
      sunday: 0,
      publicHoliday: 0,
      mileageRate: 0,
    } as ChargeDefaultRow);

  const isSet = defaults.some(
    (d) => d.agreementType === tab && d.weekdayDay > 0,
  );

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm">
      <h2 className="mb-1 font-semibold text-[var(--text-primary)]">
        Charge rates
      </h2>
      <p className="mb-4 text-sm text-[var(--text-secondary)]">
        What you bill per hour, by funding agreement. These fill in
        automatically for every participant on that agreement — you can still
        override any of them on an individual participant.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        {AGREEMENT_TYPES.map((t) => {
          const configured = defaults.some(
            (d) => d.agreementType === t && d.weekdayDay > 0,
          );
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                tab === t
                  ? "bg-[var(--brand)] text-white"
                  : "bg-[var(--background)] text-[var(--text-secondary)]"
              }`}
            >
              {AGREEMENT_LABELS[t]}
              {!configured && (
                <span className="ml-1.5 text-xs opacity-70">not set</span>
              )}
            </button>
          );
        })}
      </div>

      {/* key forces the inputs to reset when switching agreement tabs */}
      <form key={tab} action={updateChargeDefaults} className="space-y-3">
        <input type="hidden" name="agreementType" value={tab} />

        <div className="grid gap-3 sm:grid-cols-2">
          {BANDS.map(([name, label, hint]) => (
            <label key={name} className="block">
              <span className="text-sm font-medium text-[var(--text-primary)]">
                {label}
              </span>
              <span className="ml-1 text-xs text-[var(--text-muted)]">
                {hint}
              </span>
              <div className="mt-1">
                <RateInput
                  name={name}
                  value={current[name as keyof ChargeDefaultRow] as number}
                  suffix="/hr"
                />
              </div>
            </label>
          ))}
        </div>

        <label className="block max-w-[15rem]">
          <span className="text-sm font-medium text-[var(--text-primary)]">
            Mileage charged
          </span>
          <div className="mt-1">
            <RateInput name="mileageRate" value={current.mileageRate} suffix="/km" />
          </div>
        </label>

        <div className="flex items-center gap-3 pt-1">
          <button className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white">
            Save {AGREEMENT_LABELS[tab]} rates
          </button>
          {!isSet && (
            <span className="text-xs text-amber-600">
              No rates set — shifts for these participants will show $0 income.
            </span>
          )}
        </div>
      </form>

      {/* Super — a real cost, so it belongs in the profit maths */}
      <form
        action={updateSuperRate}
        className="mt-6 flex flex-wrap items-end gap-3 border-t border-[var(--border)] pt-5"
      >
        <label className="block">
          <span className="text-sm font-medium text-[var(--text-primary)]">
            Superannuation
          </span>
          <p className="mb-1 text-xs text-[var(--text-secondary)]">
            Added to wages when working out profit. 12% from 1 July 2025.
          </p>
          <div className="relative w-28">
            <input
              name="superPct"
              type="number"
              step="1"
              min="0"
              max="50"
              defaultValue={Math.round(superPct * 100)}
              className="w-full rounded-lg border border-[var(--border)] bg-white py-2 pl-3 pr-7 text-sm outline-none focus:border-[var(--brand)]"
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-[var(--text-muted)]">
              %
            </span>
          </div>
        </label>
        <button className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)]">
          Save
        </button>
      </form>
    </div>
  );
}
