// RFC 5545 RRULE parser.
//
// Accepts:
//   - A bare RRULE value:           "FREQ=WEEKLY;BYDAY=MO,WE"
//   - With RRULE: prefix:           "RRULE:FREQ=WEEKLY;BYDAY=MO,WE"
//   - With optional DTSTART lines:
//       "DTSTART:20240101T090000Z\nRRULE:FREQ=WEEKLY"
//       "DTSTART;TZID=America/New_York:20240101T090000\nRRULE:FREQ=WEEKLY"
//
// Returns a typed Result so callers never have to catch exceptions from user input.

import { getTemporal } from './temporal.js'
import type {
  Frequency,
  RRuleDtstart,
  RRuleOptions,
  RRuleUntil,
  Weekday,
  WeekdayNum,
} from './types.js'
import { err, ok } from './result.js'
import type { Result } from './result.js'

// ---------------------------------------------------------------------------
// iCalendar date/datetime string converters
// ---------------------------------------------------------------------------

/**
 * Convert an iCalendar basic-format date string to an ISO 8601 extended string
 * that Temporal parsers accept.
 *
 * Handles:
 *   YYYYMMDD           -> YYYY-MM-DD
 *   YYYYMMDDTHHmmss    -> YYYY-MM-DDTHH:mm:ss
 *   YYYYMMDDTHHmmssZ   -> YYYY-MM-DDTHH:mm:ssZ
 */
function icalToIso(value: string): string {
  const datePart = value.slice(0, 8)
  const iso = `${datePart.slice(0, 4)}-${datePart.slice(4, 6)}-${datePart.slice(6, 8)}`
  if (value.length === 8) return iso

  const tPos = value.indexOf('T')
  if (tPos === -1) return iso

  const timePart = value.slice(tPos + 1).replace('Z', '')
  const hh = timePart.slice(0, 2)
  const mm = timePart.slice(2, 4)
  const ss = timePart.slice(4, 6)
  const z = value.endsWith('Z') ? 'Z' : ''
  return `${iso}T${hh}:${mm}:${ss}${z}`
}

/** Parse a DTSTART value string (with optional TZID) into a typed Temporal value. */
function parseDtstart(value: string, tzid: string | undefined): Result<RRuleDtstart, string> {
  const T = getTemporal()
  const iso = icalToIso(value)
  try {
    if (tzid !== undefined) {
      return ok(T.ZonedDateTime.from(`${iso}[${tzid}]`))
    }
    if (value.length === 8) {
      return ok(T.PlainDate.from(iso))
    }
    if (value.endsWith('Z')) {
      return ok(T.Instant.from(iso))
    }
    return ok(T.PlainDateTime.from(iso))
  } catch (e) {
    return err(`invalid DTSTART value "${value}": ${String(e)}`)
  }
}

/** Parse an UNTIL value string into a typed Temporal value. */
function parseUntil(value: string): Result<RRuleUntil, string> {
  const T = getTemporal()
  const iso = icalToIso(value)
  try {
    if (value.length === 8) {
      return ok(T.PlainDate.from(iso))
    }
    if (value.endsWith('Z')) {
      return ok(T.Instant.from(iso))
    }
    return ok(T.PlainDateTime.from(iso))
  } catch (e) {
    return err(`invalid UNTIL value "${value}": ${String(e)}`)
  }
}

// ---------------------------------------------------------------------------
// RRULE part parsers
// ---------------------------------------------------------------------------

const VALID_FREQUENCIES = new Set<string>([
  'SECONDLY',
  'MINUTELY',
  'HOURLY',
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'YEARLY',
])

