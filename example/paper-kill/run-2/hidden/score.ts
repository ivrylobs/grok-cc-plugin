/**
 * HIDDEN acceptance suite for Problem P2 (ZonedRecurrence). DO NOT show to any arm.
 *
 * Usage: copy this single file into the root of an arm's delivered tree, then:
 *   bun score.ts
 * It imports ./src/recur and prints a per-check table + JSON total (0-100).
 *
 * expandBetween is synchronous, so every check runs in its own subprocess with a hard
 * 3s kill — a sync hang, crash, or process.exit scores 0 for that check only.
 */
import { spawnSync } from "node:child_process";

type Check = { id: string; points: number; name: string; fn: () => void };
const checks: Check[] = [];
function check(id: string, points: number, name: string, fn: () => void) {
  checks.push({ id, points, name, fn });
}

// ---------- assertion helpers ----------
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error("ASSERT: " + msg);
}
function eq(a: unknown, b: unknown, msg: string) {
  assert(
    Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b),
    `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`,
  );
}
type Wall = { year: number; month: number; day: number; hour: number; minute: number };
function wallEq(actual: unknown, want: Wall, msg: string) {
  assert(actual && typeof actual === "object", `${msg} — wall missing`);
  const a = actual as Wall;
  eq(
    [a.year, a.month, a.day, a.hour, a.minute],
    [want.year, want.month, want.day, want.hour, want.minute],
    msg,
  );
}
function utcs(occurrences: Array<{ utc: string }>): string[] {
  return occurrences.map((o) => o.utc);
}
function expectThrow(fn: () => unknown, RecurrenceError: any, msg: string) {
  let threw = false;
  try {
    fn();
  } catch (e) {
    threw = true;
    assert(e instanceof RecurrenceError, `${msg} — must throw RecurrenceError (instanceof), got ${e}`);
    assert((e as Error).name === "RecurrenceError", `${msg} — error.name must be "RecurrenceError"`);
  }
  assert(threw, `${msg} — expected a synchronous RecurrenceError, nothing was thrown`);
}

// Loaded lazily inside child mode so a broken module import fails per-check, not globally.
let mod: any;
function api() {
  if (!mod) mod = require("./src/recur");
  return { expandBetween: mod.expandBetween, RecurrenceError: mod.RecurrenceError };
}
const BKK = "Asia/Bangkok";
const NY = "America/New_York";

// ============================================================
// Group A — fundamentals (36 pts)
// ============================================================

check("A1", 4, "DAILY basics in a no-DST zone: instants and walls", () => {
  const { expandBetween } = api();
  const r = expandBetween(
    { timeZone: BKK, start: { year: 2026, month: 1, day: 5, hour: 9, minute: 30 }, freq: "DAILY", count: 5 },
    "2026-01-01T00:00:00Z",
    "2026-02-01T00:00:00Z",
  );
  eq(utcs(r), [
    "2026-01-05T02:30:00Z",
    "2026-01-06T02:30:00Z",
    "2026-01-07T02:30:00Z",
    "2026-01-08T02:30:00Z",
    "2026-01-09T02:30:00Z",
  ], "utc instants");
  wallEq(r[0].wall, { year: 2026, month: 1, day: 5, hour: 9, minute: 30 }, "first wall");
  wallEq(r[4].wall, { year: 2026, month: 1, day: 9, hour: 9, minute: 30 }, "last wall");
});

check("A2", 3, "DAILY interval=3", () => {
  const { expandBetween } = api();
  const r = expandBetween(
    { timeZone: BKK, start: { year: 2026, month: 1, day: 5, hour: 9, minute: 30 }, freq: "DAILY", interval: 3, count: 4 },
    "2026-01-01T00:00:00Z",
    "2026-02-01T00:00:00Z",
  );
  eq(utcs(r), [
    "2026-01-05T02:30:00Z",
    "2026-01-08T02:30:00Z",
    "2026-01-11T02:30:00Z",
    "2026-01-14T02:30:00Z",
  ], "every 3rd calendar day");
});

