// RFC 5545 RRULE cross-field validator.
//
// Returns all validation errors in a single pass. Never throws on user input:
// every validation rule is defensive against null/undefined inputs.

import type { RRuleOptions, ValidationError } from './types.js'
import { err, ok } from './result.js'
import type { Result } from './result.js'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Categorise a DTSTART/UNTIL value for mutual-type checking (duck-typed). */
function valueKind(
  v: unknown
): 'instant' | 'plainDate' | 'plainDateTime' | 'zonedDateTime' | 'unknown' {
  if (typeof v !== 'object' || v === null) return 'unknown'
  if ('timeZoneId' in v) return 'zonedDateTime'
  if ('epochMilliseconds' in v && !('year' in v)) return 'instant'
  if ('year' in v && 'hour' in v) return 'plainDateTime'
  if ('year' in v) return 'plainDate'
  // v8 ignore next
  return 'unknown'
}

// ---------------------------------------------------------------------------
// Individual validation rules
// ---------------------------------------------------------------------------

function checkCountXnorUntil(o: RRuleOptions, errors: ValidationError[]): void {
  if (o.count !== undefined && o.until !== undefined) {
    errors.push({
      field: 'COUNT',
      ruleId: 'COUNT_XNOR_UNTIL',
      message: 'COUNT and UNTIL are mutually exclusive; provide at most one.',
    })
  }
}

function checkInterval(o: RRuleOptions, errors: ValidationError[]): void {
  if (o.interval !== undefined && o.interval < 1) {
    errors.push({
      field: 'INTERVAL',
      ruleId: 'INTERVAL_MIN_1',
      message: `INTERVAL must be >= 1, got ${o.interval}.`,
    })
  }
}

function checkCount(o: RRuleOptions, errors: ValidationError[]): void {
  if (o.count !== undefined && o.count < 1) {
    errors.push({
      field: 'COUNT',
      ruleId: 'COUNT_MIN_1',
      message: `COUNT must be >= 1, got ${o.count}.`,
    })
  }
}

/**
 * RFC 5545 §3.3.10: UNTIL value type must match DTSTART.
 * - If DTSTART is a DATE, UNTIL must also be a DATE.
 * - If DTSTART is a DATE-TIME specified in UTC, UNTIL must be UTC (Instant).
 * - If DTSTART is a floating DATE-TIME, UNTIL must also be floating.
 * - If DTSTART uses TZID, UNTIL must be specified in UTC.
 */
function checkUntilDtstartCompatibility(o: RRuleOptions, errors: ValidationError[]): void {
  if (o.until === undefined || o.dtstart === undefined) return

  const dKind = valueKind(o.dtstart)
  const uKind = valueKind(o.until)

  if (dKind === 'plainDate' && uKind !== 'plainDate') {
    errors.push({
      field: 'UNTIL',
      ruleId: 'UNTIL_TYPE_MATCH_DTSTART',
      message: 'When DTSTART is a DATE value, UNTIL must also be a DATE (not a DATE-TIME).',
    })
    return
  }

  if (dKind === 'instant' && uKind !== 'instant') {
    errors.push({
      field: 'UNTIL',
      ruleId: 'UNTIL_TYPE_MATCH_DTSTART',
      message: 'When DTSTART is a UTC DATE-TIME (ends in Z), UNTIL must also be UTC.',
    })
    return
  }

  if (dKind === 'zonedDateTime' && uKind !== 'instant') {
    errors.push({
      field: 'UNTIL',
      ruleId: 'UNTIL_TYPE_MATCH_DTSTART',
      message: 'When DTSTART uses TZID, UNTIL must be specified as a UTC DATE-TIME (ends in Z).',
    })
    return
  }

  if (dKind === 'plainDateTime' && uKind !== 'plainDateTime') {
    errors.push({
      field: 'UNTIL',
      ruleId: 'UNTIL_TYPE_MATCH_DTSTART',
      message: 'When DTSTART is a floating DATE-TIME, UNTIL must also be a floating DATE-TIME.',
    })
  }
}

