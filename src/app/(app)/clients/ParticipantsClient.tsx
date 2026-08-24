"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { fmtDate, fmtMoney, initials } from "@/lib/format";
import {
  AGREEMENT_TYPES,
  AGREEMENT_LABELS,
  AGREEMENT_BADGE,
  type AgreementType,
} from "@/lib/constants";
import { createClient, updateClient, setClientArchived } from "./actions";

export type ParticipantRow = {
  id: string;
  firstName: string;
  lastName: string;
  active: boolean;
  agreementType: string;
  ndisNumber: string;
  budget: number | null;
  weeklyHours: number | null;
  chargeWeekdayDay: number | null;
  chargeWeekdayEvening: number | null;
  chargeWeekdayNight: number | null;
  chargeSaturday: number | null;
  chargeSunday: number | null;
  chargePublicHoliday: number | null;
  chargeMileageRate: number | null;
  planStart: string;
  planEnd: string;
  address: string;
  phone: string;
  email: string;
  lat: number | null;
  lng: number | null;
  geofenceFt: number;
  branchId: string;
  branchName: string;
};

export type BranchOption = { id: string; name: string };

const field =
  "mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100";

const EMPTY: ParticipantRow = {
  id: "",
  firstName: "",
  lastName: "",
  agreementType: "NDIS",
  ndisNumber: "",
  budget: null,
  weeklyHours: null,
  chargeWeekdayDay: null,
  chargeWeekdayEvening: null,
  chargeWeekdayNight: null,
  chargeSaturday: null,
  chargeSunday: null,
  chargePublicHoliday: null,
  chargeMileageRate: null,
  planStart: "",
  planEnd: "",
  address: "",
  phone: "",
  email: "",
  lat: null,
  lng: null,
  geofenceFt: 150,
  branchId: "",
  branchName: "",
  active: true,
};

type Suggestion = { display_name: string; lat: string; lon: string };

/** Address (with free OpenStreetMap autocomplete) + clock-in geofence.
 *  Picking a suggestion fills the address AND the map coordinates, which set
 *  the clock-in geofence. Workers can only clock in/out within `radius` feet. */
