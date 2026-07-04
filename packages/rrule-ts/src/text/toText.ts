// Internal toText implementation for rrule-ts.
//
// Assembles a human-readable recurrence description from RRuleOptions.
// All clause construction logic lives here. The public API surface is
// in src/text/index.ts.
//
// Clause assembly order:
//   [interval phrase] [BYMONTH clause] [BYDAY clause] [BYMONTHDAY clause]
//   [BYHOUR+BYMINUTE clause] [, COUNT | UNTIL]

import type { RRuleOptions, Weekday } from '../types.js'
import type { LocalePack } from '../locales/types.js'
import { en } from '../locales/en.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Returned for rules that cannot be phrased naturally in any locale. */
export const COMPLEX_RULE_FALLBACK = '(complex recurrence rule)'

/**
 * Maps RFC 5545 weekday abbreviation to the LocalePack weekdays array index.
 * MO=0 (Monday) through SU=6 (Sunday), matching LocalePack.weekdays order.
 */
const WEEKDAY_INDEX: Record<Weekday, number> = {
  MO: 0,
  TU: 1,
  WE: 2,
  TH: 3,
  FR: 4,
  SA: 5,
  SU: 6,
}

/** Weekday abbreviations that form the standard Mon-Fri business-day set. */
const MON_TO_FRI = new Set<Weekday>(['MO', 'TU', 'WE', 'TH', 'FR'])

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Join non-empty strings with a single space.
 * Filters out empty strings so that empty tokens (e.g. DE tokens.the = '')
 * do not produce double spaces in the output.
 */
function sp(...parts: string[]): string {
  return parts.filter(Boolean).join(' ')
}

// ---------------------------------------------------------------------------
// Complexity detection
// ---------------------------------------------------------------------------

/**
 * Return true when a rule cannot be phrased as a natural sentence.
 *
 * Fallback triggers:
 * - BYWEEKNO: no natural English phrasing
 * - BYYEARDAY: no natural English phrasing
 * - BYSETPOS with multiple positions
 * - BYSETPOS combined with BY* parts other than BYDAY
 * - BYSETPOS + BYDAY where BYDAY contains ordinals
 * - BYSETPOS + multiple plain weekdays that are not exactly Mon-Fri
 */
function isComplex(opts: RRuleOptions): boolean {
  if (opts.byWeekNo !== undefined) return true
  if (opts.byYearDay !== undefined) return true

  if (opts.bySetPos !== undefined) {
    // Multiple positions have no single natural phrase.
    if (opts.bySetPos.length > 1) return true

    // BYSETPOS combined with any BY* other than BYDAY.
    const hasNonBydayBy =
      opts.byMonth !== undefined ||
      opts.byMonthDay !== undefined ||
      opts.byHour !== undefined ||
      opts.byMinute !== undefined ||
      opts.bySecond !== undefined
    if (hasNonBydayBy) return true

    // BYSETPOS must come with BYDAY.
    if (opts.byDay === undefined) return true

    // BYSETPOS + ordinal BYDAY is contradictory.
    if (opts.byDay.some((d) => d.ordinal !== undefined)) return true

    // Multiple plain weekdays: only Mon-Fri (weekday set) is naturally phraseable.
    const weekdays = opts.byDay.map((d) => d.weekday)
    if (weekdays.length > 1) {
      const isWeekdaySet = weekdays.length === 5 && weekdays.every((w) => MON_TO_FRI.has(w))
      if (!isWeekdaySet) return true
    }
  }

  return false
}

// ---------------------------------------------------------------------------
// Clause builders
// ---------------------------------------------------------------------------

/** Build the BYDAY clause. Handles plain weekdays, ordinal weekdays, and BYSETPOS. */
function buildByDayClause(opts: RRuleOptions, locale: LocalePack): string {
  const byDay = opts.byDay!

  // BYSETPOS pattern: single position value, plain weekdays only, no other BY*.
  if (opts.bySetPos !== undefined) {
    const pos = opts.bySetPos[0]
    const weekdays = byDay.map((d) => d.weekday)

    // BYSETPOS=-1 + Mon-Fri: 'on the last weekday'
    if (pos === -1 && weekdays.length === 5 && weekdays.every((w) => MON_TO_FRI.has(w))) {
      return sp(locale.tokens.on, locale.tokens.the, locale.tokens.last, locale.tokens.weekday)
    }

    // BYSETPOS + single weekday: 'on [the] [ordinal] [weekday]'
    const weekdayName = locale.weekdays[WEEKDAY_INDEX[weekdays[0]]]
    const ordinalStr = pos === -1 ? locale.tokens.last : locale.formatOrdinal(pos)
    return sp(locale.tokens.on, locale.tokens.the, ordinalStr, weekdayName)
  }

  const hasOrdinals = byDay.some((d) => d.ordinal !== undefined)

  if (!hasOrdinals) {
    // Plain weekdays: WEEKLY/DAILY context. 'on Monday', 'on Monday and Wednesday'
    const names = byDay.map((d) => locale.weekdays[WEEKDAY_INDEX[d.weekday]])
    return sp(locale.tokens.on, locale.formatList(names))
  }

  // Ordinal weekdays: MONTHLY/YEARLY context.
  // Each entry renders as '[the] [ordinal] [weekday]'; the list is then joined
  // and prefixed with 'on'. The 'the' token is empty in DE, so sp() filters it.
  const items = byDay.map((d) => {
    const name = locale.weekdays[WEEKDAY_INDEX[d.weekday]]
    const ord = d.ordinal!
    if (ord === -1) {
      // Use tokens.last for the adjectival 'last' form.
      return sp(locale.tokens.the, locale.tokens.last, name)
    }
    return sp(locale.tokens.the, locale.formatOrdinal(ord), name)
  })

  return sp(locale.tokens.on, locale.formatList(items))
}

