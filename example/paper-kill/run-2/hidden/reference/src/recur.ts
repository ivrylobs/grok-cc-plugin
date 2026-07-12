/**
 * REFERENCE implementation for Problem P2 (ZonedRecurrence).
 * HIDDEN — scoring instrument only. Never enters any arm's context.
 */

export class RecurrenceError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "RecurrenceError";
  }
}

export interface LocalDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export interface Occurrence {
  utc: string;
  wall: LocalDateTime;
}

export interface RecurrenceSpec {
  timeZone: string;
  start: LocalDateTime;
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval?: number;
  byDay?: string[];
  byMonthDay?: number[];
  byMonth?: number[];
  count?: number;
  until?: string;
  exDates?: LocalDateTime[];
}

// ---------------- civil calendar helpers ----------------

const DAY_MS = 86_400_000;
const MAX_OFFSET_MS = 14 * 3_600_000; // no real zone exceeds UTC+14 / UTC-12

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}
const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function daysInMonth(y: number, m: number): number {
  return m === 2 && isLeap(y) ? 29 : DIM[m - 1];
}

// Howard Hinnant's days-from-civil (epoch day 0 = 1970-01-01).
function epochDay(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
function civilFromEpochDay(z: number): { year: number; month: number; day: number } {
  z += 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { year: m <= 2 ? y + 1 : y, month: m, day: d };
}
// Monday = 0 ... Sunday = 6. Epoch day 0 (1970-01-01) was a Thursday -> 3.
function weekdayMon0(ed: number): number {
  return ((ed % 7) + 7 + 3) % 7;
}

function wallCmp(a: LocalDateTime, b: LocalDateTime): number {
  return (
    a.year - b.year || a.month - b.month || a.day - b.day || a.hour - b.hour || a.minute - b.minute
  );
}
function wallEq(a: LocalDateTime, b: LocalDateTime): boolean {
  return wallCmp(a, b) === 0;
}
// Wall time reinterpreted as if it were UTC (a pivot value, not an instant).
function naiveMs(w: LocalDateTime): number {
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, 0, 0);
}

// ---------------- instant parse / format ----------------

const INSTANT_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/;
function parseInstant(s: unknown, what: string): number {
  if (typeof s !== "string") throw new RecurrenceError(`${what} must be a string instant`);
  const m = INSTANT_RE.exec(s);
  if (!m) throw new RecurrenceError(`${what} must match YYYY-MM-DDTHH:mm:ssZ (got ${JSON.stringify(s)})`);
  const [y, mo, d, h, mi, se] = [+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]];
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo) || h > 23 || mi > 59 || se > 59) {
    throw new RecurrenceError(`${what} names a nonexistent date-time: ${s}`);
  }
  return Date.UTC(y, mo - 1, d, h, mi, se, 0);
}
function pad(n: number, w = 2): string {
  return String(n).padStart(w, "0");
}
function formatInstant(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;
}

// ---------------- zone math (the single wall <-> instant boundary) ----------------

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function zoneFormatter(zone: string): Intl.DateTimeFormat {
  let f = fmtCache.get(zone);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        era: "short",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      });
    } catch {
      throw new RecurrenceError(`unresolvable timeZone: ${JSON.stringify(zone)}`);
    }
    fmtCache.set(zone, f);
  }
  return f;
}

/** Local wall-clock time of a UTC instant in `zone`. */
function wallAt(ms: number, zone: string): LocalDateTime {
  const parts = zoneFormatter(zone).formatToParts(ms);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

/** UTC offset (ms) of `zone` at instant `ms`. */
function offsetAt(ms: number, zone: string): number {
  const parts = zoneFormatter(zone).formatToParts(ms);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const sec = get("second");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), sec, 0);
  // Round to whole minutes to absorb any sub-second formatting noise.
  return Math.round((asUtc - ms) / 60000) * 60000;
}

/**
 * Resolve a wall time to an instant per rules 12-14:
 * unique -> the instant; overlap -> earlier; gap -> pre-transition offset.
 */
function resolveWall(w: LocalDateTime, zone: string): { ms: number; wall: LocalDateTime } {
  const naive = naiveMs(w);
  const offBefore = offsetAt(naive - DAY_MS, zone);
  const offAfter = offsetAt(naive + DAY_MS, zone);
  const candidates: number[] = [];
  for (const off of offBefore === offAfter ? [offBefore] : [offBefore, offAfter]) {
    const t = naive - off;
    if (offsetAt(t, zone) === off) candidates.push(t);
  }
  let ms: number;
  if (candidates.length === 0) {
    // Gap: interpret with the offset in force immediately before the transition (rule 13).
    ms = naive - offBefore;
  } else {
    ms = Math.min(...candidates); // unique or earlier-of-two (rule 14)
  }
  return { ms, wall: wallAt(ms, zone) };
}

