// Fast-check based generator for valid RRULE + DTSTART cases.
//
// The generator produces cases in oracle-input format (plain objects with
// rrule, dtstart, tzid, count fields). Each case is built so that it
// passes rrule-ts validate() by construction: BY* fields are only emitted
// when compatible with the chosen FREQ.
//
// Use sampleCases(n, seed?) to draw n cases deterministically.

import * as fc from 'fast-check'
import { validate, stringify } from 'rrule-ts'
import type { RRuleOptions, Frequency, Weekday } from 'rrule-ts'

/** Shape expected by the Python oracle and stored in the corpus. */
export interface OracleInput {
  id: string
  label: string
  rrule: string // RRULE value only (no DTSTART)
  dtstart: string // ISO-8601 datetime string
  tzid: string | null
  count: number
}

// ---------------------------------------------------------------------------
// Sub-arbitraries shared across FREQ types
// ---------------------------------------------------------------------------

const weekdayArb = fc.constantFrom<Weekday>('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU')

const weekdaySetArb = fc
  .uniqueArray(weekdayArb, { minLength: 1, maxLength: 4 })
  .map((days) => days.map((w) => ({ ordinal: undefined as number | undefined, weekday: w })))

const weekdayWithOrdinalArb = fc
  .record({
    ordinal: fc.oneof(fc.integer({ min: 1, max: 4 }), fc.integer({ min: -4, max: -1 })),
    weekday: weekdayArb,
  })
  .map(({ ordinal, weekday }) => [{ ordinal, weekday }])

const byHourArb = fc.option(
  fc.uniqueArray(fc.integer({ min: 0, max: 23 }), { minLength: 1, maxLength: 3 }),
  { nil: undefined }
)
const byMinuteArb = fc.option(
  fc.uniqueArray(fc.integer({ min: 0, max: 59 }), { minLength: 1, maxLength: 3 }),
  { nil: undefined }
)
const bySecondArb = fc.option(
  fc.uniqueArray(fc.integer({ min: 0, max: 59 }), { minLength: 1, maxLength: 3 }),
  { nil: undefined }
)
const byMonthArb = fc.option(
  fc.uniqueArray(fc.integer({ min: 1, max: 12 }), { minLength: 1, maxLength: 4 }),
  { nil: undefined }
)
const byMonthDayArb = fc.option(
  fc.uniqueArray(fc.oneof(fc.integer({ min: 1, max: 28 }), fc.integer({ min: -28, max: -1 })), {
    minLength: 1,
    maxLength: 3,
  }),
  { nil: undefined }
)
const intervalArb = fc.option(fc.integer({ min: 1, max: 4 }), { nil: undefined })
const countArb = fc.integer({ min: 3, max: 10 })
const wkstArb = fc.option(weekdayArb, { nil: undefined })

// Fixed safe dtstart values (floating, UTC, zoned) for generated cases.
// Zoned cases use a date in January to avoid DST ambiguity in the BY* generator.
const dtstartVariants = [
  { dtstart: '1997-09-02T09:00:00', tzid: null as null },
  { dtstart: '1997-09-02T09:00:00Z', tzid: null as null },
  { dtstart: '2024-01-15T10:00:00', tzid: 'America/New_York' },
  { dtstart: '2024-01-15T10:00:00', tzid: 'Europe/Berlin' },
]
const dtstartArb = fc.constantFrom(...dtstartVariants)

// ---------------------------------------------------------------------------
// Per-FREQ option arbitraries (produce valid-by-construction RRuleOptions)
// ---------------------------------------------------------------------------