/**
 * RFC 5545 §3.3.10: BYDAY ordinals (e.g. "2MO", "-1FR") are only permitted
 * with MONTHLY or YEARLY frequency. They must not appear together with BYWEEKNO.
 */
function checkBydayOrdinals(o: RRuleOptions, errors: ValidationError[]): void {
  if (o.byDay === undefined) return

  const hasOrdinals = o.byDay.some((d) => d.ordinal !== undefined)
  if (!hasOrdinals) return

  if (o.freq !== 'MONTHLY' && o.freq !== 'YEARLY') {
    errors.push({
      field: 'BYDAY',
      ruleId: 'BYDAY_ORDINAL_FREQ',
      message:
        `BYDAY ordinals (e.g. 2MO, -1FR) are only allowed with MONTHLY or YEARLY frequency, ` +
        `got FREQ=${o.freq}.`,
    })
  }

  if (o.byWeekNo !== undefined) {
    errors.push({
      field: 'BYDAY',
      ruleId: 'BYDAY_ORDINAL_NO_BYWEEKNO',
      message: 'BYDAY ordinals must not be combined with BYWEEKNO.',
    })
  }
}

/**
 * RFC 5545 §3.3.10: BYWEEKNO MUST only be used with FREQ=YEARLY.
 * "The BYWEEKNO rule part MUST NOT be specified when the FREQ rule part is
 *  set to anything other than YEARLY."
 */
function checkByWeekNoFreq(o: RRuleOptions, errors: ValidationError[]): void {
  if (o.byWeekNo !== undefined && o.freq !== 'YEARLY') {
    errors.push({
      field: 'BYWEEKNO',
      ruleId: 'BYWEEKNO_YEARLY_ONLY',
      message: `BYWEEKNO is only valid with FREQ=YEARLY; got FREQ=${o.freq}.`,
    })
  }
}

/**
 * RFC 5545 §3.3.10: BYYEARDAY MUST NOT be used with DAILY, WEEKLY, or MONTHLY.
 * "The BYYEARDAY rule part MUST NOT be used with a DAILY, WEEKLY, or MONTHLY
 *  rule."
 */
function checkByYearDayFreq(o: RRuleOptions, errors: ValidationError[]): void {
  if (
    o.byYearDay !== undefined &&
    (o.freq === 'DAILY' || o.freq === 'WEEKLY' || o.freq === 'MONTHLY')
  ) {
    errors.push({
      field: 'BYYEARDAY',
      ruleId: 'BYYEARDAY_FREQ_RESTRICTION',
      message: `BYYEARDAY must not be used with FREQ=${o.freq} (only SECONDLY, MINUTELY, HOURLY, YEARLY are allowed).`,
    })
  }
}

/**
 * RFC 5545 §3.3.10: BYMONTHDAY MUST NOT be used with FREQ=WEEKLY.
 * "The BYMONTHDAY rule part MUST NOT be specified when the FREQ rule part is
 *  set to WEEKLY."
 */
function checkByMonthDayFreq(o: RRuleOptions, errors: ValidationError[]): void {
  if (o.byMonthDay !== undefined && o.freq === 'WEEKLY') {
    errors.push({
      field: 'BYMONTHDAY',
      ruleId: 'BYMONTHDAY_NO_WEEKLY',
      message: 'BYMONTHDAY must not be used with FREQ=WEEKLY.',
    })
  }
}

/**
 * RFC 5545 §3.3.10: BYSETPOS MUST only be used in conjunction with another
 * BYxxx rule part.
 * "The BYSETPOS rule part MUST only be used in conjunction with another BYxxx
 *  rule part."
 */
function checkBySetPosRequiresByRule(o: RRuleOptions, errors: ValidationError[]): void {
  if (o.bySetPos === undefined) return
  const hasOtherByRule =
    o.bySecond !== undefined ||
    o.byMinute !== undefined ||
    o.byHour !== undefined ||
    o.byDay !== undefined ||
    o.byMonthDay !== undefined ||
    o.byYearDay !== undefined ||
    o.byWeekNo !== undefined ||
    o.byMonth !== undefined
  if (!hasOtherByRule) {
    errors.push({
      field: 'BYSETPOS',
      ruleId: 'BYSETPOS_REQUIRES_BYRULE',
      message: 'BYSETPOS must only be used in conjunction with another BYxxx rule part.',
    })
  }
}