const VALID_WEEKDAYS = new Set<string>(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'])

function parseFreq(value: string): Result<Frequency, string> {
  if (VALID_FREQUENCIES.has(value)) return ok(value as Frequency)
  return err(`invalid FREQ value "${value}"`)
}

function parseWeekday(value: string): Result<Weekday, string> {
  if (VALID_WEEKDAYS.has(value)) return ok(value as Weekday)
  return err(`invalid weekday "${value}"`)
}

/** Parse a BYDAY entry such as "MO", "3MO", or "-1FR". */
function parseWeekdayNum(raw: string): Result<WeekdayNum, string> {
  const upper = raw.toUpperCase()
  // Weekday-only: MO, TU, etc.
  if (VALID_WEEKDAYS.has(upper)) {
    return ok({ ordinal: undefined, weekday: upper as Weekday })
  }
  // Ordinal prefix: optional sign + digits + 2-char weekday
  const match = /^([+-]?\d+)(MO|TU|WE|TH|FR|SA|SU)$/.exec(upper)
  if (match) {
    const ordinal = parseInt(match[1], 10)
    if (ordinal === 0) return err(`BYDAY ordinal must not be zero: "${raw}"`)
    return ok({ ordinal, weekday: match[2] as Weekday })
  }
  return err(`invalid BYDAY entry "${raw}"`)
}

function parseIntList(value: string, part: string): Result<number[], string> {
  const items = value.split(',')
  const nums: number[] = []
  for (const item of items) {
    const n = Number(item)
    if (!Number.isInteger(n) || String(n) !== item.trim()) {
      return err(`${part} contains non-integer value "${item}"`)
    }
    nums.push(n)
  }
  return ok(nums)
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * Parse an RFC 5545 RRULE string into typed `RRuleOptions`.
 *
 * The input may be:
 *   - A bare RRULE value string:  `FREQ=WEEKLY;BYDAY=MO`
 *   - With RRULE: prefix:         `RRULE:FREQ=WEEKLY;BYDAY=MO`
 *   - Multiline with DTSTART:
 *     ```
 *     DTSTART:20240101T090000Z
 *     RRULE:FREQ=WEEKLY;BYDAY=MO
 *     ```
 *
 * Returns `{ ok: false, error }` on any parse failure; never throws.
 */
export function parse(input: string): Result<RRuleOptions, string> {
  const lines = input.trim().split(/\r?\n/)

  let rruleValue: string | undefined
  let dtstartRaw: string | undefined
  let tzid: string | undefined

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line === '') continue

    if (line.startsWith('DTSTART;TZID=')) {
      const colonIdx = line.indexOf(':')
      if (colonIdx === -1) return err(`invalid DTSTART line: "${line}"`)
      tzid = line.slice('DTSTART;TZID='.length, colonIdx)
      dtstartRaw = line.slice(colonIdx + 1)
    } else if (line.startsWith('DTSTART:')) {
      dtstartRaw = line.slice('DTSTART:'.length)
    } else if (line.startsWith('RRULE:')) {
      rruleValue = line.slice('RRULE:'.length)
    } else if (line.includes(';') || line.startsWith('FREQ=')) {
      // Bare RRULE value without the "RRULE:" prefix
      rruleValue = line
    } else {
      return err(`unknown or unsupported content line: "${line}"`)
    }
  }

  if (rruleValue === undefined) {
    return err('no RRULE found in input')
  }

  // Parse individual RRULE parts
  const parts = rruleValue.split(';')
  const options: Partial<RRuleOptions> & { freq?: Frequency } = {}
  const seenKeys = new Set<string>()

  for (const part of parts) {
    if (part.trim() === '') continue

    const eqIdx = part.indexOf('=')
    if (eqIdx === -1) return err(`invalid RRULE part (missing "="): "${part}"`)

    const key = part.slice(0, eqIdx).toUpperCase()
    const value = part.slice(eqIdx + 1)

    if (seenKeys.has(key)) return err(`duplicate RRULE part: "${key}"`)
    seenKeys.add(key)

    switch (key) {
      case 'FREQ': {
        const r = parseFreq(value)
        if (!r.ok) return err(r.error)
        options.freq = r.value
        break
      }

      case 'INTERVAL': {
        const n = parseInt(value, 10)
        if (isNaN(n) || String(n) !== value) return err(`invalid INTERVAL value: "${value}"`)
        options.interval = n
        break
      }

      case 'COUNT': {
        const n = parseInt(value, 10)
        if (isNaN(n) || String(n) !== value) return err(`invalid COUNT value: "${value}"`)
        options.count = n
        break
      }

      case 'UNTIL': {
        const r = parseUntil(value)
        if (!r.ok) return err(r.error)
        options.until = r.value
        break
      }

      case 'WKST': {
        const r = parseWeekday(value)
        if (!r.ok) return err(`invalid WKST value: ${r.error}`)
        options.wkst = r.value
        break
      }

      case 'BYDAY': {
        const entries = value.split(',')
        const days: WeekdayNum[] = []
        for (const entry of entries) {
          const r = parseWeekdayNum(entry)
          if (!r.ok) return err(r.error)
          days.push(r.value)
        }
        options.byDay = days
        break
      }

      case 'BYMONTH': {
        const r = parseIntList(value, 'BYMONTH')
        if (!r.ok) return err(r.error)
        options.byMonth = r.value
        break
      }

      case 'BYMONTHDAY': {
        const r = parseIntList(value, 'BYMONTHDAY')
        if (!r.ok) return err(r.error)
        options.byMonthDay = r.value
        break
      }

      case 'BYYEARDAY': {
        const r = parseIntList(value, 'BYYEARDAY')
        if (!r.ok) return err(r.error)
        options.byYearDay = r.value
        break
      }

      case 'BYWEEKNO': {
        const r = parseIntList(value, 'BYWEEKNO')
        if (!r.ok) return err(r.error)
        options.byWeekNo = r.value
        break
      }

      case 'BYHOUR': {
        const r = parseIntList(value, 'BYHOUR')
        if (!r.ok) return err(r.error)
        options.byHour = r.value
        break
      }

      case 'BYMINUTE': {
        const r = parseIntList(value, 'BYMINUTE')
        if (!r.ok) return err(r.error)
        options.byMinute = r.value
        break
      }

      case 'BYSECOND': {
        const r = parseIntList(value, 'BYSECOND')
        if (!r.ok) return err(r.error)
        options.bySecond = r.value
        break
      }

      case 'BYSETPOS': {
        const r = parseIntList(value, 'BYSETPOS')
        if (!r.ok) return err(r.error)
        options.bySetPos = r.value
        break
      }

      default:
        return err(`unknown RRULE part: "${key}"`)
    }
  }

  if (options.freq === undefined) {
    return err('RRULE must contain FREQ')
  }

  // Parse DTSTART if present
  if (dtstartRaw !== undefined) {
    const r = parseDtstart(dtstartRaw, tzid)
    if (!r.ok) return err(r.error)
    options.dtstart = r.value
    if (tzid !== undefined) options.tzid = tzid
  }

  return ok(options as RRuleOptions)
}
