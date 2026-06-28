// Public type model for RFC 5545 RRULE options.
//
// Temporal types (Temporal.Instant, Temporal.PlainDate, etc.) are used
// directly. They are available as globals from TypeScript's lib.es2025.temporal
// declarations (TypeScript >= 5.8 / 6.x). At runtime the library reads them
// from globalThis.Temporal (Node >= 26) or from an injected polyfill.

/** Recurrence frequency, ordered from finest to coarsest (RFC 5545 §3.3.10). */
export type Frequency =
  'SECONDLY' | 'MINUTELY' | 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'

/** ISO weekday abbreviations used in BYDAY and WKST values. */
export type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU'

/**
 * A BYDAY entry such as `MO`, `3MO`, or `-1FR`.
 * When `ordinal` is undefined the entry applies to every occurrence of that
 * weekday within the recurrence period (e.g. BYDAY=MO in a WEEKLY rule).
 * When `ordinal` is set, it selects the nth (or nth-from-last) occurrence
 * within a MONTHLY or YEARLY period (e.g. `2MO` = 2nd Monday).
 */
export interface WeekdayNum {
  /** The ordinal position, e.g. 2 or -1. undefined means "all". */
  ordinal: number | undefined
  weekday: Weekday
}

/**
 * A DTSTART value. Covers all four Temporal representations that iCalendar
 * DTSTART can express:
 * - Date-only:          Temporal.PlainDate
 * - Floating datetime:  Temporal.PlainDateTime
 * - UTC datetime:       Temporal.Instant
 * - Zoned datetime:     Temporal.ZonedDateTime  (when TZID= is present)
 */
export type RRuleDtstart =
  Temporal.PlainDate | Temporal.PlainDateTime | Temporal.Instant | Temporal.ZonedDateTime

/**
 * A UNTIL value. RFC 5545 mandates the same value type as DTSTART, so
 * ZonedDateTime is not used here (UNTIL is always UTC or plain per spec).
 */
export type RRuleUntil = Temporal.PlainDate | Temporal.PlainDateTime | Temporal.Instant

/**
 * Parsed and typed representation of an RFC 5545 RRULE, plus optional DTSTART
 * and TZID context.
 *
 * Fields map directly to RRULE parts:
 * - `freq`        FREQ (required)
 * - `interval`    INTERVAL (default 1 when absent)
 * - `count`       COUNT
 * - `until`       UNTIL
 * - `wkst`        WKST
 * - `byMonth`     BYMONTH
 * - `byMonthDay`  BYMONTHDAY
 * - `byDay`       BYDAY
 * - `byYearDay`   BYYEARDAY
 * - `byWeekNo`    BYWEEKNO
 * - `byHour`      BYHOUR
 * - `byMinute`    BYMINUTE
 * - `bySecond`    BYSECOND
 * - `bySetPos`    BYSETPOS
 * - `dtstart`     from a DTSTART content line (not part of the RRULE value)
 * - `tzid`        from DTSTART;TZID= (not part of the RRULE value)
 */
export interface RRuleOptions {
  freq: Frequency
  interval?: number
  count?: number
  until?: RRuleUntil
  wkst?: Weekday
  byMonth?: number[]
  byMonthDay?: number[]
  byDay?: WeekdayNum[]
  byYearDay?: number[]
  byWeekNo?: number[]
  byHour?: number[]
  byMinute?: number[]
  bySecond?: number[]
  bySetPos?: number[]
  dtstart?: RRuleDtstart
  tzid?: string
}

/** A single RFC validation failure. */
export interface ValidationError {
  /** The RRULE field that failed, e.g. "COUNT", "UNTIL", "BYDAY". */
  field: string
  /**
   * Stable machine-readable identifier for the rule, e.g. "COUNT_XNOR_UNTIL".
   * Safe to use in translations and error maps.
   */
  ruleId: string
  /** Human-readable description of the failure. */
  message: string
}
