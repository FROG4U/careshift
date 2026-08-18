/**
 * Verifies that SCHADS penalty bands are decided by the BRANCH's local time,
 * not the server's. Run with the server clock deliberately set to somewhere
 * wrong (e.g. TZ=Europe/London) — every expectation below must still pass.
 *
 *   npx tsx scripts/tz-check.ts
 *   TZ=Europe/London npx tsx scripts/tz-check.ts
 *   TZ=America/New_York npx tsx scripts/tz-check.ts
 */
import { dayTypeFor } from "../src/lib/payroll";
import { tzForState } from "../src/lib/timezone";

type Case = {
  what: string;
  startUtc: string;
  endUtc: string;
  state: string;
  expect: string;
  holidays?: Set<string>;
};

const cases: Case[] = [
  // 2026-08-19 is a Wednesday.
  {
    what: "Perth 09:00–17:00 Wed → ordinary weekday day",
    startUtc: "2026-08-19T01:00:00Z", // 09:00 AWST (+8)
    endUtc: "2026-08-19T09:00:00Z",
    state: "WA",
    expect: "WEEKDAY_DAY",
  },
  {
    what: "Perth 05:30 start Wed → active night (before 6am local)",
    startUtc: "2026-08-18T21:30:00Z", // 05:30 AWST
    endUtc: "2026-08-19T05:30:00Z", // 13:30 AWST
    state: "WA",
    expect: "WEEKDAY_NIGHT",
  },
  {
    what: "SAME instant as above, but a Brisbane branch → 07:30 = day shift",
    startUtc: "2026-08-18T21:30:00Z", // 07:30 AEST (+10)
    endUtc: "2026-08-19T05:30:00Z",
    state: "QLD",
    expect: "WEEKDAY_DAY",
  },
  {
    what: "Perth Fri 23:00 → weekday night (still Friday in WA)",
    startUtc: "2026-08-21T15:00:00Z", // Fri 23:00 AWST
    endUtc: "2026-08-21T19:00:00Z", // Sat 03:00 AWST
    state: "WA",
    expect: "WEEKDAY_NIGHT",
  },
  {
    what: "SAME instant, Sydney branch → already Saturday 01:00 = SATURDAY",
    startUtc: "2026-08-21T15:00:00Z", // Sat 01:00 AEST
    endUtc: "2026-08-21T19:00:00Z",
    state: "NSW",
    expect: "SATURDAY",
  },
  {
    what: "Brisbane Sun 10:00 → Sunday",
    startUtc: "2026-08-23T00:00:00Z", // Sun 10:00 AEST
    endUtc: "2026-08-23T06:00:00Z",
    state: "QLD",
    expect: "SUNDAY",
  },
  {
    what: "Brisbane 20:30 start → evening band",
    startUtc: "2026-08-19T10:30:00Z", // 20:30 AEST
    endUtc: "2026-08-19T13:30:00Z", // 23:30 AEST
    state: "QLD",
    expect: "WEEKDAY_EVENING",
  },
  {
    what: "Public holiday outranks everything (matched on local date)",
    startUtc: "2026-08-19T01:00:00Z",
    endUtc: "2026-08-19T09:00:00Z",
    state: "QLD",
    expect: "PUBLIC_HOLIDAY",
    holidays: new Set(["2026-08-19"]),
  },
];

let failed = 0;
console.log(`server TZ = ${Intl.DateTimeFormat().resolvedOptions().timeZone}\n`);

for (const c of cases) {
  const tz = tzForState(c.state);
  const got = dayTypeFor(
    new Date(c.startUtc),
    new Date(c.endUtc),
    c.holidays,
    tz,
  );
  const ok = got === c.expect;
  if (!ok) failed++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  [${c.state} ${tz}]  ${c.what}\n        expected ${c.expect}, got ${got}`,
  );
}

console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
