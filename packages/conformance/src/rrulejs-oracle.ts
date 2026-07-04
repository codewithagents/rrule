// rrule.js (the `rrule` npm package) differential oracle adapter.
//
// This adapter wraps the rrule.js library so it can participate in the
// three-way differential sweep alongside rrule-ts and python-dateutil.
//
// TIMEZONE CAVEAT: rrule.js v2.x does not faithfully replicate IANA timezone
// semantics in the same normalization format as the python oracle (offset ISO
// strings with correct DST transitions). All cases with tzid != null are
// marked `unsupported: true` and EXCLUDED from divergence classification
// rather than emitting wrong data. Only floating (no tzid, no Z suffix) and
// UTC (dtstart ending in Z, no tzid) cases are compared apples-to-apples.
//
// Normalization contract (must match python oracle _format_occurrence exactly):
//   floating -> "YYYY-MM-DDTHH:MM:SS"             (no suffix)
//   UTC      -> "YYYY-MM-DDTHH:MM:SSZ"            (Z suffix)
//   zoned    -> unsupported (omitted from comparison)
//
// rrule.js internal date convention: all Date objects are stored with
// "UTC = wall-clock time". So for floating 09:00 we pass
// new Date(Date.UTC(y, mo-1, d, 9, 0, 0)) and read back via getUTC* methods.
// UTC cases use the same Date construction; the Z suffix is the only difference
// in output format.

import { RRule, Weekday } from 'rrule'
import type { Options as RRuleOptions, ByWeekday } from 'rrule'
import type { OracleInput } from './generator.js'

// ---------------------------------------------------------------------------
// Public result type
// ---------------------------------------------------------------------------

export interface RRuleJsResult {
  id: string
  occurrences: string[]
  error: string | null
  /** When true, tzid support is absent; this case is EXCLUDED from divergence scoring. */
  unsupported?: boolean
}

// ---------------------------------------------------------------------------
// Internal frequency / weekday lookup maps
// ---------------------------------------------------------------------------

const FREQ_MAP: Record<string, number> = {
  YEARLY: RRule.YEARLY,
  MONTHLY: RRule.MONTHLY,
  WEEKLY: RRule.WEEKLY,
  DAILY: RRule.DAILY,
  HOURLY: RRule.HOURLY,
  MINUTELY: RRule.MINUTELY,
  SECONDLY: RRule.SECONDLY,
}