check("A3", 4, "WEEKLY without byDay, interval=2", () => {
  const { expandBetween } = api();
  const r = expandBetween(
    { timeZone: BKK, start: { year: 2026, month: 1, day: 6, hour: 8, minute: 0 }, freq: "WEEKLY", interval: 2, count: 4 },
    "2026-01-01T00:00:00Z",
    "2026-03-01T00:00:00Z",
  );
  eq(utcs(r), [
    "2026-01-06T01:00:00Z",
    "2026-01-20T01:00:00Z",
    "2026-02-03T01:00:00Z",
    "2026-02-17T01:00:00Z",
  ], "same weekday every 2nd week");
});

check("A4", 4, "MONTHLY default day-of-month across a year boundary", () => {
  const { expandBetween } = api();
  const r = expandBetween(
    { timeZone: BKK, start: { year: 2025, month: 11, day: 15, hour: 10, minute: 0 }, freq: "MONTHLY", count: 4 },
    "2025-11-01T00:00:00Z",
    "2026-03-01T00:00:00Z",
  );
  eq(utcs(r), [
    "2025-11-15T03:00:00Z",
    "2025-12-15T03:00:00Z",
    "2026-01-15T03:00:00Z",
    "2026-02-15T03:00:00Z",
  ], "15th of each month");
});

check("A5", 3, "count is global, not per-window", () => {
  const { expandBetween } = api();
  const spec = {
    timeZone: BKK,
    start: { year: 2026, month: 1, day: 1, hour: 12, minute: 0 },
    freq: "DAILY" as const,
    count: 10, // Jan 1 .. Jan 10 local 12:00 = 05:00Z
  };
  const early = expandBetween(spec, "2026-01-01T00:00:00Z", "2026-01-05T05:00:00Z");
  eq(utcs(early), [
    "2026-01-01T05:00:00Z",
    "2026-01-02T05:00:00Z",
    "2026-01-03T05:00:00Z",
    "2026-01-04T05:00:00Z",
  ], "window truncates output");
  const late = expandBetween(spec, "2026-01-08T00:00:00Z", "2026-02-01T00:00:00Z");
  eq(utcs(late), [
    "2026-01-08T05:00:00Z",
    "2026-01-09T05:00:00Z",
    "2026-01-10T05:00:00Z",
  ], "count exhausts at 10 regardless of window position");
});

check("A6", 3, "until is inclusive on the resolved instant", () => {
  const { expandBetween } = api();
  const r = expandBetween(
    {
      timeZone: BKK,
      start: { year: 2026, month: 1, day: 1, hour: 9, minute: 0 },
      freq: "DAILY",
      until: "2026-01-03T02:00:00Z", // exactly the 3rd occurrence's instant
    },
    "2026-01-01T00:00:00Z",
    "2026-02-01T00:00:00Z",
  );
  eq(utcs(r), [
    "2026-01-01T02:00:00Z",
    "2026-01-02T02:00:00Z",
    "2026-01-03T02:00:00Z",
  ], "occurrence exactly at until is included; nothing after");
});

check("A7", 4, "exDates remove but never refill count", () => {
  const { expandBetween } = api();
  const r = expandBetween(
    {
      timeZone: BKK,
      start: { year: 2026, month: 1, day: 1, hour: 9, minute: 0 },
      freq: "DAILY",
      count: 5,
      exDates: [{ year: 2026, month: 1, day: 3, hour: 9, minute: 0 }],
    },
    "2026-01-01T00:00:00Z",
    "2026-02-01T00:00:00Z",
  );
  eq(utcs(r), [
    "2026-01-01T02:00:00Z",
    "2026-01-02T02:00:00Z",
    "2026-01-04T02:00:00Z",
    "2026-01-05T02:00:00Z",
  ], "4 remain out of count=5; series does NOT extend to Jan 6");
});

check("A8", 4, "window boundaries: from inclusive, to exclusive", () => {
  const { expandBetween } = api();
  const r = expandBetween(
    { timeZone: BKK, start: { year: 2026, month: 1, day: 1, hour: 9, minute: 0 }, freq: "DAILY" },
    "2026-01-02T02:00:00Z", // exactly an occurrence instant
    "2026-01-04T02:00:00Z", // exactly an occurrence instant
  );
  eq(utcs(r), ["2026-01-02T02:00:00Z", "2026-01-03T02:00:00Z"], "boundary semantics");
});

