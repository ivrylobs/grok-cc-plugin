# Problem P2 — ZonedRecurrence

Build a production-quality, timezone-aware recurring-event expansion library in **TypeScript**,
runnable under **Bun >= 1.0**, with **zero runtime dependencies**. The JavaScript runtime's
built-in `Intl` API is part of the platform, not a dependency — using it for timezone data is
expected. Do not vendor or download a timezone database.

This is a library, not a service. No HTTP, no persistence, no framework. Judge every design
decision by how a maintainer of this file will experience it in six months.

## Deliverable

A directory containing:

- `src/recur.ts` — the implementation. You may add helper files under `src/` if you want.
- `NOTES.md` (optional, max 40 lines) — decisions you made on edges the spec leaves open.

`src/recur.ts` must export exactly:

```ts
export class RecurrenceError extends Error { ... } // error.name === "RecurrenceError"

export interface LocalDateTime {
  year: number;   // e.g. 2026
  month: number;  // 1-12
  day: number;    // 1-31
  hour: number;   // 0-23
  minute: number; // 0-59
}

export interface Occurrence {
  utc: string;         // instant, format "YYYY-MM-DDTHH:mm:ssZ"
  wall: LocalDateTime; // local wall-clock time of that instant in spec.timeZone
}

export interface RecurrenceSpec {
  timeZone: string;          // IANA zone id, e.g. "America/New_York"
  start: LocalDateTime;      // anchor wall-clock date-time in timeZone
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval?: number;         // default 1; integer >= 1
  byDay?: string[];          // e.g. ["MO","FR"] or ["2TU","-1FR"]; see rules 8-10
  byMonthDay?: number[];     // e.g. [15], [31], [-1]; see rules 9, 11
  byMonth?: number[];        // 1-12; YEARLY only; see rule 11
  count?: number;            // integer >= 1; mutually exclusive with until
  until?: string;            // UTC instant "YYYY-MM-DDTHH:mm:ssZ", inclusive
  exDates?: LocalDateTime[]; // exclusions, matched on the SCHEDULED wall time (rule 15)
}

export function expandBetween(
  spec: RecurrenceSpec,
  fromUtc: string,  // "YYYY-MM-DDTHH:mm:ssZ", inclusive
  toUtc: string,    // "YYYY-MM-DDTHH:mm:ssZ", exclusive
): Occurrence[];
```

Do not write your own test files into the deliverable directory. You may test however you like
elsewhere; acceptance is scored by a hidden suite you will not see. Each hidden check runs under
a hard 3-second cap — a hang scores zero for that check.

## Semantics (normative — the hidden suite tests exactly this, not RFC 5545 folklore)

This spec is *inspired by* iCalendar RRULEs but is self-contained. Where it differs from
RFC 5545 or from popular libraries, THIS TEXT WINS.

### The model

1. Every occurrence happens at `start`'s time-of-day (`hour`, `minute`). The `by*` rules select
   **dates only**. Candidates are generated as wall-clock date-times in `timeZone`, in ascending
   wall-clock order, starting from `start`'s period.
2. A candidate whose wall time is earlier than `start`'s wall time is not part of the recurrence
   (this can happen in the first week/month when `byDay`/`byMonthDay` name days before `start`).
   `start` itself is NOT automatically an occurrence: it appears iff the rules generate it.
3. Each candidate wall time is resolved to a UTC instant per rules 12-14. Results are returned
   ascending by `utc`.

### Frequencies

4. `DAILY`: candidate dates are `start.date + k * interval` **calendar days** (k = 0, 1, 2, ...),
   stepped in the local calendar. An event at 09:00 stays at 09:00 local across DST changes —
   its UTC instants are NOT 24h apart on transition days.
5. `WEEKLY`: weeks start on **Monday** (fixed; there is no WKST option). Week 0 is the
   Monday-based week containing `start.date`; the rule includes weeks whose index from week 0 is
   a multiple of `interval`. Without `byDay`, the candidate in each included week is `start`'s
   weekday. With `byDay` (plain weekday tokens only), the candidates are the listed weekdays of
   each included week. Rule 2 still drops candidates before `start`.
6. `MONTHLY`: months at `start.month + k * interval` (calendar months). Candidate days within an
   included month come from exactly one of:
   - `byMonthDay` (rule 9),
   - `byDay` (rule 10),
   - neither: `start.day`; months with fewer days are **skipped** (no clamping — a Jan 31
     monthly recurrence skips February and April).
7. `YEARLY`: years at `start.year + k * interval`. Months = `byMonth` if given, else
   `[start.month]`. Day-in-month = `byMonthDay` if given, else `start.day`. Nonexistent dates are
   **skipped** (a Feb 29 yearly recurrence occurs only in leap years).

### The by* selectors