/** Build the BYMONTHDAY clause. Handles positive values, -1, and other negatives. */
function buildByMonthDayClause(opts: RRuleOptions, locale: LocalePack): string {
  const byMonthDay = opts.byMonthDay!

  const items = byMonthDay.map((n) => {
    if (n === -1) return locale.tokens.lastDay
    if (n < -1) {
      // e.g. -2 -> '2nd-to-last day'
      return `${locale.formatOrdinal(Math.abs(n))}-to-last day`
    }
    return locale.formatOrdinal(n)
  })

  // 'on the [list]' in EN; 'am [list]' in DE (tokens.the is empty for DE).
  return sp(locale.tokens.on, locale.tokens.the, locale.formatList(items))
}

/** Build the BYHOUR+BYMINUTE time clause. */
function buildTimeClause(opts: RRuleOptions, locale: LocalePack): string {
  const byHour = opts.byHour!
  // When byMinute is absent, use :00 for each hour.
  // When byMinute is present, pair each hour with the first byMinute value.
  const minute = opts.byMinute !== undefined ? opts.byMinute[0] : 0
  const times = byHour.map((h) => `${h}:${String(minute).padStart(2, '0')}`)
  return sp(locale.tokens.at, locale.formatList(times))
}

// ---------------------------------------------------------------------------
// Exported function
// ---------------------------------------------------------------------------

/**
 * Convert RRuleOptions to a human-readable recurrence description.
 *
 * @param options - Parsed RRULE options.
 * @param locale - Optional locale pack. Defaults to the built-in English locale.
 * @returns Human-readable string, or '(complex recurrence rule)' for rules
 *   that cannot be expressed naturally (BYWEEKNO, BYYEARDAY, complex BYSETPOS).
 *   Never throws.
 */
export function toText(options: RRuleOptions, locale: LocalePack = en): string {
  if (isComplex(options)) return COMPLEX_RULE_FALLBACK

  const parts: string[] = []

  // 1. Interval phrase: always present.
  const interval = options.interval ?? 1
  parts.push(locale.formatInterval(interval, options.freq))

  // 2. BYMONTH clause (skipped when BYSETPOS is present because BYSETPOS +
  //    BYMONTH is already marked complex above, so this guard is defensive).
  if (options.byMonth !== undefined && options.bySetPos === undefined) {
    if (options.byMonth.length === 1) {
      const monthName = locale.months[options.byMonth[0] - 1]
      parts.push(sp(locale.tokens.inSingular, monthName))
    } else {
      const monthNames = options.byMonth.map((m) => locale.months[m - 1])
      parts.push(sp(locale.tokens.in, locale.formatList(monthNames)))
    }
  }

  // 3. BYDAY clause (also handles BYSETPOS patterns).
  if (options.byDay !== undefined) {
    parts.push(buildByDayClause(options, locale))
  }

  // 4. BYMONTHDAY clause (only rendered when BYDAY is absent; the two clauses
  //    describe the same period so combining them in one rule is uncommon).
  if (options.byMonthDay !== undefined && options.byDay === undefined) {
    parts.push(buildByMonthDayClause(options, locale))
  }

  // 5. BYHOUR + BYMINUTE time clause.
  if (options.byHour !== undefined) {
    parts.push(buildTimeClause(options, locale))
  }

  // 6. COUNT or UNTIL terminator. COUNT uses ', ' prefix; UNTIL uses ' ' (space).
  const main = parts.join(' ')

  if (options.count !== undefined) {
    return `${main}, ${locale.formatCount(options.count)}`
  }
  if (options.until !== undefined) {
    return `${main} ${locale.tokens.until} ${locale.formatDate(options.until)}`
  }

  return main
}