check("A9", 4, "validation: RecurrenceError on bad specs, synchronously", () => {
  const { expandBetween, RecurrenceError } = api();
  const from = "2026-01-01T00:00:00Z";
  const to = "2026-02-01T00:00:00Z";
  const base = { timeZone: BKK, start: { year: 2026, month: 1, day: 1, hour: 9, minute: 0 } };
  expectThrow(
    () => expandBetween({ ...base, freq: "DAILY", count: 3, until: "2026-01-05T00:00:00Z" } as any, from, to),
    RecurrenceError, "count+until together",
  );
  expectThrow(
    () => expandBetween({ ...base, freq: "DAILY", interval: 0 } as any, from, to),
    RecurrenceError, "interval 0",
  );
  expectThrow(
    () => expandBetween({ ...base, freq: "WEEKLY", byDay: ["1MO"] } as any, from, to),
    RecurrenceError, "ordinal byDay on WEEKLY",
  );
  expectThrow(
    () => expandBetween({ ...base, timeZone: "Mars/Olympus_Mons", freq: "DAILY" } as any, from, to),
    RecurrenceError, "unresolvable timeZone",
  );
  expectThrow(
    () => expandBetween({ ...base, freq: "HOURLY" } as any, from, to),
    RecurrenceError, "unknown freq",
  );
  expectThrow(
    () => expandBetween({ ...base, start: { year: 2026, month: 2, day: 30, hour: 9, minute: 0 }, freq: "DAILY" } as any, from, to),
    RecurrenceError, "nonexistent start date",
  );
  expectThrow(
    () => expandBetween({ ...base, freq: "DAILY" } as any, to, from),
    RecurrenceError, "fromUtc >= toUtc",
  );
  // and a valid spec must NOT throw
  expandBetween({ ...base, freq: "DAILY", count: 1 } as any, from, to);
});

check("A10", 3, "output contract: exact format, ascending, wall fields", () => {
  const { expandBetween } = api();
  const r = expandBetween(
    {
      timeZone: BKK,
      start: { year: 2026, month: 1, day: 5, hour: 7, minute: 45 },
      freq: "WEEKLY",
      byDay: ["MO", "WE", "FR"],
      count: 6,
    },
    "2026-01-01T00:00:00Z",
    "2026-03-01T00:00:00Z",
  );
  eq(r.length, 6, "six occurrences");
  const re = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
  for (const o of r) assert(re.test(o.utc), `format of ${o.utc}`);
  for (let i = 1; i < r.length; i++) assert(r[i - 1].utc < r[i].utc, "strictly ascending");
  eq(utcs(r)[0], "2026-01-05T00:45:00Z", "first (Mon Jan 5 07:45 local)");
  eq(utcs(r)[5], "2026-01-16T00:45:00Z", "sixth (Fri Jan 16)");
  for (const o of r) {
    eq([o.wall.hour, o.wall.minute], [7, 45], "wall time-of-day preserved");
  }
});

// ============================================================
// Group B — interactions (64 pts)
// ============================================================

check("B1", 6, "DST spring-forward gap (NY): pre-transition offset, shifted wall", () => {
  const { expandBetween } = api();
  const r = expandBetween(
    { timeZone: NY, start: { year: 2026, month: 3, day: 6, hour: 2, minute: 30 }, freq: "DAILY", count: 4 },
    "2026-03-01T00:00:00Z",
    "2026-03-15T00:00:00Z",
  );
  eq(utcs(r), [
    "2026-03-06T07:30:00Z", // EST
    "2026-03-07T07:30:00Z", // EST
    "2026-03-08T07:30:00Z", // 02:30 does not exist -> EST offset applied
    "2026-03-09T06:30:00Z", // EDT
  ], "gap day resolved with the offset in force before the transition");
  wallEq(r[1].wall, { year: 2026, month: 3, day: 7, hour: 2, minute: 30 }, "normal day wall");
  wallEq(r[2].wall, { year: 2026, month: 3, day: 8, hour: 3, minute: 30 }, "gap day wall is the SHIFTED time");
  wallEq(r[3].wall, { year: 2026, month: 3, day: 9, hour: 2, minute: 30 }, "post-transition wall");
});

