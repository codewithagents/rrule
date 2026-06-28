// RFC 5545 §3.3.10 RRULE expansion engine.
//
// Provides iterate() (lazy generator) and expand() (materialized list).
//
// Algorithm summary by FREQ:
//   SECONDLY : advance by INTERVAL sec; filter BYHOUR/BYMINUTE/BYSECOND
//   MINUTELY : advance by INTERVAL min; filter BYHOUR/BYMINUTE; expand BYSECOND
//   HOURLY   : advance by INTERVAL hr;  filter BYHOUR; expand BYMINUTE x BYSECOND
//   DAILY    : advance by INTERVAL days; filter BYMONTH/BYMONTHDAY/BYDAY;
//              expand BYHOUR x BYMINUTE x BYSECOND; BYSETPOS per day
//   WEEKLY   : advance by INTERVAL weeks; expand BYDAY in week; filter BYMONTH;
//              expand times; BYSETPOS per week
//   MONTHLY  : advance by INTERVAL months; filter BYMONTH; expand days via
//              BYMONTHDAY/BYDAY; expand times; BYSETPOS per month
//   YEARLY   : advance by INTERVAL years; expand all BY* day rules;
//              expand times; BYSETPOS per year

import { getTemporal } from './temporal.js'
import type { RRuleOptions, RRuleDtstart, Weekday, WeekdayNum } from './types.js'

// ---------------------------------------------------------------------------
// Weekday numbering helpers (ISO: 1=MO ... 7=SU)
// ---------------------------------------------------------------------------

const WEEKDAY_TO_ISO: Record<Weekday, number> = {
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
  SU: 7,
}

// ---------------------------------------------------------------------------
// Type discriminators (duck-typed so they work with polyfill and native)
// ---------------------------------------------------------------------------

function isInstant(v: RRuleDtstart): v is Temporal.Instant {
  return typeof v === 'object' && v !== null && 'epochMilliseconds' in v && !('year' in v)
}

function isZonedDateTime(v: RRuleDtstart): v is Temporal.ZonedDateTime {
  return typeof v === 'object' && v !== null && 'timeZoneId' in v
}

function isPlainDateTime(v: RRuleDtstart): v is Temporal.PlainDateTime {
  return typeof v === 'object' && v !== null && 'year' in v && 'hour' in v && !('timeZoneId' in v)
}

function isPlainDate(v: RRuleDtstart): v is Temporal.PlainDate {
  return (
    typeof v === 'object' && v !== null && 'year' in v && !('hour' in v) && !('timeZoneId' in v)
  )
}

// ---------------------------------------------------------------------------
// Internal date-time components
// ---------------------------------------------------------------------------