// rrule.js weekday singletons (carry weekday index, no ordinal).
const WEEKDAY_MAP: Record<string, Weekday> = {
  MO: RRule.MO,
  TU: RRule.TU,
  WE: RRule.WE,
  TH: RRule.TH,
  FR: RRule.FR,
  SA: RRule.SA,
  SU: RRule.SU,
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/**
 * Parse a RRULE value string ("FREQ=WEEKLY;COUNT=5;...") into a key->value map.
 * The optional "RRULE:" prefix is stripped.
 */
function parseRRuleParts(rrule: string): Record<string, string> {
  const s = rrule.toUpperCase().startsWith('RRULE:') ? rrule.slice(6) : rrule
  const parts: Record<string, string> = {}
  for (const token of s.split(';')) {
    const eq = token.indexOf('=')
    if (eq < 0) continue
    parts[token.slice(0, eq).toUpperCase()] = token.slice(eq + 1)
  }
  return parts
}

/**
 * Parse an ISO-8601 datetime string into a Date where UTC = wall clock.
 *
 * Accepts: "YYYY-MM-DDTHH:MM:SS" (floating) or "YYYY-MM-DDTHH:MM:SSZ" (UTC).
 * Both become Date.UTC(year, month-1, day, hour, min, sec) because rrule.js
 * uses the UTC channel to store the wall-clock time it works with.
 */
function parseDtstart(dtstart: string): Date {
  const s = dtstart.endsWith('Z') ? dtstart.slice(0, -1) : dtstart
  const [datePart, timePart = '00:00:00'] = s.split('T')
  const dateParts = (datePart ?? '').split('-').map(Number)
  const timeParts = (timePart + ':00:00').split(':').map(Number)
  const y = dateParts[0] ?? 1970
  const mo = (dateParts[1] ?? 1) - 1
  const d = dateParts[2] ?? 1
  const h = timeParts[0] ?? 0
  const mi = timeParts[1] ?? 0
  const sec = timeParts[2] ?? 0
  return new Date(Date.UTC(y, mo, d, h, mi, sec))
}

/**
 * Parse an UNTIL value in iCalendar compact format (YYYYMMDDTHHmmss[Z] or YYYYMMDD).
 *
 * Both UTC and floating UNTIL values are stored as Date.UTC(...) because
 * rrule.js compares them to its internal UTC-as-wall-clock Date objects.
 */
function parseUntil(until: string): Date {
  const isUTC = until.endsWith('Z')
  const s = isUTC ? until.slice(0, -1) : until

  let y: number,
    mo: number,
    d: number,
    h = 0,
    mi = 0,
    sec = 0

  if (s.includes('T')) {
    // YYYYMMDDTHHmmss
    y = parseInt(s.slice(0, 4), 10)
    mo = parseInt(s.slice(4, 6), 10)
    d = parseInt(s.slice(6, 8), 10)
    h = parseInt(s.slice(9, 11), 10)
    mi = parseInt(s.slice(11, 13), 10)
    sec = parseInt(s.slice(13, 15), 10)
  } else {
    // YYYYMMDD
    y = parseInt(s.slice(0, 4), 10)
    mo = parseInt(s.slice(4, 6), 10)
    d = parseInt(s.slice(6, 8), 10)
  }

  return new Date(Date.UTC(y, mo - 1, d, h, mi, sec))
}

/**
 * Parse a BYDAY value into rrule.js ByWeekday array.
 *
 * Examples: "MO,FR" -> [RRule.MO, RRule.FR]
 *           "-1MO"  -> [RRule.MO.nth(-1)]
 *           "2TU"   -> [RRule.TU.nth(2)]
 */
function parseByday(byday: string): ByWeekday[] {
  return byday.split(',').map((token) => {
    token = token.trim().toUpperCase()
    const wd = token.slice(-2)
    const ordStr = token.slice(0, -2)
    const base = WEEKDAY_MAP[wd]
    if (!base) throw new Error(`Unknown weekday in BYDAY: ${wd}`)
    if (ordStr) {
      const n = parseInt(ordStr, 10)
      return base.nth(n)
    }
    return base
  })
}

// ---------------------------------------------------------------------------
// Output normalization
// ---------------------------------------------------------------------------

/**
 * Format a Date (where UTC = wall-clock) to the ISO-8601 string that the
 * python oracle produces for the same occurrence.
 *
 * Floating: "YYYY-MM-DDTHH:MM:SS"
 * UTC:      "YYYY-MM-DDTHH:MM:SSZ"
 */
function formatDate(d: Date, isUTC: boolean): string {
  const y = d.getUTCFullYear()
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  const h = String(d.getUTCHours()).padStart(2, '0')
  const mi = String(d.getUTCMinutes()).padStart(2, '0')
  const s = String(d.getUTCSeconds()).padStart(2, '0')
  const base = `${y}-${mo}-${day}T${h}:${mi}:${s}`
  return isUTC ? `${base}Z` : base
}

// ---------------------------------------------------------------------------
// Main adapter function
// ---------------------------------------------------------------------------

/**
 * Run a single OracleInput case through rrule.js and return a normalized result.
 *
 * Cases with tzid != null are returned as `unsupported: true`. The caller
 * MUST exclude these from any divergence classification (otherwise wrong data
 * poisons the three-way comparison).
 */
export function runRRuleJs(c: OracleInput): RRuleJsResult {
  // Timezone-aware cases: rrule.js cannot reliably replicate IANA semantics in
  // the same offset-ISO format as python-dateutil. Exclude rather than fake.
  if (c.tzid !== null) {
    return { id: c.id, occurrences: [], error: null, unsupported: true }
  }

  try {
    const isUTC = c.dtstart.endsWith('Z')
    const parts = parseRRuleParts(c.rrule)

    const freqKey = (parts['FREQ'] ?? 'DAILY').toUpperCase()
    const freq = FREQ_MAP[freqKey]
    if (freq === undefined) {
      return { id: c.id, occurrences: [], error: `Unknown FREQ: ${freqKey}` }
    }

    const options: Partial<RRuleOptions> = {
      freq,
      dtstart: parseDtstart(c.dtstart),
    }

    if (parts['INTERVAL']) options.interval = parseInt(parts['INTERVAL'], 10)
    if (parts['COUNT']) options.count = parseInt(parts['COUNT'], 10)
    if (parts['UNTIL']) options.until = parseUntil(parts['UNTIL'])
    if (parts['WKST']) {
      const wkBase = WEEKDAY_MAP[(parts['WKST'] ?? '').toUpperCase()]
      if (wkBase) options.wkst = wkBase
    }
    if (parts['BYMONTH']) options.bymonth = parts['BYMONTH'].split(',').map(Number)
    if (parts['BYMONTHDAY']) options.bymonthday = parts['BYMONTHDAY'].split(',').map(Number)
    if (parts['BYYEARDAY']) options.byyearday = parts['BYYEARDAY'].split(',').map(Number)
    if (parts['BYWEEKNO']) options.byweekno = parts['BYWEEKNO'].split(',').map(Number)
    if (parts['BYSETPOS']) options.bysetpos = parts['BYSETPOS'].split(',').map(Number)
    if (parts['BYHOUR']) options.byhour = parts['BYHOUR'].split(',').map(Number)
    if (parts['BYMINUTE']) options.byminute = parts['BYMINUTE'].split(',').map(Number)
    if (parts['BYSECOND']) options.bysecond = parts['BYSECOND'].split(',').map(Number)
    if (parts['BYDAY']) options.byweekday = parseByday(parts['BYDAY'])

    const rule = new RRule(options)

    // Collect up to c.count occurrences. The RRULE is always bounded by COUNT
    // or UNTIL from the generator, so all() is finite.
    // We slice to c.count because an UNTIL-bounded rule may have more
    // occurrences than the oracle comparison requests.
    const allDates = rule.all()
    const occurrences = allDates.slice(0, c.count).map((d) => formatDate(d, isUTC))
    return { id: c.id, occurrences, error: null }
  } catch (err) {
    return {
      id: c.id,
      occurrences: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Run a batch of OracleInput cases through rrule.js.
 * Returns a Map keyed by case id for O(1) lookup by the sweep.
 */
export function runRRuleJsBatch(cases: OracleInput[]): Map<string, RRuleJsResult> {
  const results = cases.map(runRRuleJs)
  return new Map(results.map((r) => [r.id, r]))
}