function yearlyOptionsArb(): fc.Arbitrary<RRuleOptions> {
  // YEARLY allows: BYMONTH, BYWEEKNO, BYYEARDAY, BYMONTHDAY, BYDAY (with ordinals),
  //               BYSETPOS (needs another BY*), BYHOUR, BYMINUTE, BYSECOND, WKST
  return fc
    .record({
      interval: intervalArb,
      count: countArb,
      wkst: wkstArb,
      byMonth: byMonthArb,
      byWeekNo: fc.option(
        fc.uniqueArray(fc.integer({ min: 1, max: 52 }), { minLength: 1, maxLength: 2 }),
        { nil: undefined }
      ),
      byYearDay: fc.option(
        fc.uniqueArray(
          fc.oneof(fc.integer({ min: 1, max: 365 }), fc.integer({ min: -365, max: -1 })),
          { minLength: 1, maxLength: 3 }
        ),
        { nil: undefined }
      ),
      byMonthDay: byMonthDayArb,
      byDayKind: fc.constantFrom('plain', 'ordinal', 'none'),
    })
    .chain(({ byDayKind, ...rest }) => {
      const byDayArb =
        byDayKind === 'plain'
          ? weekdaySetArb.map((d) => d as RRuleOptions['byDay'])
          : byDayKind === 'ordinal'
            ? weekdayWithOrdinalArb.map((d) => d as RRuleOptions['byDay'])
            : fc.constant(undefined as RRuleOptions['byDay'])
      return byDayArb.map((byDay) => ({
        freq: 'YEARLY' as Frequency,
        ...rest,
        byDay,
      }))
    })
}

function monthlyOptionsArb(): fc.Arbitrary<RRuleOptions> {
  // MONTHLY allows: BYMONTH, BYMONTHDAY, BYDAY (with ordinals), BYSETPOS (needs BY*),
  //               BYHOUR, BYMINUTE, BYSECOND, WKST. No BYWEEKNO, no BYYEARDAY.
  return fc
    .record({
      interval: intervalArb,
      count: countArb,
      wkst: wkstArb,
      byMonth: byMonthArb,
      byMonthDay: byMonthDayArb,
      byDayKind: fc.constantFrom('plain', 'ordinal', 'none'),
      includeSetPos: fc.boolean(),
    })
    .chain(({ byDayKind, includeSetPos, byMonthDay, ...rest }) => {
      const byDayArb =
        byDayKind === 'plain'
          ? weekdaySetArb.map((d) => d as RRuleOptions['byDay'])
          : byDayKind === 'ordinal'
            ? weekdayWithOrdinalArb.map((d) => d as RRuleOptions['byDay'])
            : fc.constant(undefined as RRuleOptions['byDay'])
      return byDayArb.chain((byDay) => {
        // BYSETPOS requires at least one other BY* rule.
        const hasByRule = byDay !== undefined || byMonthDay !== undefined
        const bySetPosArb =
          includeSetPos && hasByRule
            ? fc.option(
                fc.uniqueArray(
                  fc.oneof(fc.integer({ min: 1, max: 4 }), fc.integer({ min: -4, max: -1 })),
                  { minLength: 1, maxLength: 2 }
                ),
                { nil: undefined }
              )
            : fc.constant(undefined as number[] | undefined)
        return bySetPosArb.map((bySetPos) => ({
          freq: 'MONTHLY' as Frequency,
          ...rest,
          byMonthDay,
          byDay,
          bySetPos,
        }))
      })
    })
}

function weeklyOptionsArb(): fc.Arbitrary<RRuleOptions> {
  // WEEKLY allows: BYDAY (no ordinals), BYMONTH, BYHOUR, BYMINUTE, BYSECOND, WKST.
  // No BYMONTHDAY, no BYWEEKNO, no BYYEARDAY.
  return fc
    .record({
      interval: intervalArb,
      count: countArb,
      wkst: wkstArb,
      byMonth: byMonthArb,
      byDay: fc.option(
        weekdaySetArb.map((d) => d as RRuleOptions['byDay']),
        { nil: undefined }
      ),
      byHour: byHourArb,
      byMinute: byMinuteArb,
    })
    .map((opts) => ({ freq: 'WEEKLY' as Frequency, ...opts }))
}