// ---------------- validation ----------------

const WD: Record<string, number> = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 };
const BYDAY_RE = /^([+-]?[1-5])?(MO|TU|WE|TH|FR|SA|SU)$/;
interface ByDayToken {
  ord: number | null;
  wd: number;
}

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}
function assertNoDupes<T>(arr: T[], what: string, keyOf: (t: T) => string): void {
  if (arr.length === 0) throw new RecurrenceError(`${what} must not be empty`);
  const seen = new Set<string>();
  for (const v of arr) {
    const k = keyOf(v);
    if (seen.has(k)) throw new RecurrenceError(`${what} contains duplicate ${k}`);
    seen.add(k);
  }
}

interface Validated {
  zone: string;
  start: LocalDateTime;
  freq: RecurrenceSpec["freq"];
  interval: number;
  byDay: ByDayToken[] | undefined;
  byMonthDay: number[] | undefined;
  byMonth: number[] | undefined;
  count: number | undefined;
  untilMs: number | undefined;
  exDates: LocalDateTime[];
}

function validateWall(w: unknown, what: string): LocalDateTime {
  if (typeof w !== "object" || w === null) throw new RecurrenceError(`${what} must be a LocalDateTime`);
  const { year, month, day, hour, minute } = w as LocalDateTime;
  for (const [name, v] of Object.entries({ year, month, day, hour, minute })) {
    if (!isInt(v)) throw new RecurrenceError(`${what}.${name} must be an integer`);
  }
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new RecurrenceError(`${what} names a nonexistent local date-time`);
  }
  return { year, month, day, hour, minute };
}

function validate(spec: RecurrenceSpec): Validated {
  if (typeof spec !== "object" || spec === null) throw new RecurrenceError("spec must be an object");
  const freq = spec.freq;
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY" && freq !== "YEARLY") {
    throw new RecurrenceError(`unknown freq: ${JSON.stringify(freq)}`);
  }
  const interval = spec.interval ?? 1;
  if (!isInt(interval) || interval < 1) throw new RecurrenceError(`interval must be an integer >= 1`);
  const start = validateWall(spec.start, "start");
  zoneFormatter(spec.timeZone); // throws RecurrenceError if unresolvable

  if (spec.count !== undefined && spec.until !== undefined) {
    throw new RecurrenceError("count and until are mutually exclusive");
  }
  const count = spec.count;
  if (count !== undefined && (!isInt(count) || count < 1)) {
    throw new RecurrenceError("count must be an integer >= 1");
  }
  const untilMs = spec.until === undefined ? undefined : parseInstant(spec.until, "until");

  let byDay: ByDayToken[] | undefined;
  if (spec.byDay !== undefined) {
    if (freq !== "WEEKLY" && freq !== "MONTHLY") throw new RecurrenceError(`byDay is not allowed with freq ${freq}`);
    assertNoDupes(spec.byDay, "byDay", String);
    byDay = spec.byDay.map((tok) => {
      const m = typeof tok === "string" ? BYDAY_RE.exec(tok) : null;
      if (!m) throw new RecurrenceError(`malformed byDay token: ${JSON.stringify(tok)}`);
      const ord = m[1] === undefined ? null : Number(m[1]);
      if (ord !== null && freq === "WEEKLY") throw new RecurrenceError("ordinal byDay is MONTHLY-only");
      return { ord, wd: WD[m[2]] };
    });
  }
  let byMonthDay: number[] | undefined;
  if (spec.byMonthDay !== undefined) {
    if (freq !== "MONTHLY" && freq !== "YEARLY") throw new RecurrenceError(`byMonthDay is not allowed with freq ${freq}`);
    if (freq === "MONTHLY" && byDay) throw new RecurrenceError("byDay and byMonthDay cannot combine on MONTHLY");
    assertNoDupes(spec.byMonthDay, "byMonthDay", String);
    for (const v of spec.byMonthDay) {
      if (!isInt(v) || v === 0 || v < -31 || v > 31) throw new RecurrenceError(`invalid byMonthDay: ${v}`);
    }
    byMonthDay = spec.byMonthDay;
  }
  let byMonth: number[] | undefined;
  if (spec.byMonth !== undefined) {
    if (freq !== "YEARLY") throw new RecurrenceError("byMonth is YEARLY-only");
    assertNoDupes(spec.byMonth, "byMonth", String);
    for (const v of spec.byMonth) {
      if (!isInt(v) || v < 1 || v > 12) throw new RecurrenceError(`invalid byMonth: ${v}`);
    }
    byMonth = spec.byMonth;
  }
  const exDates = (spec.exDates ?? []).map((x, i) => validateWall(x, `exDates[${i}]`));
  return { zone: spec.timeZone, start, freq, interval, byDay, byMonthDay, byMonth, count, untilMs, exDates };
}