check("B2", 6, "DST fall-back overlap (NY): earlier instant chosen", () => {
  const { expandBetween } = api();
  const r = expandBetween(
    { timeZone: NY, start: { year: 2026, month: 10, day: 30, hour: 1, minute: 30 }, freq: "DAILY", count: 4 },
    "2026-10-01T00:00:00Z",
    "2026-12-01T00:00:00Z",
  );
  eq(utcs(r), [
    "2026-10-30T05:30:00Z", // EDT
    "2026-10-31T05:30:00Z", // EDT
    "2026-11-01T05:30:00Z", // ambiguous 01:30 -> earlier (EDT), not 06:30Z
    "2026-11-02T06:30:00Z", // EST
  ], "overlap resolves to the earlier instant");
  for (const o of r) eq([o.wall.hour, o.wall.minute], [1, 30], "walls all 01:30");
});

check("B3", 4, "wall-clock stability across transitions (no epoch+24h stepping)", () => {
  const { expandBetween } = api();
  const r = expandBetween(
    { timeZone: NY, start: { year: 2026, month: 3, day: 7, hour: 9, minute: 0 }, freq: "DAILY", count: 3 },
    "2026-03-01T00:00:00Z",
    "2026-03-15T00:00:00Z",
  );
  eq(utcs(r), [
    "2026-03-07T14:00:00Z",
    "2026-03-08T13:00:00Z", // 23h after the previous occurrence
    "2026-03-09T13:00:00Z",
  ], "09:00 local stays 09:00 local; the UTC step across the transition is 23h");
});

check("B4", 5, "WEEKLY byDay: Monday-week parity anchor + pre-start drop", () => {
  const { expandBetween } = api();
  const r = expandBetween(
    {
      timeZone: BKK,
      start: { year: 2026, month: 1, day: 7, hour: 9, minute: 0 }, // a Wednesday
      freq: "WEEKLY",
      byDay: ["MO", "FR"],
      interval: 2,
    },
    "2026-01-01T00:00:00Z",
    "2026-02-08T00:00:00Z",
  );
  eq(utcs(r), [
    "2026-01-09T02:00:00Z", // FR of week 0 (MO Jan 5 dropped: before start)
    "2026-01-19T02:00:00Z", // MO of week 2
    "2026-01-23T02:00:00Z", // FR of week 2
    "2026-02-02T02:00:00Z", // MO of week 4
    "2026-02-06T02:00:00Z", // FR of week 4
  ], "weeks counted from the Monday-based week containing start");
});

check("B5", 4, "MONTHLY byMonthDay=31: short months are skipped, never clamped", () => {
  const { expandBetween } = api();
  const r = expandBetween(
    { timeZone: BKK, start: { year: 2026, month: 1, day: 31, hour: 10, minute: 0 }, freq: "MONTHLY", byMonthDay: [31] },
    "2026-01-01T00:00:00Z",
    "2026-07-01T00:00:00Z",
  );
  eq(utcs(r), [
    "2026-01-31T03:00:00Z",
    "2026-03-31T03:00:00Z",
    "2026-05-31T03:00:00Z",
  ], "Feb/Apr/Jun contribute nothing");
});

check("B6", 4, "MONTHLY byMonthDay=-1: last day incl. leap February", () => {
  const { expandBetween } = api();
  const r = expandBetween(
    { timeZone: BKK, start: { year: 2027, month: 12, day: 15, hour: 8, minute: 0 }, freq: "MONTHLY", byMonthDay: [-1] },
    "2027-12-01T00:00:00Z",
    "2028-05-01T00:00:00Z",
  );
  eq(utcs(r), [
    "2027-12-31T01:00:00Z",
    "2028-01-31T01:00:00Z",
    "2028-02-29T01:00:00Z", // leap year
    "2028-03-31T01:00:00Z",
    "2028-04-30T01:00:00Z",
  ], "negative monthday counts from month end");
});

check("B7", 4, "MONTHLY byDay ordinals: 2TU and -1FR together", () => {
  const { expandBetween } = api();
  const r = expandBetween(
    { timeZone: BKK, start: { year: 2026, month: 1, day: 1, hour: 9, minute: 0 }, freq: "MONTHLY", byDay: ["2TU", "-1FR"] },
    "2026-01-01T00:00:00Z",
    "2026-04-01T00:00:00Z",
  );
  eq(utcs(r), [
    "2026-01-13T02:00:00Z", // 2nd Tuesday
    "2026-01-30T02:00:00Z", // last Friday
    "2026-02-10T02:00:00Z",
    "2026-02-27T02:00:00Z",
    "2026-03-10T02:00:00Z",
    "2026-03-27T02:00:00Z",
  ], "both selectors, ascending within each month");
});

