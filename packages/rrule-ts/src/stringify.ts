// RFC 5545 RRULE stringifier.
//
// Emits a canonical RRULE string. When `dtstart` is present in the options the
// output includes a DTSTART content line followed by the RRULE line so that
// round-trip is guaranteed: parse(stringify(x)) deep-equals x for all valid x.

import type { RRuleDtstart, RRuleOptions, RRuleUntil, Weekday, WeekdayNum } from './types.js'

// ---------------------------------------------------------------------------
// Temporal value discriminators (duck-typed, works with native + polyfill)
// ---------------------------------------------------------------------------

function isInstant(v: RRuleDtstart | RRuleUntil): v is Temporal.Instant {
  // Temporal.Instant has epochMilliseconds but no year/hour/timeZoneId
  return typeof v === 'object' && v !== null && 'epochMilliseconds' in v && !('year' in v)
}

function isZonedDateTime(v: RRuleDtstart | RRuleUntil): v is Temporal.ZonedDateTime {
  return typeof v === 'object' && v !== null && 'timeZoneId' in v
}

function isPlainDateTime(v: RRuleDtstart | RRuleUntil): v is Temporal.PlainDateTime {
  // PlainDateTime has both year and hour but no timeZoneId
  return typeof v === 'object' && v !== null && 'year' in v && 'hour' in v && !('timeZoneId' in v)
}

function isPlainDate(v: RRuleDtstart | RRuleUntil): v is Temporal.PlainDate {
  // PlainDate has year but no hour or timeZoneId
  return (
    typeof v === 'object' && v !== null && 'year' in v && !('hour' in v) && !('timeZoneId' in v)
  )
}

// ---------------------------------------------------------------------------
// iCalendar date/datetime formatters
// ---------------------------------------------------------------------------

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function pad4(n: number): string {
  return String(n).padStart(4, '0')
}

/** Format a PlainDate as YYYYMMDD. */
function formatPlainDate(d: Temporal.PlainDate): string {
  return `${pad4(d.year)}${pad2(d.month)}${pad2(d.day)}`
}

/** Format a PlainDateTime as YYYYMMDDTHHmmss. */
function formatPlainDateTime(dt: Temporal.PlainDateTime): string {
  return (
    `${pad4(dt.year)}${pad2(dt.month)}${pad2(dt.day)}` +
    `T${pad2(dt.hour)}${pad2(dt.minute)}${pad2(dt.second)}`
  )
}

/** Format an Instant as YYYYMMDDTHHmmssZ. */
function formatInstant(inst: Temporal.Instant): string {
  const zdt = inst.toZonedDateTimeISO('UTC')
  return (
    `${pad4(zdt.year)}${pad2(zdt.month)}${pad2(zdt.day)}` +
    `T${pad2(zdt.hour)}${pad2(zdt.minute)}${pad2(zdt.second)}Z`
  )
}

/** Serialize a DTSTART value to an iCalendar string (value portion only). */
function dtstartToIcal(dtstart: RRuleDtstart): string {
  if (isInstant(dtstart)) return formatInstant(dtstart)
  if (isZonedDateTime(dtstart)) {
    return (
      `${pad4(dtstart.year)}${pad2(dtstart.month)}${pad2(dtstart.day)}` +
      `T${pad2(dtstart.hour)}${pad2(dtstart.minute)}${pad2(dtstart.second)}`
    )
  }
  if (isPlainDateTime(dtstart)) return formatPlainDateTime(dtstart)
  if (isPlainDate(dtstart)) return formatPlainDate(dtstart)
  throw new Error('unrecognized DTSTART Temporal value')
}

/** Serialize an UNTIL value to an iCalendar string. */
function untilToIcal(until: RRuleUntil): string {
  if (isInstant(until)) return formatInstant(until)
  if (isPlainDateTime(until)) return formatPlainDateTime(until)
  if (isPlainDate(until)) return formatPlainDate(until)
  throw new Error('unrecognized UNTIL Temporal value')
}

// ---------------------------------------------------------------------------
// BYDAY and list formatters
// ---------------------------------------------------------------------------

function weekdayNumToString(w: WeekdayNum): string {
  if (w.ordinal === undefined) return w.weekday
  return `${w.ordinal}${w.weekday}`
}

function weekdayToString(w: Weekday): string {
  return w
}

// ---------------------------------------------------------------------------
// Main stringifier
// ---------------------------------------------------------------------------

/**
 * Serialize `RRuleOptions` to a canonical RRULE string.
 *
 * When `dtstart` is present the output includes a `DTSTART` content line
 * (with `TZID=` if `tzid` is set) followed by the `RRULE:` line. This
 * guarantees `parse(stringify(x))` deep-equals `x` for all valid `x`.
 *
 * The RRULE property order is:
 * FREQ, UNTIL, COUNT, INTERVAL, WKST, BYSECOND, BYMINUTE, BYHOUR,
 * BYDAY, BYMONTHDAY, BYYEARDAY, BYWEEKNO, BYMONTH, BYSETPOS.
 */
export function stringify(options: RRuleOptions): string {
  const parts: string[] = []

  parts.push(`FREQ=${options.freq}`)

  if (options.until !== undefined) {
    parts.push(`UNTIL=${untilToIcal(options.until)}`)
  }
  if (options.count !== undefined) {
    parts.push(`COUNT=${options.count}`)
  }
  if (options.interval !== undefined) {
    parts.push(`INTERVAL=${options.interval}`)
  }
  if (options.wkst !== undefined) {
    parts.push(`WKST=${weekdayToString(options.wkst)}`)
  }
  if (options.bySecond !== undefined) {
    parts.push(`BYSECOND=${options.bySecond.join(',')}`)
  }
  if (options.byMinute !== undefined) {
    parts.push(`BYMINUTE=${options.byMinute.join(',')}`)
  }
  if (options.byHour !== undefined) {
    parts.push(`BYHOUR=${options.byHour.join(',')}`)
  }
  if (options.byDay !== undefined) {
    parts.push(`BYDAY=${options.byDay.map(weekdayNumToString).join(',')}`)
  }
  if (options.byMonthDay !== undefined) {
    parts.push(`BYMONTHDAY=${options.byMonthDay.join(',')}`)
  }
  if (options.byYearDay !== undefined) {
    parts.push(`BYYEARDAY=${options.byYearDay.join(',')}`)
  }
  if (options.byWeekNo !== undefined) {
    parts.push(`BYWEEKNO=${options.byWeekNo.join(',')}`)
  }
  if (options.byMonth !== undefined) {
    parts.push(`BYMONTH=${options.byMonth.join(',')}`)
  }
  if (options.bySetPos !== undefined) {
    parts.push(`BYSETPOS=${options.bySetPos.join(',')}`)
  }

  const rruleLine = `RRULE:${parts.join(';')}`

  if (options.dtstart === undefined) {
    return rruleLine
  }

  // Prefix with DTSTART content line for round-trip fidelity
  const dtstartValue = dtstartToIcal(options.dtstart)
  const dtstartLine =
    options.tzid !== undefined
      ? `DTSTART;TZID=${options.tzid}:${dtstartValue}`
      : `DTSTART:${dtstartValue}`

  return `${dtstartLine}\n${rruleLine}`
}