function dailyOptionsArb(): fc.Arbitrary<RRuleOptions> {
  // DAILY allows: BYMONTH, BYMONTHDAY, BYHOUR, BYMINUTE, BYSECOND, BYSETPOS (needs BY*), WKST.
  // No BYDAY ordinals, no BYWEEKNO, no BYYEARDAY.
  return fc
    .record({
      interval: intervalArb,
      count: countArb,
      wkst: wkstArb,
      byMonth: byMonthArb,
      byMonthDay: byMonthDayArb,
      byHour: byHourArb,
      byMinute: byMinuteArb,
      bySecond: bySecondArb,
      includeSetPos: fc.boolean(),
    })
    .map(({ includeSetPos, byMonthDay, byHour, byMinute, bySecond, ...rest }) => {
      const hasByRule =
        byMonthDay !== undefined ||
        byHour !== undefined ||
        byMinute !== undefined ||
        bySecond !== undefined
      const bySetPos = includeSetPos && hasByRule ? [1] : undefined
      return {
        freq: 'DAILY' as Frequency,
        ...rest,
        byMonthDay,
        byHour,
        byMinute,
        bySecond,
        bySetPos,
      }
    })
}

function subDayOptionsArb(freq: 'HOURLY' | 'MINUTELY' | 'SECONDLY'): fc.Arbitrary<RRuleOptions> {
  return fc
    .record({
      interval: intervalArb,
      count: countArb,
      byHour: byHourArb,
      byMinute: byMinuteArb,
      bySecond: bySecondArb,
    })
    .map((opts) => ({ freq: freq as Frequency, ...opts }))
}

// ---------------------------------------------------------------------------
// Top-level case arbitrary
// ---------------------------------------------------------------------------

function caseArb(): fc.Arbitrary<{
  opts: RRuleOptions
  dtstart: string
  tzid: string | null
}> {
  return fc
    .record({
      freq: fc.constantFrom<Frequency>(
        'YEARLY',
        'MONTHLY',
        'WEEKLY',
        'DAILY',
        'HOURLY',
        'MINUTELY',
        'SECONDLY'
      ),
      dtstartVariant: dtstartArb,
    })
    .chain(({ freq, dtstartVariant }) => {
      const optsArb: fc.Arbitrary<RRuleOptions> =
        freq === 'YEARLY'
          ? yearlyOptionsArb()
          : freq === 'MONTHLY'
            ? monthlyOptionsArb()
            : freq === 'WEEKLY'
              ? weeklyOptionsArb()
              : freq === 'DAILY'
                ? dailyOptionsArb()
                : subDayOptionsArb(freq as 'HOURLY' | 'MINUTELY' | 'SECONDLY')

      return optsArb.map((opts) => ({
        opts,
        dtstart: dtstartVariant.dtstart,
        tzid: dtstartVariant.tzid,
      }))
    })
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sample `n` valid RRULE cases using fast-check. Candidate cases are passed
 * through rrule-ts validate() and any that fail are dropped. Uses a
 * deterministic seed for reproducibility.
 *
 * Returns at most `n` cases; may return fewer if many candidates are invalid.
 */
export function sampleCases(n: number, seed = 1337): OracleInput[] {
  const candidates = fc.sample(caseArb(), { numRuns: n * 3, seed })
  const results: OracleInput[] = []
  let idx = 0

  for (const { opts, dtstart, tzid } of candidates) {
    if (results.length >= n) break

    // Validate with rrule-ts — drop cases that violate RFC cross-field rules.
    const vResult = validate(opts)
    if (!vResult.ok) continue

    // Stringify to get the canonical RRULE string (without DTSTART line).
    // stringify() emits "DTSTART:...\nRRULE:..." when dtstart is present on opts,
    // but we manage dtstart separately in the corpus, so strip it here.
    const rruleLine = rruleOnly(opts)

    results.push({
      id: `gen-${idx++}`,
      label: `generated: FREQ=${opts.freq}`,
      rrule: rruleLine,
      dtstart,
      tzid,
      count: opts.count ?? 10,
    })
  }

  return results
}

/** Extract just the RRULE value from RRuleOptions, without DTSTART. */
function rruleOnly(opts: RRuleOptions): string {
  // Stringify without dtstart/tzid so we get only the RRULE line.
  const { dtstart: _d, tzid: _t, ...rruleOpts } = opts
  const str = stringify(rruleOpts)
  // stringify() returns "RRULE:FREQ=..." when no dtstart is present.
  return str.startsWith('RRULE:') ? str.slice(6) : str
}