check("B8", 4, "MONTHLY byDay 5TH: months without a 5th Thursday are skipped", () => {
  const { expandBetween } = api();
  const r = expandBetween(
    { timeZone: BKK, start: { year: 2026, month: 1, day: 1, hour: 9, minute: 0 }, freq: "MONTHLY", byDay: ["5TH"] },
    "2026-01-01T00:00:00Z",
    "2026-05-01T00:00:00Z",
  );
  eq(utcs(r), [
    "2026-01-29T02:00:00Z", // Jan 2026 has 5 Thursdays
    "2026-04-30T02:00:00Z", // Feb, Mar have only 4
  ], "5th-weekday selector");
});

check("B9", 4, "YEARLY on Feb 29: leap years only", () => {
  const { expandBetween } = api();
  const r = expandBetween(
    { timeZone: BKK, start: { year: 2024, month: 2, day: 29, hour: 12, minute: 0 }, freq: "YEARLY" },
    "2024-01-01T00:00:00Z",
    "2029-01-01T00:00:00Z",
  );
  eq(utcs(r), [
    "2024-02-29T05:00:00Z",
    "2028-02-29T05:00:00Z",
  ], "2025-2027 are skipped, not shifted to Feb 28 / Mar 1");
});

check("B10", 4, "30-minute DST zone (Lord Howe): 30-min gap handled exactly", () => {
  const { expandBetween } = api();
  const r = expandBetween(
    {
      timeZone: "Australia/Lord_Howe",
      start: { year: 2026, month: 10, day: 2, hour: 2, minute: 15 },
      freq: "DAILY",
      count: 4,
    },
    "2026-09-30T00:00:00Z",
    "2026-10-10T00:00:00Z",
  );
  eq(utcs(r), [
    "2026-10-01T15:45:00Z", // +10:30
    "2026-10-02T15:45:00Z", // +10:30
    "2026-10-03T15:45:00Z", // 02:15 in the 02:00->02:30 gap -> +10:30 applied
    "2026-10-04T15:15:00Z", // +11:00
  ], "half-hour zone with half-hour DST shift");
  wallEq(r[2].wall, { year: 2026, month: 10, day: 4, hour: 2, minute: 45 }, "gap wall shifted by 30 minutes");
});

check("B11", 4, "exDate names a wall time inside a gap: still removes it", () => {
  const { expandBetween } = api();
  const r = expandBetween(
    {
      timeZone: NY,
      start: { year: 2026, month: 3, day: 6, hour: 2, minute: 30 },
      freq: "DAILY",
      count: 4,
      exDates: [{ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }], // the SCHEDULED wall
    },
    "2026-03-01T00:00:00Z",
    "2026-03-15T00:00:00Z",
  );
  eq(utcs(r), [
    "2026-03-06T07:30:00Z",
    "2026-03-07T07:30:00Z",
    "2026-03-09T06:30:00Z",
  ], "matching is on the scheduled (pre-shift) wall time; count still consumed");
});

check("B12", 4, "exDate matching is exact; near-misses are ignored", () => {
  const { expandBetween } = api();
  const base = {
    timeZone: BKK,
    start: { year: 2026, month: 1, day: 1, hour: 9, minute: 0 },
    freq: "DAILY" as const,
    count: 5,
  };
  const nearMiss = expandBetween(
    { ...base, exDates: [{ year: 2026, month: 1, day: 3, hour: 9, minute: 1 }] },
    "2026-01-01T00:00:00Z",
    "2026-02-01T00:00:00Z",
  );
  eq(nearMiss.length, 5, "off-by-one-minute exDate removes nothing");
  const two = expandBetween(
    {
      ...base,
      exDates: [
        { year: 2026, month: 1, day: 3, hour: 9, minute: 0 },
        { year: 2026, month: 1, day: 4, hour: 9, minute: 0 },
      ],
    },
    "2026-01-01T00:00:00Z",
    "2026-02-01T00:00:00Z",
  );
  eq(utcs(two), [
    "2026-01-01T02:00:00Z",
    "2026-01-02T02:00:00Z",
    "2026-01-05T02:00:00Z",
  ], "two exact matches removed, count not refilled");
});