// ---------------- candidate generation (dates only; ascending) ----------------

function* candidateDays(v: Validated): Generator<number> {
  const s = v.start;
  const startDay = epochDay(s.year, s.month, s.day);
  if (v.freq === "DAILY") {
    for (let d = startDay; ; d += v.interval) yield d;
  } else if (v.freq === "WEEKLY") {
    const week0 = startDay - weekdayMon0(startDay);
    const wds = v.byDay ? [...v.byDay.map((t) => t.wd)].sort((a, b) => a - b) : [weekdayMon0(startDay)];
    for (let w = week0; ; w += 7 * v.interval) {
      for (const wd of wds) yield w + wd;
    }
  } else if (v.freq === "MONTHLY") {
    for (let k = 0; ; k++) {
      const mi = (s.month - 1) + k * v.interval;
      const y = s.year + Math.floor(mi / 12);
      const m = (mi % 12) + 1;
      const dim = daysInMonth(y, m);
      const days = new Set<number>();
      if (v.byMonthDay) {
        for (const md of v.byMonthDay) {
          const d = md > 0 ? md : dim + 1 + md;
          if (d >= 1 && d <= dim) days.add(d);
        }
      } else if (v.byDay) {
        const firstEd = epochDay(y, m, 1);
        for (const { ord, wd } of v.byDay) {
          // days of this month falling on weekday wd
          const firstWd = weekdayMon0(firstEd);
          const firstDom = 1 + ((wd - firstWd + 7) % 7);
          const all: number[] = [];
          for (let d = firstDom; d <= dim; d += 7) all.push(d);
          if (ord === null) all.forEach((d) => days.add(d));
          else if (ord > 0) {
            if (all[ord - 1] !== undefined) days.add(all[ord - 1]);
          } else {
            if (all[all.length + ord] !== undefined) days.add(all[all.length + ord]);
          }
        }
      } else {
        if (s.day <= dim) days.add(s.day);
      }
      for (const d of [...days].sort((a, b) => a - b)) yield epochDay(y, m, d);
    }
  } else {
    // YEARLY
    for (let y = s.year; ; y += v.interval) {
      const months = v.byMonth ? [...v.byMonth].sort((a, b) => a - b) : [s.month];
      const out: number[] = [];
      for (const m of months) {
        const dim = daysInMonth(y, m);
        const dayList = v.byMonthDay ? v.byMonthDay.map((md) => (md > 0 ? md : dim + 1 + md)) : [s.day];
        for (const d of [...new Set(dayList)].sort((a, b) => a - b)) {
          if (d >= 1 && d <= dim) out.push(epochDay(y, m, d));
        }
      }
      for (const ed of out.sort((a, b) => a - b)) yield ed;
    }
  }
}

// ---------------- expansion ----------------

export function expandBetween(spec: RecurrenceSpec, fromUtc: string, toUtc: string): Occurrence[] {
  const v = validate(spec);
  const fromMs = parseInstant(fromUtc, "fromUtc");
  const toMs = parseInstant(toUtc, "toUtc");
  if (fromMs >= toMs) throw new RecurrenceError("fromUtc must be strictly before toUtc");

  // Conservative generation ceiling: nothing generated after this wall pivot can land
  // in the window or satisfy `until` (offsets are bounded by +/-14h).
  const hardEndMs = Math.min(toMs, v.untilMs ?? Infinity) + MAX_OFFSET_MS + DAY_MS;

  const out: Occurrence[] = [];
  let produced = 0;
  for (const ed of candidateDays(v)) {
    const c = civilFromEpochDay(ed);
    const wall: LocalDateTime = { ...c, hour: v.start.hour, minute: v.start.minute };
    if (wallCmp(wall, v.start) < 0) continue; // rule 2: pre-start, never counted
    if (naiveMs(wall) > hardEndMs) break;
    if (v.count !== undefined && produced >= v.count) break;
    produced++; // rule 16: exDates and window still consume count
    const { ms, wall: resolvedWall } = resolveWall(wall, v.zone);
    if (v.untilMs !== undefined && ms > v.untilMs) continue; // rule 17 (inclusive)
    if (v.exDates.some((x) => wallEq(x, wall))) continue; // rule 18: scheduled wall match
    if (ms < fromMs || ms >= toMs) continue; // rule 19
    out.push({ utc: formatInstant(ms), wall: resolvedWall });
  }
  out.sort((a, b) => (a.utc < b.utc ? -1 : a.utc > b.utc ? 1 : 0));
  return out;
}