/** Validate BY* integer list ranges. */
function checkByListRanges(o: RRuleOptions, errors: ValidationError[]): void {
  const rangeCheck = (
    list: number[] | undefined,
    field: string,
    ruleId: string,
    min: number,
    max: number,
    allowNeg: boolean
  ) => {
    if (list === undefined) return
    for (const v of list) {
      const lo = allowNeg ? -max : min
      const hi = max
      if (v === 0 && min !== 0) {
        errors.push({ field, ruleId, message: `${field} value must not be 0.` })
        return
      }
      if (v < lo || v > hi) {
        errors.push({
          field,
          ruleId,
          message: `${field} value ${v} is out of range [${lo}, ${hi}].`,
        })
      }
    }
  }

  rangeCheck(o.byMonth, 'BYMONTH', 'BYMONTH_RANGE', 1, 12, false)
  rangeCheck(o.byMonthDay, 'BYMONTHDAY', 'BYMONTHDAY_RANGE', 1, 31, true)
  rangeCheck(o.byYearDay, 'BYYEARDAY', 'BYYEARDAY_RANGE', 1, 366, true)
  rangeCheck(o.byWeekNo, 'BYWEEKNO', 'BYWEEKNO_RANGE', 1, 53, true)
  rangeCheck(o.byHour, 'BYHOUR', 'BYHOUR_RANGE', 0, 23, false)
  rangeCheck(o.byMinute, 'BYMINUTE', 'BYMINUTE_RANGE', 0, 59, false)
  rangeCheck(o.bySecond, 'BYSECOND', 'BYSECOND_RANGE', 0, 60, false)
  rangeCheck(o.bySetPos, 'BYSETPOS', 'BYSETPOS_RANGE', 1, 366, true)
}

// ---------------------------------------------------------------------------
// Exported validator
// ---------------------------------------------------------------------------

/**
 * Validate cross-field RFC 5545 constraints on parsed `RRuleOptions`.
 *
 * Returns all errors found in a single pass; the caller sees the complete
 * picture, not just the first problem. Never throws on user input.
 *
 * Rules checked:
 * - COUNT and UNTIL are mutually exclusive
 * - INTERVAL >= 1
 * - COUNT >= 1
 * - UNTIL value type matches DTSTART value type (RFC 5545 §3.3.10)
 * - BYDAY ordinals only allowed for MONTHLY/YEARLY, not with BYWEEKNO
 * - BYWEEKNO only valid with FREQ=YEARLY (RFC 5545 §3.3.10 Table 1)
 * - BYYEARDAY not valid with DAILY, WEEKLY, MONTHLY (RFC 5545 §3.3.10 Table 1)
 * - BYMONTHDAY not valid with FREQ=WEEKLY (RFC 5545 §3.3.10 Table 1)
 * - BYSETPOS requires at least one other BYxxx rule (RFC 5545 §3.3.10)
 * - BY* value ranges (BYMONTH 1-12, BYMONTHDAY ±1-31, BYHOUR 0-23, etc.)
 */
export function validate(options: RRuleOptions): Result<RRuleOptions, ValidationError[]> {
  const errors: ValidationError[] = []

  checkCountXnorUntil(options, errors)
  checkInterval(options, errors)
  checkCount(options, errors)
  checkUntilDtstartCompatibility(options, errors)
  checkBydayOrdinals(options, errors)
  checkByWeekNoFreq(options, errors)
  checkByYearDayFreq(options, errors)
  checkByMonthDayFreq(options, errors)
  checkBySetPosRequiresByRule(options, errors)
  checkByListRanges(options, errors)

  if (errors.length > 0) return err(errors)
  return ok(options)
}