check("B13", 3, "until lands exactly on an ambiguous (overlap) instant", () => {
  const { expandBetween } = api();
  const r = expandBetween(
    {
      timeZone: NY,
      start: { year: 2026, month: 10, day: 30, hour: 1, minute: 30 },
      freq: "DAILY",
      until: "2026-11-01T05:30:00Z", // the EARLIER mapping of Nov 1 01:30
    },
    "2026-10-01T00:00:00Z",
    "2026-12-01T00:00:00Z",
  );
  eq(utcs(r), [
    "2026-10-30T05:30:00Z",
    "2026-10-31T05:30:00Z",
    "2026-11-01T05:30:00Z", // included: resolved instant == until
  ], "inclusive until against the earlier-of-two resolution");
});

check("B14", 4, "southern-hemisphere spring-forward (Sydney, October)", () => {
  const { expandBetween } = api();
  const r = expandBetween(
    {
      timeZone: "Australia/Sydney",
      start: { year: 2026, month: 10, day: 2, hour: 2, minute: 30 },
      freq: "DAILY",
      count: 4,
    },
    "2026-09-30T00:00:00Z",
    "2026-10-10T00:00:00Z",
  );
  eq(utcs(r), [
    "2026-10-01T16:30:00Z", // +10
    "2026-10-02T16:30:00Z", // +10
    "2026-10-03T16:30:00Z", // 02:30 in the Oct 4 02:00->03:00 gap -> +10 applied
    "2026-10-04T15:30:00Z", // +11
  ], "transition dates are not hardcoded to March/November");
  wallEq(r[2].wall, { year: 2026, month: 10, day: 4, hour: 3, minute: 30 }, "gap wall shifted");
});

check("B15", 4, "window far from start: correct and fast", () => {
  const { expandBetween } = api();
  const r = expandBetween(
    { timeZone: BKK, start: { year: 2020, month: 1, day: 1, hour: 6, minute: 0 }, freq: "DAILY", interval: 11 },
    "2033-06-01T00:00:00Z",
    "2033-07-15T00:00:00Z",
  );
  eq(utcs(r), [
    "2033-06-06T23:00:00Z", // local Jun 7 06:00
    "2033-06-17T23:00:00Z", // local Jun 18
    "2033-06-28T23:00:00Z", // local Jun 29
    "2033-07-09T23:00:00Z", // local Jul 10
  ], "interval phase preserved 13+ years from the anchor (and done within the cap)");
  wallEq(r[0].wall, { year: 2033, month: 6, day: 7, hour: 6, minute: 0 }, "first wall");
});

// ---------- runner ----------
const CAP_MS = 3000;

if (process.argv[2] === "--check") {
  const id = process.argv[3];
  const c = checks.find((x) => x.id === id);
  if (!c) {
    console.error(`no such check: ${id}`);
    process.exit(2);
  }
  try {
    c.fn();
    process.exit(0);
  } catch (e) {
    console.log(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
} else {
  let total = 0;
  const rows: { id: string; points: number; earned: number; name: string; error?: string }[] = [];
  for (const c of checks) {
    const res = spawnSync(process.execPath, [import.meta.path, "--check", c.id], {
      cwd: import.meta.dir,
      timeout: CAP_MS,
      encoding: "utf8",
    });
    let earned = 0;
    let error: string | undefined;
    if (res.status === 0) {
      earned = c.points;
    } else if (res.status === null) {
      error = "CHECK TIMED OUT (hang) or was killed";
    } else {
      error = (res.stdout || res.stderr || "").trim().split("\n").filter(Boolean).pop() ?? `exit ${res.status}`;
    }
    total += earned;
    rows.push({ id: c.id, points: c.points, earned, name: c.name, error });
  }
  const width = Math.max(...rows.map((r) => r.name.length));
  for (const r of rows) {
    const mark = r.earned === r.points ? "PASS" : "FAIL";
    console.log(
      `${r.id.padEnd(4)} ${mark} ${String(r.earned).padStart(2)}/${String(r.points).padStart(2)}  ${r.name.padEnd(width)}${r.error ? "  — " + r.error : ""}`,
    );
  }
  const max = rows.reduce((s, r) => s + r.points, 0);
  console.log(`\nTOTAL ${total}/${max}`);
  console.log(JSON.stringify({ total, max, checks: rows.map(({ id, earned, points }) => ({ id, earned, points })) }));
}