interface DT {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function dtFrom(dtstart: RRuleDtstart): DT {
  if (isPlainDate(dtstart)) {
    return {
      year: dtstart.year,
      month: dtstart.month,
      day: dtstart.day,
      hour: 0,
      minute: 0,
      second: 0,
    }
  }
  if (isInstant(dtstart)) {
    const T = getTemporal()
    const utc = dtstart.toZonedDateTimeISO('UTC')
    return {
      year: utc.year,
      month: utc.month,
      day: utc.day,
      hour: utc.hour,
      minute: utc.minute,
      second: utc.second,
    }
  }
  // PlainDateTime or ZonedDateTime
  const v = dtstart as Temporal.PlainDateTime | Temporal.ZonedDateTime
  return {
    year: v.year,
    month: v.month,
    day: v.day,
    hour: v.hour,
    minute: v.minute,
    second: v.second,
  }
}

// Create a Temporal value from components, matching the dtstart type.
function makeOccurrence(dt: DT, dtstart: RRuleDtstart, tzid: string | undefined): RRuleDtstart {
  const T = getTemporal()
  if (isPlainDate(dtstart)) {
    return T.PlainDate.from({ year: dt.year, month: dt.month, day: dt.day })
  }
  if (isInstant(dtstart)) {
    const pdt = T.PlainDateTime.from({
      year: dt.year,
      month: dt.month,
      day: dt.day,
      hour: dt.hour,
      minute: dt.minute,
      second: dt.second,
    })
    return pdt.toZonedDateTime('UTC').toInstant()
  }
  if (isZonedDateTime(dtstart)) {
    const tz = tzid ?? dtstart.timeZoneId
    try {
      return T.ZonedDateTime.from(
        {
          year: dt.year,
          month: dt.month,
          day: dt.day,
          hour: dt.hour,
          minute: dt.minute,
          second: dt.second,
          timeZone: tz,
        },
        { disambiguation: 'compatible' }
      )
    } catch {
      // Invalid date/time in this timezone (e.g., a DST-gap time that is rejected)
      return T.ZonedDateTime.from(
        {
          year: dt.year,
          month: dt.month,
          day: dt.day,
          hour: dt.hour,
          minute: dt.minute,
          second: dt.second,
          timeZone: tz,
        },
        { disambiguation: 'earlier' }
      )
    }
  }
  // PlainDateTime
  return T.PlainDateTime.from({
    year: dt.year,
    month: dt.month,
    day: dt.day,
    hour: dt.hour,
    minute: dt.minute,
    second: dt.second,
  })
}

// ---------------------------------------------------------------------------
// Comparisons
// ---------------------------------------------------------------------------

/** Compare two Temporal values: negative/0/positive. Both must be same type. */
function compareOccurrences(a: RRuleDtstart, b: RRuleDtstart): number {
  const T = getTemporal()
  if (isInstant(a) && isInstant(b)) {
    const diff = a.epochMilliseconds - b.epochMilliseconds
    return diff < 0 ? -1 : diff > 0 ? 1 : 0
  }
  if (isZonedDateTime(a) && isZonedDateTime(b)) {
    // Compare by instant (epoch ms)
    const diff = a.epochMilliseconds - b.epochMilliseconds
    return diff < 0 ? -1 : diff > 0 ? 1 : 0
  }
  if (isPlainDateTime(a) && isPlainDateTime(b)) {
    return T.PlainDateTime.compare(a, b)
  }
  if (isPlainDate(a) && isPlainDate(b)) {
    return T.PlainDate.compare(a, b)
  }
  // Mixed types - compare using epoch or string fallback
  return 0
}

// toEpochMs: defined during development, not called by any current code path.
/* c8 ignore start */
/** Convert a RRuleDtstart to epoch milliseconds for comparison. */
function toEpochMs(v: RRuleDtstart, dtstart: RRuleDtstart): number {
  const T = getTemporal()
  if (isInstant(v)) return v.epochMilliseconds
  if (isZonedDateTime(v)) return v.epochMilliseconds
  if (isPlainDateTime(v)) {
    // Treat as UTC for comparison purposes
    return v.toZonedDateTime('UTC').epochMilliseconds
  }
  if (isPlainDate(v)) {
    return T.PlainDate.compare(v, v) // trivial: use as-is via string compare
  }
  return 0
}
/* c8 ignore stop */

/** Check if candidate >= dtstart. */
function isAtOrAfterDtstart(candidate: RRuleDtstart, dtstart: RRuleDtstart): boolean {
  const T = getTemporal()
  if (isInstant(candidate) && isInstant(dtstart)) {
    return candidate.epochMilliseconds >= dtstart.epochMilliseconds
  }
  if (isZonedDateTime(candidate) && isZonedDateTime(dtstart)) {
    return candidate.epochMilliseconds >= dtstart.epochMilliseconds
  }
  if (isPlainDateTime(candidate) && isPlainDateTime(dtstart)) {
    return T.PlainDateTime.compare(candidate, dtstart) >= 0
  }
  if (isPlainDate(candidate) && isPlainDate(dtstart)) {
    return T.PlainDate.compare(candidate, dtstart) >= 0
  }
  return true
}

/** Check if candidate <= UNTIL. */
function isAtOrBeforeUntil(
  candidate: RRuleDtstart,
  until: import('./types.js').RRuleUntil
): boolean {
  const T = getTemporal()
  if (isInstant(until)) {
    // candidate might be Instant or ZonedDateTime
    const candidateEpoch = isInstant(candidate)
      ? candidate.epochMilliseconds
      : isZonedDateTime(candidate)
        ? candidate.epochMilliseconds
        : isPlainDateTime(candidate)
          ? candidate.toZonedDateTime('UTC').epochMilliseconds
          : 0
    return candidateEpoch <= until.epochMilliseconds
  }
  const untilAsPlainDT = until as Temporal.PlainDateTime | Temporal.PlainDate
  if (isPlainDate(untilAsPlainDT) && isPlainDate(candidate)) {
    return (
      T.PlainDate.compare(candidate as Temporal.PlainDate, untilAsPlainDT as Temporal.PlainDate) <=
      0
    )
  }
  if (isPlainDate(untilAsPlainDT) && isPlainDateTime(candidate)) {
    const d = T.PlainDate.from({
      year: (candidate as Temporal.PlainDateTime).year,
      month: (candidate as Temporal.PlainDateTime).month,
      day: (candidate as Temporal.PlainDateTime).day,
    })
    return T.PlainDate.compare(d, untilAsPlainDT as Temporal.PlainDate) <= 0
  }
  if (isPlainDateTime(untilAsPlainDT) && isPlainDateTime(candidate)) {
    return (
      T.PlainDateTime.compare(
        candidate as Temporal.PlainDateTime,
        untilAsPlainDT as Temporal.PlainDateTime
      ) <= 0
    )
  }
  return true
}

// ---------------------------------------------------------------------------
// Advance a PlainDate by N months (returns null if invalid)
// ---------------------------------------------------------------------------

function addMonths(
  T: typeof Temporal,
  year: number,
  month: number,
  months: number
): { year: number; month: number } {
  const totalMonths = year * 12 + (month - 1) + months
  const newYear = Math.floor(totalMonths / 12)
  const newMonth = (totalMonths % 12) + 1
  return { year: newYear, month: newMonth }
}

// ---------------------------------------------------------------------------
// Utility: resolve negative month day to positive (1-based)
// ---------------------------------------------------------------------------

function resolveMonthDay(md: number, daysInMonth: number): number {
  if (md > 0) return md
  return daysInMonth + md + 1
}

// ---------------------------------------------------------------------------
// Utility: resolve negative year day to positive (1-based)
// ---------------------------------------------------------------------------

function resolveYearDay(yd: number, daysInYear: number): number {
  if (yd > 0) return yd
  return daysInYear + yd + 1
}

// ---------------------------------------------------------------------------
// ISO week number helpers
// ---------------------------------------------------------------------------

/** Return the Monday of ISO week 1 of the given year. */
function isoWeek1Monday(T: typeof Temporal, year: number): Temporal.PlainDate {
  // Jan 4 is always in ISO week 1
  const jan4 = T.PlainDate.from({ year, month: 1, day: 4 })
  const dow = jan4.dayOfWeek // 1=Mon...7=Sun
  return jan4.subtract({ days: dow - 1 })
}

/** Resolve a potentially negative BYWEEKNO value (negatives count from the end). */
function resolveWeekNo(wn: number, weeksInYear: number): number {
  if (wn > 0) return wn
  return weeksInYear + wn + 1
}

/** Determine how many ISO weeks are in a year (52 or 53). */
function isoWeeksInYear(T: typeof Temporal, year: number): number {
  const dec28 = T.PlainDate.from({ year, month: 12, day: 28 })
  return dec28.weekOfYear ?? 52
}

// ---------------------------------------------------------------------------
// Dayset generators
// ---------------------------------------------------------------------------

/** All candidate days in a month matching BYMONTHDAY and/or BYDAY. */
function monthlyDayset(
  T: typeof Temporal,
  year: number,
  month: number,
  opts: RRuleOptions,
  dtstartDT: DT
): Temporal.PlainDate[] {
  const { byMonthDay, byDay } = opts

  let baseDate: Temporal.PlainDate
  try {
    baseDate = T.PlainDate.from({ year, month, day: 1 })
  } catch {
    return []
  }
  const dim = baseDate.daysInMonth

  // No BY* day rules: use dtstart day
  if (byMonthDay === undefined && byDay === undefined) {
    const day = dtstartDT.day
    if (day > dim) return [] // dtstart day doesn't exist in this month
    try {
      return [T.PlainDate.from({ year, month, day })]
    } catch {
      return []
    }
  }

  let candidates: Temporal.PlainDate[] = []

  if (byMonthDay !== undefined) {
    for (const md of byMonthDay) {
      const resolved = resolveMonthDay(md, dim)
      if (resolved >= 1 && resolved <= dim) {
        try {
          candidates.push(T.PlainDate.from({ year, month, day: resolved }))
        } catch {
          // skip invalid
        }
      }
    }
    // If BYDAY is also set, filter candidates by weekday
    if (byDay !== undefined && byDay.length > 0) {
      const allowedDows = new Set(
        byDay.filter((d) => d.ordinal === undefined).map((d) => WEEKDAY_TO_ISO[d.weekday])
      )
      // Ordinal BYDAY combined with BYMONTHDAY: treat as intersection
      if (allowedDows.size > 0) {
        candidates = candidates.filter((d) => allowedDows.has(d.dayOfWeek))
      } else {
        // Only ordinal BYDAY: generate ordinal days, intersect with BYMONTHDAY
        const ordinalDays = getOrdinalBydayInMonth(T, year, month, dim, byDay)
        const ordinalDayNums = new Set(ordinalDays.map((d) => d.day))
        candidates = candidates.filter((d) => ordinalDayNums.has(d.day))
      }
    }
  } else if (byDay !== undefined) {
    // Only BYDAY
    candidates = getByDayInMonth(T, year, month, dim, byDay)
  }

  return sortDates(T, candidates)
}

/** Get all dates matching BYDAY in a month (handles ordinals and plain weekdays). */
function getByDayInMonth(
  T: typeof Temporal,
  year: number,
  month: number,
  daysInMonth: number,
  byDay: WeekdayNum[]
): Temporal.PlainDate[] {
  const result: Temporal.PlainDate[] = []

  // Separate plain weekdays from ordinal weekdays
  const plainDows = new Set(
    byDay.filter((d) => d.ordinal === undefined).map((d) => WEEKDAY_TO_ISO[d.weekday])
  )
  const ordinalEntries = byDay.filter((d) => d.ordinal !== undefined)

  // Gather all dates in month
  const allDays: Temporal.PlainDate[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    try {
      allDays.push(T.PlainDate.from({ year, month, day: d }))
    } catch {
      // skip
    }
  }

  // Plain weekdays
  if (plainDows.size > 0) {
    for (const d of allDays) {
      if (plainDows.has(d.dayOfWeek)) result.push(d)
    }
  }

  // Ordinal weekdays (e.g., 1FR, -2MO)
  for (const entry of ordinalEntries) {
    const wdow = WEEKDAY_TO_ISO[entry.weekday]
    const instances = allDays.filter((d) => d.dayOfWeek === wdow)
    const ordinal = entry.ordinal!
    const idx = ordinal > 0 ? ordinal - 1 : instances.length + ordinal
    if (idx >= 0 && idx < instances.length) {
      result.push(instances[idx])
    }
  }

  return result
}

/** Get dates matching ordinal BYDAY entries only (no plain weekdays). */
function getOrdinalBydayInMonth(
  T: typeof Temporal,
  year: number,
  month: number,
  daysInMonth: number,
  byDay: WeekdayNum[]
): Temporal.PlainDate[] {
  const result: Temporal.PlainDate[] = []
  const ordinalEntries = byDay.filter((d) => d.ordinal !== undefined)
  for (const entry of ordinalEntries) {
    const wdow = WEEKDAY_TO_ISO[entry.weekday]
    const instances: Temporal.PlainDate[] = []
    for (let d = 1; d <= daysInMonth; d++) {
      try {
        const date = T.PlainDate.from({ year, month, day: d })
        if (date.dayOfWeek === wdow) instances.push(date)
      } catch {
        // skip
      }
    }
    const ordinal = entry.ordinal!
    const idx = ordinal > 0 ? ordinal - 1 : instances.length + ordinal
    if (idx >= 0 && idx < instances.length) {
      result.push(instances[idx])
    }
  }
  return result
}

/** All candidate days in a year for YEARLY frequency. */
function yearlyDayset(
  T: typeof Temporal,
  year: number,
  opts: RRuleOptions,
  dtstartDT: DT
): Temporal.PlainDate[] {
  const { byMonth, byWeekNo, byYearDay, byMonthDay, byDay } = opts

  // BYWEEKNO takes priority; pass BYMONTHDAY and BYMONTH so they can filter the generated dates
  if (byWeekNo !== undefined) {
    return yearlyDayset_ByWeekNo(T, year, byWeekNo, byDay, byMonthDay, byMonth)
  }

  // BYYEARDAY
  if (byYearDay !== undefined) {
    return yearlyDayset_ByYearDay(T, year, byYearDay)
  }

  const targetMonths = byMonth ?? null // null = all months

  // Ordinal BYDAY (e.g., 20MO, -1FR)
  const hasOrdinalByday = byDay !== undefined && byDay.some((d) => d.ordinal !== undefined)
  const hasPlainByday = byDay !== undefined && byDay.some((d) => d.ordinal === undefined)

  if (hasOrdinalByday && !hasPlainByday) {
    if (targetMonths !== null) {
      // nth weekday in each specified month
      return yearlyDayset_OrdinalBydayInMonths(T, year, targetMonths, byDay!)
    } else {
      // nth weekday in entire year
      return yearlyDayset_OrdinalBydayInYear(T, year, byDay!)
    }
  }

  if (byMonthDay !== undefined) {
    const months = targetMonths ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    const result: Temporal.PlainDate[] = []
    for (const month of months) {
      const candidates = monthlyDayset(T, year, month, { ...opts, byMonth: undefined }, dtstartDT)
      result.push(...candidates)
    }
    return sortDates(T, result)
  }

  if (hasPlainByday) {
    const months = targetMonths ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    const result: Temporal.PlainDate[] = []
    for (const month of months) {
      let baseDate: Temporal.PlainDate
      try {
        baseDate = T.PlainDate.from({ year, month, day: 1 })
      } catch {
        continue
      }
      const dim = baseDate.daysInMonth
      const days = getByDayInMonth(T, year, month, dim, byDay!)
      result.push(...days)
    }
    return sortDates(T, result)
  }

  if (targetMonths !== null) {
    // Only BYMONTH set: same day of month as dtstart, in each specified month
    const day = dtstartDT.day
    const result: Temporal.PlainDate[] = []
    for (const month of targetMonths) {
      try {
        const base = T.PlainDate.from({ year, month, day: 1 })
        if (day <= base.daysInMonth) {
          result.push(T.PlainDate.from({ year, month, day }))
        }
      } catch {
        // skip
      }
    }
    return sortDates(T, result)
  }

  // No BY* day rules: just the same date as dtstart
  try {
    const dim = T.PlainDate.from({ year, month: dtstartDT.month, day: 1 }).daysInMonth
    if (dtstartDT.day <= dim) {
      return [T.PlainDate.from({ year, month: dtstartDT.month, day: dtstartDT.day })]
    }
    return []
  } catch {
    return []
  }
}

function yearlyDayset_ByWeekNo(
  T: typeof Temporal,
  year: number,
  byWeekNo: number[],
  byDay: WeekdayNum[] | undefined,
  byMonthDay?: number[],
  byMonth?: number[]
): Temporal.PlainDate[] {
  const result: Temporal.PlainDate[] = []
  const weeksInYear = isoWeeksInYear(T, year)
  const week1Start = isoWeek1Monday(T, year)

  const allowedDows: Set<number> | null =
    byDay !== undefined && byDay.length > 0
      ? new Set(byDay.filter((d) => d.ordinal === undefined).map((d) => WEEKDAY_TO_ISO[d.weekday]))
      : null

  for (const wn of byWeekNo) {
    const resolved = resolveWeekNo(wn, weeksInYear)
    if (resolved < 1 || resolved > weeksInYear) continue

    const weekStart = week1Start.add({ days: (resolved - 1) * 7 })
    for (let d = 0; d < 7; d++) {
      const date = weekStart.add({ days: d })
      // Verify the date is in the correct ISO year and week
      if (date.weekOfYear !== resolved) continue
      // Apply BYDAY weekday filter
      if (allowedDows !== null && !allowedDows.has(date.dayOfWeek)) continue
      // Apply BYMONTH filter: only include dates in specified months
      if (byMonth !== undefined && !byMonth.includes(date.month)) continue
      // Apply BYMONTHDAY filter: only include dates on specified month days
      if (byMonthDay !== undefined) {
        const dim = date.daysInMonth
        const resolvedDays = byMonthDay.map((md) => resolveMonthDay(md, dim))
        if (!resolvedDays.includes(date.day)) continue
      }
      result.push(date)
    }
  }

  return sortDates(T, result)
}

function yearlyDayset_ByYearDay(
  T: typeof Temporal,
  year: number,
  byYearDay: number[]
): Temporal.PlainDate[] {
  const result: Temporal.PlainDate[] = []
  const jan1 = T.PlainDate.from({ year, month: 1, day: 1 })
  const daysInYear = jan1.daysInYear

  for (const yd of byYearDay) {
    const resolved = resolveYearDay(yd, daysInYear)
    if (resolved < 1 || resolved > daysInYear) continue
    try {
      result.push(jan1.add({ days: resolved - 1 }))
    } catch {
      // skip
    }
  }

  return sortDates(T, result)
}

function yearlyDayset_OrdinalBydayInMonths(
  T: typeof Temporal,
  year: number,
  months: number[],
  byDay: WeekdayNum[]
): Temporal.PlainDate[] {
  const result: Temporal.PlainDate[] = []
  for (const month of months) {
    let baseDate: Temporal.PlainDate
    try {
      baseDate = T.PlainDate.from({ year, month, day: 1 })
    } catch {
      continue
    }
    const days = getByDayInMonth(T, year, month, baseDate.daysInMonth, byDay)
    result.push(...days)
  }
  return sortDates(T, result)
}

function yearlyDayset_OrdinalBydayInYear(
  T: typeof Temporal,
  year: number,
  byDay: WeekdayNum[]
): Temporal.PlainDate[] {
  const result: Temporal.PlainDate[] = []
  const jan1 = T.PlainDate.from({ year, month: 1, day: 1 })
  const daysInYear = jan1.daysInYear

  // Collect all instances of each weekday in the year
  const byWeekday: Map<number, Temporal.PlainDate[]> = new Map()
  for (let d = 0; d < daysInYear; d++) {
    const date = jan1.add({ days: d })
    const dow = date.dayOfWeek
    if (!byWeekday.has(dow)) byWeekday.set(dow, [])
    byWeekday.get(dow)!.push(date)
  }

  for (const entry of byDay) {
    if (entry.ordinal === undefined) continue
    const wdow = WEEKDAY_TO_ISO[entry.weekday]
    const instances = byWeekday.get(wdow) ?? []
    const ordinal = entry.ordinal
    const idx = ordinal > 0 ? ordinal - 1 : instances.length + ordinal
    if (idx >= 0 && idx < instances.length) {
      result.push(instances[idx])
    }
  }

  return sortDates(T, result)
}

// ---------------------------------------------------------------------------
// Timeset generation (sorted combinations of BYHOUR x BYMINUTE x BYSECOND)
// ---------------------------------------------------------------------------

interface TimeSlot {
  hour: number
  minute: number
  second: number
}

function genTimeset(
  opts: RRuleOptions,
  defaultH: number,
  defaultM: number,
  defaultS: number
): TimeSlot[] {
  const hours = opts.byHour !== undefined ? [...opts.byHour].sort((a, b) => a - b) : [defaultH]
  const minutes =
    opts.byMinute !== undefined ? [...opts.byMinute].sort((a, b) => a - b) : [defaultM]
  const seconds =
    opts.bySecond !== undefined ? [...opts.bySecond].sort((a, b) => a - b) : [defaultS]

  const result: TimeSlot[] = []
  for (const h of hours) {
    for (const m of minutes) {
      for (const s of seconds) {
        result.push({ hour: h, minute: m, second: s })
      }
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Utility: sort and deduplicate PlainDate arrays
// ---------------------------------------------------------------------------

function sortDates(T: typeof Temporal, dates: Temporal.PlainDate[]): Temporal.PlainDate[] {
  const seen = new Set<string>()
  return dates
    .filter((d) => {
      const key = `${d.year}-${d.month}-${d.day}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => T.PlainDate.compare(a, b))
}

// ---------------------------------------------------------------------------
// Apply BYSETPOS to an array of candidates
// ---------------------------------------------------------------------------

function applyBySetPos<T>(candidates: T[], bySetPos: number[]): T[] {
  if (candidates.length === 0) return []
  const indices = new Set<number>()
  for (const pos of bySetPos) {
    const idx = pos > 0 ? pos - 1 : candidates.length + pos
    if (idx >= 0 && idx < candidates.length) {
      indices.add(idx)
    }
  }
  return [...indices].sort((a, b) => a - b).map((i) => candidates[i])
}

// ---------------------------------------------------------------------------
// Advance helpers for ZonedDateTime
// ---------------------------------------------------------------------------

// advanceZdt: defined during development, not called by any current code path.
/* c8 ignore start */
function advanceZdt(
  zdt: Temporal.ZonedDateTime,
  freq: string,
  interval: number
): Temporal.ZonedDateTime {
  switch (freq) {
    case 'YEARLY':
      return zdt.add({ years: interval })
    case 'MONTHLY':
      return zdt.add({ months: interval })
    case 'WEEKLY':
      return zdt.add({ weeks: interval })
    case 'DAILY':
      return zdt.add({ days: interval })
    case 'HOURLY':
      return zdt.add({ hours: interval })
    case 'MINUTELY':
      return zdt.add({ minutes: interval })
    case 'SECONDLY':
      return zdt.add({ seconds: interval })
    default:
      return zdt
  }
}
/* c8 ignore stop */

// ---------------------------------------------------------------------------
// Get week start (most recent WKST day at or before a given date)
// ---------------------------------------------------------------------------

function getWeekStart(
  T: typeof Temporal,
  date: Temporal.PlainDate,
  wkstIso: number
): Temporal.PlainDate {
  let dow = date.dayOfWeek // 1=Mon...7=Sun
  let daysBack = (dow - wkstIso + 7) % 7
  return date.subtract({ days: daysBack })
}

// ---------------------------------------------------------------------------
// Weekly candidates: all days within a week matching BYDAY
// ---------------------------------------------------------------------------

function weekCandidateDays(
  T: typeof Temporal,
  weekStart: Temporal.PlainDate,
  opts: RRuleOptions,
  dtstartDT: DT
): Temporal.PlainDate[] {
  const { byDay, byMonth } = opts
  const result: Temporal.PlainDate[] = []

  // When no BYDAY is set, RFC 5545 says only the same weekday as DTSTART is generated.
  // When BYDAY is set, use the specified weekdays.
  let allowedDows: Set<number>
  if (byDay !== undefined && byDay.length > 0) {
    allowedDows = new Set(byDay.map((d) => WEEKDAY_TO_ISO[d.weekday]))
  } else {
    // Default: only the dtstart's day of week
    const dtstartDate = T.PlainDate.from({
      year: dtstartDT.year,
      month: dtstartDT.month,
      day: dtstartDT.day,
    })
    allowedDows = new Set([dtstartDate.dayOfWeek])
  }

  // Build all 7 days of the week
  for (let d = 0; d < 7; d++) {
    const date = weekStart.add({ days: d })
    // Filter by BYDAY weekday (no ordinals for WEEKLY)
    if (!allowedDows.has(date.dayOfWeek)) continue
    // Filter by BYMONTH
    if (byMonth !== undefined && !byMonth.includes(date.month)) continue
    result.push(date)
  }

  return result
}

// ---------------------------------------------------------------------------
// Main iterator
// ---------------------------------------------------------------------------

// Forward-scan caps to prevent infinite loops on never-matching rules.
const MAX_YEARLY_PERIODS = 500
const MAX_MONTHLY_PERIODS = 500 * 12
const MAX_WEEKLY_PERIODS = 500 * 53
const MAX_DAILY_PERIODS = 500 * 366
const MAX_SUBDAILY_PERIODS = 500 * 366 * 24 * 3600 // Very large but bounded

/**
 * Lazily iterate over RRULE occurrences.
 *
 * Yields Temporal values matching the dtstart type: Temporal.PlainDate,
 * Temporal.PlainDateTime, Temporal.Instant, or Temporal.ZonedDateTime.
 */
export function* iterate(options: RRuleOptions): Generator<RRuleDtstart> {
  const T = getTemporal()
  const dtstart = options.dtstart
  if (dtstart === undefined) {
    throw new Error('iterate requires dtstart to be set on RRuleOptions')
  }

  const interval = options.interval ?? 1
  const maxCount = options.count ?? Infinity
  const until = options.until
  const freq = options.freq
  const bySetPos = options.bySetPos
  const tzid = options.tzid

  const dtstartDT = dtFrom(dtstart)
  let count = 0

  // Determine the wkst ISO number (default MO=1)
  const wkstIso = options.wkst !== undefined ? WEEKDAY_TO_ISO[options.wkst] : 1

  // ---------------------------------------------------------------------------
  // YEARLY
  // ---------------------------------------------------------------------------
  if (freq === 'YEARLY') {
    let year = dtstartDT.year
    let periodCount = 0
    while (count < maxCount && periodCount < MAX_YEARLY_PERIODS) {
      periodCount++
      const dayset = yearlyDayset(T, year, options, dtstartDT)
      const timeset = genTimeset(options, dtstartDT.hour, dtstartDT.minute, dtstartDT.second)

      let periodCandidates: RRuleDtstart[] = []
      for (const date of dayset) {
        if (isPlainDate(dtstart)) {
          periodCandidates.push(
            T.PlainDate.from({ year: date.year, month: date.month, day: date.day })
          )
        } else {
          for (const ts of timeset) {
            const occ = makeOccurrence(
              { year: date.year, month: date.month, day: date.day, ...ts },
              dtstart,
              tzid
            )
            periodCandidates.push(occ)
          }
        }
      }

      if (bySetPos !== undefined) {
        periodCandidates = applyBySetPos(periodCandidates, bySetPos)
      }

      for (const occ of periodCandidates) {
        if (!isAtOrAfterDtstart(occ, dtstart)) continue
        if (until !== undefined && !isAtOrBeforeUntil(occ, until)) return
        yield occ
        count++
        if (count >= maxCount) return
      }

      year += interval
    }
    return
  }

  // ---------------------------------------------------------------------------
  // MONTHLY
  // ---------------------------------------------------------------------------
  if (freq === 'MONTHLY') {
    let { year, month } = dtstartDT
    let periodCount = 0
    while (count < maxCount && periodCount < MAX_MONTHLY_PERIODS) {
      periodCount++

      // Filter by BYMONTH (for MONTHLY, BYMONTH is a limit)
      if (options.byMonth === undefined || options.byMonth.includes(month)) {
        const dayset = monthlyDayset(T, year, month, options, dtstartDT)
        const timeset = genTimeset(options, dtstartDT.hour, dtstartDT.minute, dtstartDT.second)

        let periodCandidates: RRuleDtstart[] = []
        for (const date of dayset) {
          if (isPlainDate(dtstart)) {
            periodCandidates.push(
              T.PlainDate.from({ year: date.year, month: date.month, day: date.day })
            )
          } else {
            for (const ts of timeset) {
              const occ = makeOccurrence(
                { year: date.year, month: date.month, day: date.day, ...ts },
                dtstart,
                tzid
              )
              periodCandidates.push(occ)
            }
          }
        }

        if (bySetPos !== undefined) {
          periodCandidates = applyBySetPos(periodCandidates, bySetPos)
        }

        for (const occ of periodCandidates) {
          if (!isAtOrAfterDtstart(occ, dtstart)) continue
          if (until !== undefined && !isAtOrBeforeUntil(occ, until)) return
          yield occ
          count++
          if (count >= maxCount) return
        }
      }

      const next = addMonths(T, year, month, interval)
      year = next.year
      month = next.month

      // Stop if we've gone far into the future
      if (year > dtstartDT.year + 200) break
    }
    return
  }

  // ---------------------------------------------------------------------------
  // WEEKLY
  // ---------------------------------------------------------------------------
  if (freq === 'WEEKLY') {
    const dtstartPlain = T.PlainDate.from({
      year: dtstartDT.year,
      month: dtstartDT.month,
      day: dtstartDT.day,
    })
    let weekStart = getWeekStart(T, dtstartPlain, wkstIso)
    let periodCount = 0

    while (count < maxCount && periodCount < MAX_WEEKLY_PERIODS) {
      periodCount++
      const daysinweek = weekCandidateDays(T, weekStart, options, dtstartDT)
      const timeset = genTimeset(options, dtstartDT.hour, dtstartDT.minute, dtstartDT.second)

      let periodCandidates: RRuleDtstart[] = []
      for (const date of daysinweek) {
        if (isPlainDate(dtstart)) {
          periodCandidates.push(
            T.PlainDate.from({ year: date.year, month: date.month, day: date.day })
          )
        } else {
          for (const ts of timeset) {
            const occ = makeOccurrence(
              { year: date.year, month: date.month, day: date.day, ...ts },
              dtstart,
              tzid
            )
            periodCandidates.push(occ)
          }
        }
      }

      if (bySetPos !== undefined) {
        periodCandidates = applyBySetPos(periodCandidates, bySetPos)
      }

      for (const occ of periodCandidates) {
        if (!isAtOrAfterDtstart(occ, dtstart)) continue
        if (until !== undefined && !isAtOrBeforeUntil(occ, until)) return
        yield occ
        count++
        if (count >= maxCount) return
      }

      weekStart = weekStart.add({ days: interval * 7 })
      if (weekStart.year > dtstartDT.year + 200) break
    }
    return
  }

  // ---------------------------------------------------------------------------
  // DAILY
  // ---------------------------------------------------------------------------
  if (freq === 'DAILY') {
    let currentDate = T.PlainDate.from({
      year: dtstartDT.year,
      month: dtstartDT.month,
      day: dtstartDT.day,
    })
    let periodCount = 0
    const { byMonth, byMonthDay, byDay } = options

    while (count < maxCount && periodCount < MAX_DAILY_PERIODS) {
      periodCount++
      const year = currentDate.year
      const month = currentDate.month
      const day = currentDate.day

      let pass = true

      // BYMONTH filter
      if (byMonth !== undefined && !byMonth.includes(month)) pass = false

      // BYMONTHDAY filter
      if (pass && byMonthDay !== undefined) {
        const dim = currentDate.daysInMonth
        const resolved = byMonthDay.map((md) => resolveMonthDay(md, dim))
        if (!resolved.includes(day)) pass = false
      }

      // BYDAY filter (no ordinals for DAILY)
      if (pass && byDay !== undefined && byDay.length > 0) {
        const allowedDows = new Set(
          byDay.filter((d) => d.ordinal === undefined).map((d) => WEEKDAY_TO_ISO[d.weekday])
        )
        if (allowedDows.size > 0 && !allowedDows.has(currentDate.dayOfWeek)) pass = false
      }

      if (pass) {
        const timeset = genTimeset(options, dtstartDT.hour, dtstartDT.minute, dtstartDT.second)
        let periodCandidates: RRuleDtstart[] = []
        if (isPlainDate(dtstart)) {
          periodCandidates.push(T.PlainDate.from({ year, month, day }))
        } else {
          for (const ts of timeset) {
            periodCandidates.push(makeOccurrence({ year, month, day, ...ts }, dtstart, tzid))
          }
        }

        if (bySetPos !== undefined) {
          periodCandidates = applyBySetPos(periodCandidates, bySetPos)
        }

        for (const occ of periodCandidates) {
          if (!isAtOrAfterDtstart(occ, dtstart)) continue
          if (until !== undefined && !isAtOrBeforeUntil(occ, until)) return
          yield occ
          count++
          if (count >= maxCount) return
        }
      }

      currentDate = currentDate.add({ days: interval })
      if (currentDate.year > dtstartDT.year + 200) break
    }
    return
  }

  // ---------------------------------------------------------------------------
  // HOURLY
  // ---------------------------------------------------------------------------
  if (freq === 'HOURLY') {
    // For HOURLY, we advance by INTERVAL hours using Temporal arithmetic.
    // For ZonedDateTime, use ZDT arithmetic. For others use PlainDateTime/Instant arithmetic.
    let currentDT = dtstartDT
    let periodCount = 0
    const { byHour, byMinute, bySecond } = options

    while (count < maxCount && periodCount < MAX_SUBDAILY_PERIODS) {
      periodCount++

      // BYHOUR filter
      if (byHour === undefined || byHour.includes(currentDT.hour)) {
        const minutes =
          byMinute !== undefined ? [...byMinute].sort((a, b) => a - b) : [dtstartDT.minute]
        const seconds =
          bySecond !== undefined ? [...bySecond].sort((a, b) => a - b) : [dtstartDT.second]

        let periodCandidates: RRuleDtstart[] = []
        for (const m of minutes) {
          for (const s of seconds) {
            const occ = makeOccurrence({ ...currentDT, minute: m, second: s }, dtstart, tzid)
            periodCandidates.push(occ)
          }
        }

        if (bySetPos !== undefined) {
          periodCandidates = applyBySetPos(periodCandidates, bySetPos)
        }

        for (const occ of periodCandidates) {
          if (!isAtOrAfterDtstart(occ, dtstart)) continue
          if (until !== undefined && !isAtOrBeforeUntil(occ, until)) return
          yield occ
          count++
          if (count >= maxCount) return
        }
      }

      // Advance by INTERVAL hours
      const next = advanceDT(currentDT, 'hours', interval)
      currentDT = next
      if (currentDT.year > dtstartDT.year + 200) break
    }
    return
  }

  // ---------------------------------------------------------------------------
  // MINUTELY
  // ---------------------------------------------------------------------------
  if (freq === 'MINUTELY') {
    let currentDT = dtstartDT
    let periodCount = 0
    const { byHour, byMinute, bySecond } = options

    while (count < maxCount && periodCount < MAX_SUBDAILY_PERIODS) {
      periodCount++

      const hourMatch = byHour === undefined || byHour.includes(currentDT.hour)
      const minuteMatch = byMinute === undefined || byMinute.includes(currentDT.minute)

      if (hourMatch && minuteMatch) {
        const seconds =
          bySecond !== undefined ? [...bySecond].sort((a, b) => a - b) : [dtstartDT.second]
        let periodCandidates: RRuleDtstart[] = []
        for (const s of seconds) {
          const occ = makeOccurrence({ ...currentDT, second: s }, dtstart, tzid)
          periodCandidates.push(occ)
        }

        if (bySetPos !== undefined) {
          periodCandidates = applyBySetPos(periodCandidates, bySetPos)
        }

        for (const occ of periodCandidates) {
          if (!isAtOrAfterDtstart(occ, dtstart)) continue
          if (until !== undefined && !isAtOrBeforeUntil(occ, until)) return
          yield occ
          count++
          if (count >= maxCount) return
        }
      }

      const next = advanceDT(currentDT, 'minutes', interval)
      currentDT = next
      if (currentDT.year > dtstartDT.year + 200) break
    }
    return
  }

  // ---------------------------------------------------------------------------
  // SECONDLY
  // ---------------------------------------------------------------------------
  if (freq === 'SECONDLY') {
    let currentDT = dtstartDT
    let periodCount = 0
    const { byHour, byMinute, bySecond } = options

    while (count < maxCount && periodCount < MAX_SUBDAILY_PERIODS) {
      periodCount++

      const hourMatch = byHour === undefined || byHour.includes(currentDT.hour)
      const minuteMatch = byMinute === undefined || byMinute.includes(currentDT.minute)
      const secondMatch = bySecond === undefined || bySecond.includes(currentDT.second)

      if (hourMatch && minuteMatch && secondMatch) {
        const occ = makeOccurrence(currentDT, dtstart, tzid)
        if (isAtOrAfterDtstart(occ, dtstart)) {
          if (until !== undefined && !isAtOrBeforeUntil(occ, until)) return
          yield occ
          count++
          if (count >= maxCount) return
        }
      }

      const next = advanceDT(currentDT, 'seconds', interval)
      currentDT = next
      if (currentDT.year > dtstartDT.year + 200) break
    }
    return
  }
}

// ---------------------------------------------------------------------------
// Helper: advance DT by N time units
// ---------------------------------------------------------------------------

function advanceDT(dt: DT, unit: 'hours' | 'minutes' | 'seconds', n: number): DT {
  // Compute the total seconds from a reference point (ignoring DST for floating/UTC)
  // This works correctly for PlainDateTime and Instant.
  // For ZonedDateTime: we use a separate ZDT-based path in makeOccurrence.
  let totalSeconds =
    dt.hour * 3600 +
    dt.minute * 60 +
    dt.second +
    (unit === 'hours' ? n * 3600 : unit === 'minutes' ? n * 60 : n)

  // Carry into days, hours, minutes, seconds
  let day = dt.day
  let month = dt.month
  let year = dt.year

  // Handle negative totalSeconds (shouldn't happen in forward iteration)
  // and carry into days
  const totalDaysCarry = Math.floor(totalSeconds / 86400)
  totalSeconds = ((totalSeconds % 86400) + 86400) % 86400
  const hour = Math.floor(totalSeconds / 3600)
  const minute = Math.floor((totalSeconds % 3600) / 60)
  const second = totalSeconds % 60

  if (totalDaysCarry === 0) return { year, month, day, hour, minute, second }

  // Add days using PlainDate
  const T = getTemporal()
  try {
    const pd = T.PlainDate.from({ year, month, day }).add({ days: totalDaysCarry })
    return { year: pd.year, month: pd.month, day: pd.day, hour, minute, second }
  } catch {
    return { year: year + totalDaysCarry, month, day, hour, minute, second }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Options for controlling which occurrences are returned by expand().
 */
export interface ExpandOptions {
  /** Maximum number of occurrences to return. */
  limit?: number
  /** Only return occurrences after this value. */
  after?: RRuleDtstart
  /** Only return occurrences before (or at) this value. */
  before?: RRuleDtstart
  /** Whether `after` and `before` bounds are inclusive (default true). */
  inclusive?: boolean
}

/**
 * Materialize RRULE occurrences into an array.
 *
 * The second argument can be:
 * - A plain number: the maximum number of occurrences to return (a hard limit
 *   applied AFTER COUNT/UNTIL from the rule itself).
 * - An ExpandOptions object with optional `limit`, `after`, `before`,
 *   `inclusive` fields.
 *
 * Returns an array of Temporal values matching the dtstart type.
 */
export function expand(
  options: RRuleOptions,
  limitOrOpts?: number | ExpandOptions
): RRuleDtstart[] {
  let limit: number | undefined
  let after: RRuleDtstart | undefined
  let before: RRuleDtstart | undefined
  let inclusive = true

  if (typeof limitOrOpts === 'number') {
    limit = limitOrOpts
  } else if (limitOrOpts !== undefined) {
    limit = limitOrOpts.limit
    after = limitOrOpts.after
    before = limitOrOpts.before
    inclusive = limitOrOpts.inclusive ?? true
  }

  const results: RRuleDtstart[] = []

  for (const occ of iterate(options)) {
    // Apply after/before filters
    if (after !== undefined) {
      const cmp = compareOccurrences(occ, after)
      if (inclusive ? cmp < 0 : cmp <= 0) continue
    }
    if (before !== undefined) {
      const cmp = compareOccurrences(occ, before)
      if (inclusive ? cmp > 0 : cmp >= 0) break
    }

    results.push(occ)

    if (limit !== undefined && results.length >= limit) break
  }

  return results
}