function LocationFields({
  address,
  lat,
  lng,
  geofenceFt,
}: {
  address: string;
  lat: number | null;
  lng: number | null;
  geofenceFt: number;
}) {
  const [addr, setAddr] = useState(address);
  const [coords, setCoords] = useState<{ lat: string; lng: string }>({
    lat: lat != null ? String(lat) : "",
    lng: lng != null ? String(lng) : "",
  });
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [openList, setOpenList] = useState(false);
  const [searching, setSearching] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const skipNext = useRef(false); // don't re-search right after picking

  // Debounced OpenStreetMap (Nominatim) lookup, biased to Australia.
  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const q = addr.trim();
    if (q.length < 4) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&countrycodes=au&q=${encodeURIComponent(q)}`,
          { headers: { "Accept-Language": "en" } },
        );
        const data = (await res.json()) as Suggestion[];
        setSuggestions(data);
        setOpenList(true);
      } catch {
        setSuggestions([]);
      }
      setSearching(false);
    }, 500);
    return () => clearTimeout(t);
  }, [addr]);

  function pick(s: Suggestion) {
    skipNext.current = true;
    setAddr(s.display_name);
    setCoords({
      lat: Number(s.lat).toFixed(6),
      lng: Number(s.lon).toFixed(6),
    });
    setSuggestions([]);
    setOpenList(false);
  }

  function capture() {
    setErr(null);
    if (!("geolocation" in navigator)) {
      setErr("Geolocation not available on this device.");
      return;
    }
    setCapturing(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude.toFixed(6),
          lng: pos.coords.longitude.toFixed(6),
        });
        setCapturing(false);
      },
      () => {
        setErr("Couldn't get location. Allow access, or search the address.");
        setCapturing(false);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
        <span className="material-symbols-rounded text-[18px] text-[var(--brand)]">
          my_location
        </span>
        Address &amp; clock-in geofence
      </div>

      {/* Address with autocomplete */}
      <label className="relative block text-sm font-medium text-[var(--text-primary)]">
        Address
        <input
          name="address"
          autoComplete="off"
          value={addr}
          onChange={(e) => {
            setAddr(e.target.value);
            setErr(null);
          }}
          onFocus={() => suggestions.length && setOpenList(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && openList && suggestions.length > 0) {
              e.preventDefault();
              pick(suggestions[0]);
            }
          }}
          placeholder="Start typing an address…"
          className={field}
        />
        {searching && (
          <span className="absolute right-3 top-9 text-xs text-[var(--text-muted)]">
            …
          </span>
        )}
        {openList && suggestions.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-[var(--border)] bg-white shadow-lg">
            {suggestions.map((s, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => pick(s)}
                  className="block w-full px-3 py-2 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--background)]"
                >
                  {s.display_name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </label>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Pick a suggestion to set the clock-in location from the address. The
        address always wins — if a saved position turns out to be far from it,
        we correct it back to the address on save.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="text-sm font-medium text-[var(--text-primary)]">
          Clock-in radius (feet)
          <input
            name="geofenceFt"
            type="number"
            min="50"
            step="10"
            defaultValue={geofenceFt}
            className={field}
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => {
              // This saves the position of THIS device. Scheduling staff work
              // from all over, so make the consequence explicit before it
              // silently puts a participant's geofence on another continent.
              if (
                !confirm(
                  "This saves where YOU are right now as the participant's clock-in point.\n\nOnly use it if you're standing at their home. Otherwise close this and pick their address from the suggestions above.",
                )
              )
                return;
              capture();
            }}
            disabled={capturing}
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--background)] disabled:opacity-60"
          >
            {capturing ? "Locating…" : "📍 I'm at their home — use my location"}
          </button>
        </div>
      </div>

      {/* Coordinates (auto-filled; editable as a fallback) */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="text-sm font-medium text-[var(--text-primary)]">
          Latitude
          <input
            name="lat"
            value={coords.lat}
            onChange={(e) => setCoords((c) => ({ ...c, lat: e.target.value }))}
            className={field}
            placeholder="-31.9523"
          />
        </label>
        <label className="text-sm font-medium text-[var(--text-primary)]">
          Longitude
          <input
            name="lng"
            value={coords.lng}
            onChange={(e) => setCoords((c) => ({ ...c, lng: e.target.value }))}
            className={field}
            placeholder="115.8613"
          />
        </label>
      </div>
      {!coords.lat && (
        <p className="mt-2 text-xs text-amber-600">
          No location set — clock-in won&apos;t be geofenced for this participant.
        </p>
      )}
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
    </div>
  );
}

export function ParticipantsClient({
  rows,
  branches,
}: {
  rows: ParticipantRow[];
  branches: BranchOption[];
}) {
  // null = closed; otherwise the participant being edited (EMPTY = new).
  const [editing, setEditing] = useState<ParticipantRow | null>(null);
  const [status, setStatus] = useState<"ACTIVE" | "ARCHIVED">("ACTIVE");
  const [filter, setFilter] = useState<"ALL" | AgreementType>("ALL");
  const [query, setQuery] = useState("");

  // Close the dialog on Escape. We deliberately do NOT close on background
  // click — native date/time pickers can emit stray clicks on the backdrop
  // that would otherwise close the dialog mid-edit.
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditing(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);

  const isNew = editing?.id === "";

  const activeCount = rows.filter((r) => r.active).length;
  const archivedCount = rows.length - activeCount;
  const base = rows.filter((r) => (status === "ACTIVE" ? r.active : !r.active));

  const counts = {
    ALL: base.length,
    NDIS: base.filter((r) => r.agreementType === "NDIS").length,
    AGED_CARE: base.filter((r) => r.agreementType === "AGED_CARE").length,
    DVA: base.filter((r) => r.agreementType === "DVA").length,
  };
  const byAgreement =
    filter === "ALL" ? base : base.filter((r) => r.agreementType === filter);

  // Search across name, NDIS number, address and phone — whatever the office
  // happens to have to hand when they're looking someone up.
  const q = query.trim().toLowerCase();
  const visible = q
    ? byAgreement.filter((r) =>
        [
          `${r.firstName} ${r.lastName}`,
          r.ndisNumber ?? "",
          r.address ?? "",
          r.phone ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
    : byAgreement;

  const tabs: ("ALL" | AgreementType)[] = ["ALL", ...AGREEMENT_TYPES];

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Participants
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Clients receiving support, grouped by funding agreement.
          </p>
        </div>
        <button
          onClick={() => setEditing(EMPTY)}
          className="rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
        >
          + Add participant
        </button>
      </header>

      {/* Search */}
      <div className="mb-4 relative max-w-md">
        <span className="material-symbols-rounded pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-[var(--text-muted)]">
          search
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, NDIS number, address or phone…"
          className="w-full rounded-xl border border-[var(--border)] bg-white py-2.5 pl-10 pr-9 text-sm outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--background)]"
          >
            <span className="material-symbols-rounded text-[18px]">close</span>
          </button>
        )}
      </div>

      {/* Active / Archived tabs */}
      <div className="mb-4 inline-flex rounded-xl border border-[var(--border)] bg-white p-1">
        {(
          [
            ["ACTIVE", "Active", activeCount],
            ["ARCHIVED", "Archived", archivedCount],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setStatus(key)}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
              status === key
                ? "bg-[var(--brand)] text-white shadow-sm"
                : "text-[var(--text-secondary)] hover:bg-[var(--background)]"
            }`}
          >
            {label}{" "}
            <span className={status === key ? "opacity-80" : "text-[var(--text-muted)]"}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Agreement filter tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => {
          const active = filter === t;
          const label = t === "ALL" ? "All" : AGREEMENT_LABELS[t];
          return (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                active
                  ? "bg-[var(--brand)] text-white shadow-sm"
                  : "bg-white border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--background)]"
              }`}
            >
              {label}{" "}
              <span className={active ? "opacity-80" : "text-[var(--text-muted)]"}>
                {counts[t]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--background)] text-left text-xs uppercase tracking-wide text-[var(--text-secondary)]">
            <tr>
              <th className="px-5 py-3 font-medium">Participant</th>
              <th className="px-5 py-3 font-medium">Agreement</th>
              <th className="px-5 py-3 font-medium">Weekly hours</th>
              <th className="px-5 py-3 font-medium">Plan ends</th>
              <th className="px-5 py-3 font-medium">Budget</th>
              <th className="px-5 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {visible.map((c) => {
              const at = c.agreementType as AgreementType;
              return (
                <tr key={c.id} className="hover:bg-[var(--background)]">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">
                        {initials(c.firstName, c.lastName)}
                      </span>
                      <div>
                        <Link
                          href={`/clients/${c.id}`}
                          className="font-medium text-[var(--text-primary)] hover:text-[var(--brand)] hover:underline"
                        >
                          {c.firstName} {c.lastName}
                        </Link>
                        {c.ndisNumber && (
                          <div className="text-xs text-[var(--text-muted)]">
                            {c.ndisNumber}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        AGREEMENT_BADGE[at] ?? "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {AGREEMENT_LABELS[at] ?? c.agreementType}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {c.weeklyHours != null ? (
                      <span className="rounded-full bg-[var(--pastel-green)] px-2.5 py-0.5 text-xs font-semibold text-green-700">
                        {c.weeklyHours}h / week
                      </span>
                    ) : (
                      <span className="text-xs text-amber-600">Not set</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-[var(--text-secondary)]">
                    {fmtDate(c.planEnd || null)}
                  </td>
                  <td className="px-5 py-3 text-[var(--text-secondary)]">
                    {fmtMoney(c.budget)}
                  </td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    <Link
                      href={`/clients/${c.id}/plan`}
                      className="inline-flex items-center gap-1 rounded-lg bg-[var(--background)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--border)]"
                      title="Weekly schedule"
                    >
                      <span className="material-symbols-rounded text-[16px]">calendar_month</span>
                      Plan
                    </Link>
                    <Link
                      href={`/clients/${c.id}/care-plan`}
                      className="ml-2 inline-flex items-center gap-1 rounded-lg bg-[var(--background)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--border)]"
                      title="Care plan"
                    >
                      <span className="material-symbols-rounded text-[16px]">favorite</span>
                      Care
                    </Link>
                    <Link
                      href={`/clients/${c.id}/team`}
                      className="ml-2 inline-flex items-center gap-1 rounded-lg bg-[var(--background)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--border)]"
                      title="Allocated support workers"
                    >
                      <span className="material-symbols-rounded text-[16px]">group</span>
                      Team
                    </Link>
                    {c.phone && (
                      <a
                        href={`tel:${c.phone}`}
                        className="ml-2 align-middle text-[var(--text-muted)] hover:text-[var(--brand)]"
                        title={`Call ${c.firstName}`}
                        aria-label={`Call ${c.firstName}`}
                      >
                        <span className="material-symbols-rounded text-[18px] align-middle">
                          call
                        </span>
                      </a>
                    )}
                    <button
                      onClick={() => setEditing(c)}
                      className="ml-2 text-[var(--text-muted)] hover:text-[var(--brand)]"
                      title="Edit participant"
                    >
                      <span className="material-symbols-rounded text-[18px] align-middle">edit</span>
                    </button>
                    <form action={setClientArchived} className="ml-2 inline-block align-middle">
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="archive" value={c.active ? "true" : "false"} />
                      <button
                        className="text-[var(--text-muted)] hover:text-amber-600"
                        title={c.active ? "Archive participant" : "Restore participant"}
                      >
                        <span className="material-symbols-rounded text-[18px] align-middle">
                          {c.active ? "archive" : "unarchive"}
                        </span>
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-[var(--text-muted)]">
                  No participants in this group yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add / edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4">
          <div className="mt-12 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                {isNew ? "New participant" : "Edit participant"}
              </h2>
              <button
                onClick={() => setEditing(null)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                ✕
              </button>
            </div>

            {!isNew && (
              <Link
                href={`/clients/${editing.id}/plan`}
                className="mb-4 flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 transition hover:border-[var(--brand)] hover:bg-blue-50"
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--pastel-blue)]">
                    <span className="material-symbols-rounded text-[20px] text-blue-600">
                      calendar_month
                    </span>
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-[var(--text-primary)]">
                      Weekly plan
                    </span>
                    <span className="block text-xs text-[var(--text-secondary)]">
                      Set Mon–Sun visits, rates &amp; mileage
                    </span>
                  </span>
                </span>
                <span className="material-symbols-rounded text-[20px] text-[var(--text-muted)]">
                  arrow_forward
                </span>
              </Link>
            )}

            {!isNew && (
              <Link
                href={`/clients/${editing.id}/care-plan`}
                className="mb-4 flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 transition hover:border-[var(--brand)] hover:bg-blue-50"
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--pastel-blue)]">
                    <span className="material-symbols-rounded text-[20px] text-blue-600">
                      favorite
                    </span>
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-[var(--text-primary)]">
                      Care plan
                    </span>
                    <span className="block text-xs text-[var(--text-secondary)]">
                      Goals, support needs, health &amp; emergency contact
                    </span>
                  </span>
                </span>
                <span className="material-symbols-rounded text-[20px] text-[var(--text-muted)]">
                  arrow_forward
                </span>
              </Link>
            )}

            <form
              action={async (fd) => {
                if (isNew) await createClient(fd);
                else await updateClient(fd);
                setEditing(null);
              }}
              onKeyDown={(e) => {
                // Prevent Enter in a text/date/select field from submitting the
                // whole form (which would close the dialog mid-fill). Textareas
                // keep their newline behaviour; the Save button still works.
                const el = e.target as HTMLElement;
                if (
                  e.key === "Enter" &&
                  el.tagName !== "TEXTAREA" &&
                  el.tagName !== "BUTTON"
                ) {
                  e.preventDefault();
                }
              }}
              className="space-y-3"
            >
              {!isNew && <input type="hidden" name="id" value={editing.id} />}

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-medium text-[var(--text-primary)]">
                  First name
                  <input
                    name="firstName"
                    required
                    defaultValue={editing.firstName}
                    className={field}
                  />
                </label>
                <label className="text-sm font-medium text-[var(--text-primary)]">
                  Last name
                  <input
                    name="lastName"
                    required
                    defaultValue={editing.lastName}
                    className={field}
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-medium text-[var(--text-primary)]">
                  Agreement type
                  <select
                    name="agreementType"
                    defaultValue={editing.agreementType}
                    className={field}
                  >
                    {AGREEMENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {AGREEMENT_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium text-[var(--text-primary)]">
                  NDIS / member number
                  <input
                    name="ndisNumber"
                    defaultValue={editing.ndisNumber}
                    className={field}
                    placeholder="430000000"
                  />
                </label>
              </div>

              <label className="block text-sm font-medium text-[var(--text-primary)]">
                Branch / location
                <select
                  name="branchId"
                  defaultValue={editing.branchId}
                  className={field}
                >
                  <option value="">Unassigned</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-medium text-[var(--text-primary)]">
                  Plan start
                  <input
                    name="planStart"
                    type="date"
                    defaultValue={editing.planStart}
                    className={field}
                  />
                </label>
                <label className="text-sm font-medium text-[var(--text-primary)]">
                  Plan end
                  <input
                    name="planEnd"
                    type="date"
                    defaultValue={editing.planEnd}
                    className={field}
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-medium text-[var(--text-primary)]">
                  Plan budget (AUD)
                  <input
                    name="budget"
                    type="number"
                    step="any"
                    defaultValue={editing.budget ?? ""}
                    className={field}
                    placeholder="48000"
                  />
                </label>
                <label className="text-sm font-medium text-[var(--text-primary)]">
                  Agreed weekly hours
                  <input
                    name="weeklyHours"
                    type="number"
                    step="0.5"
                    min="0"
                    defaultValue={editing.weeklyHours ?? ""}
                    className={field}
                    placeholder="20"
                  />
                </label>
              </div>

              {/* ── Charge rates ── */}
              <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
                <div className="text-sm font-semibold text-[var(--text-primary)]">
                  Charge rates for this participant
                </div>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                  Leave blank to use the{" "}
                  {AGREEMENT_LABELS[editing.agreementType as AgreementType] ??
                    editing.agreementType}{" "}
                  rates from Settings. Fill a box in only to charge this
                  participant differently.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {(
                    [
                      ["chargeWeekdayDay", "Weekday day", editing.chargeWeekdayDay],
                      ["chargeWeekdayEvening", "Weekday evening", editing.chargeWeekdayEvening],
                      ["chargeWeekdayNight", "Weekday night", editing.chargeWeekdayNight],
                      ["chargeSaturday", "Saturday", editing.chargeSaturday],
                      ["chargeSunday", "Sunday", editing.chargeSunday],
                      ["chargePublicHoliday", "Public holiday", editing.chargePublicHoliday],
                    ] as const
                  ).map(([name, labelText, value]) => (
                    <label
                      key={name}
                      className="block text-xs font-medium text-[var(--text-secondary)]"
                    >
                      {labelText}
                      <div className="relative mt-1">
                        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-[var(--text-muted)]">
                          $
                        </span>
                        <input
                          name={name}
                          type="number"
                          step="0.01"
                          min="0"
                          defaultValue={value ?? ""}
                          placeholder="default"
                          className={`${field} pl-6`}
                        />
                      </div>
                    </label>
                  ))}
                  <label className="block text-xs font-medium text-[var(--text-secondary)]">
                    Mileage /km
                    <div className="relative mt-1">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-[var(--text-muted)]">
                        $
                      </span>
                      <input
                        name="chargeMileageRate"
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={editing.chargeMileageRate ?? ""}
                        placeholder="default"
                        className={`${field} pl-6`}
                      />
                    </div>
                  </label>
                </div>
              </div>
              <p className="-mt-1 text-xs text-[var(--text-muted)]">
                Weekly hours come from the service agreement. The roster will not
                exceed this without manager authorisation.
              </p>

              <LocationFields
                address={editing.address}
                lat={editing.lat}
                lng={editing.lng}
                geofenceFt={editing.geofenceFt}
              />

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-medium text-[var(--text-primary)]">
                  Phone
                  <input
                    name="phone"
                    defaultValue={editing.phone}
                    className={field}
                  />
                </label>
                <label className="text-sm font-medium text-[var(--text-primary)]">
                  Email
                  <input
                    name="email"
                    type="email"
                    defaultValue={editing.email}
                    className={field}
                  />
                </label>
              </div>

              <button className="mt-2 w-full rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90">
                {isNew ? "Save participant" : "Save changes"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