8. `byDay` tokens match `/^([+-]?[1-5])?(MO|TU|WE|TH|FR|SA|SU)$/`. Ordinal prefixes are allowed
   **only for MONTHLY** ("2TU" = second Tuesday of the month, "-1FR" = last Friday). Plain
   tokens with MONTHLY mean every such weekday of the month. A month lacking the requested
   ordinal (e.g. "5TH" in a 4-Thursday month) contributes nothing for that token — skipped.
9. `byMonthDay` entries are integers in `[-31,-1]` or `[1,31]`. Positive = that day of month;
   months with fewer days are skipped for that entry (31 never clamps to 30/28). Negative counts
   from the end: -1 = last day of the month, -2 = second-to-last, ...
10. Allowed combinations — anything else is a `RecurrenceError`:
    - `byDay`: WEEKLY (plain only) and MONTHLY. Never DAILY or YEARLY.
    - `byMonthDay`: MONTHLY and YEARLY only. Not combinable with `byDay` on MONTHLY.
    - `byMonth`: YEARLY only.
    - Empty arrays and duplicate entries are a `RecurrenceError`.
11. Within one period (week/month/year), candidates from list selectors are expanded, deduped,
    and emitted in ascending date order.

### Timezone resolution (the heart of the problem)

12. A candidate wall time that exists exactly once in `timeZone` maps to that instant.
13. A wall time that does not exist (spring-forward gap): interpret it with the UTC offset in
    force **immediately before** the transition — equivalently, the event is pushed forward by
    the length of the gap. Example: 02:30 in a 02:00→03:00 gap becomes local 03:30, one hour of
    real time after 01:30. (Gaps are not always 60 minutes — some zones shift by 30 minutes.)
14. A wall time that exists twice (fall-back overlap): choose the **earlier** instant (the
    pre-transition offset).
15. `Occurrence.wall` is the wall-clock time **of the resolved instant** (so a gap-shifted
    occurrence reports the shifted wall time, e.g. 03:30, not the scheduled 02:30).

### count, until, exDates

16. `count` limits the total number of generated candidates (rule 2's dropped pre-start
    candidates never count). It is applied BEFORE `exDates` removal and BEFORE windowing:
    an excluded or out-of-window candidate still consumes count. `exDates` never extend the
    series.
17. `until` is a UTC instant; a candidate is in the recurrence iff its **resolved instant**
    is `<= until` (inclusive). `count` and `until` together are a `RecurrenceError`.
18. `exDates` match candidates by exact equality of all five fields against the **scheduled**
    wall time (the generated candidate, BEFORE gap shifting). An exDate naming a wall time that
    falls in a gap therefore still removes that (shifted) occurrence. Non-matching exDates are
    ignored. Matching removes the candidate from the output only — see rule 16.

### Window and output

19. `expandBetween` returns occurrences with `fromUtc <= utc < toUtc` (from inclusive, to
    exclusive), ascending by `utc`, formatted exactly `"YYYY-MM-DDTHH:mm:ssZ"` (zero-padded,
    seconds always present).
20. The window only filters; it does not affect candidate generation, `count`, or exDates
    (rule 16). A window far from `start` must still return correct results within the time cap.

### Validation (throw `RecurrenceError` — synchronously, before any expansion)

21. Reject: unknown `freq`; `interval` not an integer >= 1; `count` not an integer >= 1;
    `count` and `until` both present; malformed `byDay` token; ordinal `byDay` outside MONTHLY;
    forbidden `by*` for the freq (rule 10); `byMonthDay` 0 or |v| > 31; `byMonth` outside 1-12;
    empty or duplicate-containing `by*` arrays; `start` fields outside their ranges or naming a
    nonexistent date (e.g. Feb 30); malformed `until`/`fromUtc`/`toUtc` (must match the exact
    instant format above); `fromUtc >= toUtc`; a `timeZone` the runtime cannot resolve.
22. `RecurrenceError` must be a real class: `instanceof RecurrenceError` works and
    `error.name === "RecurrenceError"`.

## Anti-goals

- No runtime dependencies; no bundled/downloaded tzdata (use `Intl`). Dev-time types are fine.
- Do not implement RRULE string parsing, HOURLY/MINUTELY frequencies, BYSETPOS, WKST, BYWEEKNO,
  RDATE, or iteration/streaming APIs. Unrequested surface area counts against you.
- No polling or busy-wait loops; no worker threads or child processes.

## What "good" looks like

Correctness on the interaction cases — DST gaps and overlaps (including 30-minute zones and
southern-hemisphere transition dates), exclusion dates versus count, until landing exactly on an
ambiguous instant, month-end and leap-year selection — plus an implementation where the
wall-time↔instant boundary lives in exactly one place, `Intl` formatters are reused rather than
rebuilt per call, and a stranger could safely modify the monthly selector logic.
