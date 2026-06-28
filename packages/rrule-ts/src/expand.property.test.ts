// Hermetic structural property tests for the expansion engine.
//
// These tests use fast-check to generate random valid RRULE configurations
// and assert algebraic invariants that MUST hold for any correct implementation,
// without consulting any external oracle (Python-free, CI-safe).
//
// Properties tested:
//   1. occurrences are strictly increasing in time (no duplicates)
//   2. COUNT is respected: at most COUNT occurrences returned
//   3. UNTIL is respected: no occurrence exceeds UNTIL (inclusive)
//   4. after/before window: expand(rule, {after,before}) == expand(rule).filter(in window)
//   5. limit option: expand(rule, limit) returns at most limit items
//   6. BYMONTH membership: every occurrence month is in BYMONTH list
//   7. BYDAY membership (plain weekdays): every occurrence weekday is in BYDAY
//   8. BYHOUR membership: every occurrence hour is in BYHOUR list
//   9. INTERVAL spacing (DAILY, no BY*): consecutive occurrences are INTERVAL days apart
//  10. parse(stringify(rule)) round-trip: re-serialising is idempotent
//  11. iterate() laziness: breaking after N steps from an infinite rule works safely

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { getTemporal } from './temporal.js'
import { expand, iterate } from './expand.js'
import { validate } from './validate.js'
import { parse } from './parse.js'
import { stringify } from './stringify.js'
import type { RRuleOptions, Frequency, Weekday, WeekdayNum } from './types.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** ISO day of week for each RFC weekday abbreviation (1=Mon ... 7=Sun). */
const WEEKDAY_ISO: Record<Weekday, number> = {
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
  SU: 7,
}

/**
 * Convert an occurrence to a stable ISO-like string for ordering comparisons.
 * Strips the [IANA/Name] annotation that Temporal.ZonedDateTime appends.
 */
function fmt(occ: unknown): string {
  return String((occ as { toString(): string }).toString()).replace(/\[.*\]$/, '')
}

// ---------------------------------------------------------------------------
// Sub-arbitraries shared across properties
// ---------------------------------------------------------------------------

const freqArb = fc.constantFrom<Frequency>('YEARLY', 'MONTHLY', 'WEEKLY', 'DAILY')

const weekdayArb = fc.constantFrom<Weekday>('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU')

// Plain weekday set (no ordinals) for WEEKLY/DAILY compatible tests
const plainBydayArb: fc.Arbitrary<WeekdayNum[]> = fc
  .uniqueArray(weekdayArb, { minLength: 1, maxLength: 4 })
  .map((days) => days.map((w) => ({ ordinal: undefined as undefined, weekday: w })))

// Keep years narrow so occurrences stay within a tractable range
const yearArb = fc.integer({ min: 2000, max: 2010 })
const monthArb = fc.integer({ min: 1, max: 12 })
// Day stays <= 28 so every month-year combination is valid
const dayArb = fc.integer({ min: 1, max: 28 })
const hourArb = fc.integer({ min: 0, max: 23 })
const minuteArb = fc.integer({ min: 0, max: 59 })
const secondArb = fc.integer({ min: 0, max: 59 })

/** Arbitrary PlainDateTime in a predictable range. */
const pdtArb: fc.Arbitrary<Temporal.PlainDateTime> = fc
  .record({
    year: yearArb,
    month: monthArb,
    day: dayArb,
    hour: hourArb,
    minute: minuteArb,
    second: secondArb,
  })
  .map(({ year, month, day, hour, minute, second }) =>
    getTemporal().PlainDateTime.from({ year, month, day, hour, minute, second })
  )

const intervalArb = fc.integer({ min: 1, max: 3 })
const countArb = fc.integer({ min: 2, max: 10 })

const byMonthArb: fc.Arbitrary<number[] | undefined> = fc.option(
  fc.uniqueArray(fc.integer({ min: 1, max: 12 }), { minLength: 1, maxLength: 4 }),
  { nil: undefined }
)

const byHourArb: fc.Arbitrary<number[] | undefined> = fc.option(
  fc.uniqueArray(fc.integer({ min: 0, max: 23 }), { minLength: 1, maxLength: 3 }),
  { nil: undefined }
)

// ---------------------------------------------------------------------------
// Composite rule arbitraries
// ---------------------------------------------------------------------------

/**
 * Generate a valid bounded rule (has COUNT) with PlainDateTime dtstart.
 * Passes validate() by construction for the properties we care about.
 */
const countedRuleArb: fc.Arbitrary<RRuleOptions> = fc
  .record({
    freq: freqArb,
    dtstart: pdtArb,
    count: countArb,
    interval: intervalArb,
  })
  .map(({ freq, dtstart, count, interval }) => ({
    freq,
    dtstart,
    count,
    interval,
  }))

/**
 * DAILY rule with no BY* modifiers, bounded by COUNT. Consecutive occurrences
 * are exactly INTERVAL days apart; useful for INTERVAL-spacing checks.
 */
const dailyNoByArb: fc.Arbitrary<RRuleOptions> = fc
  .record({ dtstart: pdtArb, count: countArb, interval: intervalArb })
  .map(({ dtstart, count, interval }) => ({
    freq: 'DAILY' as Frequency,
    dtstart,
    count,
    interval,
  }))

/**
 * Infinite rule: no COUNT, no UNTIL. Used for the laziness/iterate tests.
 * Simple DAILY with PlainDateTime to guarantee it never terminates naturally.
 */
const infiniteRuleArb: fc.Arbitrary<RRuleOptions> = fc
  .record({ dtstart: pdtArb, interval: intervalArb })
  .map(({ dtstart, interval }) => ({
    freq: 'DAILY' as Frequency,
    dtstart,
    interval,
  }))

/**
 * Rule with an UNTIL terminator matching the PlainDateTime dtstart type.
 * until is dtstart + daysOffset (always after dtstart, ensures >= 1 occurrence).
 */
const untilRuleArb: fc.Arbitrary<RRuleOptions> = pdtArb.chain((dtstart) =>
  fc.integer({ min: 1, max: 60 }).map((daysOffset) => {
    const until = dtstart.add({ days: daysOffset })
    return {
      freq: 'DAILY' as Frequency,
      dtstart,
      until,
      interval: 1,
    } satisfies RRuleOptions
  })
)

/**
 * Rule with BYMONTH set, YEARLY frequency, PlainDateTime dtstart.
 * The dtstart month is always in byMonth so at least one occurrence is produced.
 */
const byMonthRuleArb: fc.Arbitrary<RRuleOptions> = fc
  .record({
    dtstart: pdtArb,
    count: countArb,
    extraMonths: fc.uniqueArray(fc.integer({ min: 1, max: 12 }), { minLength: 0, maxLength: 3 }),
  })
  .map(({ dtstart, count, extraMonths }) => {
    const dtstartMonth = dtstart.month
    const byMonth = [...new Set([dtstartMonth, ...extraMonths])].sort((a, b) => a - b)
    return {
      freq: 'YEARLY' as Frequency,
      dtstart,
      count,
      byMonth,
    } satisfies RRuleOptions
  })

/**
 * Rule with plain BYDAY set (no ordinals), WEEKLY frequency, PlainDateTime dtstart.
 * The dtstart weekday is always in BYDAY so at least one occurrence is produced.
 */
const byDayRuleArb: fc.Arbitrary<RRuleOptions> = fc
  .record({
    dtstart: pdtArb,
    count: countArb,
    extraDays: fc.uniqueArray(weekdayArb, { minLength: 0, maxLength: 3 }),
    interval: intervalArb,
  })
  .map(({ dtstart, count, extraDays, interval }) => {
    const T = getTemporal()
    const dtstartPlain = T.PlainDate.from({
      year: dtstart.year,
      month: dtstart.month,
      day: dtstart.day,
    })
    // Find the Weekday name for dtstart's day of week
    const isoToWeekday: Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
    const dtstartWeekday: Weekday = isoToWeekday[dtstartPlain.dayOfWeek - 1]
    const weekdays: Weekday[] = [...new Set([dtstartWeekday, ...extraDays])]
    const byDay: WeekdayNum[] = weekdays.map((w) => ({ ordinal: undefined, weekday: w }))
    return {
      freq: 'WEEKLY' as Frequency,
      dtstart,
      count,
      interval,
      byDay,
    } satisfies RRuleOptions
  })

/**
 * Rule with BYHOUR set, HOURLY frequency, PlainDateTime dtstart.
 * The dtstart hour is always in BYHOUR so at least one occurrence is produced.
 */
const byHourRuleArb: fc.Arbitrary<RRuleOptions> = fc
  .record({
    dtstart: pdtArb,
    count: countArb,
    extraHours: fc.uniqueArray(fc.integer({ min: 0, max: 23 }), { minLength: 0, maxLength: 2 }),
  })
  .map(({ dtstart, count, extraHours }) => {
    const byHour = [...new Set([dtstart.hour, ...extraHours])].sort((a, b) => a - b)
    return {
      freq: 'HOURLY' as Frequency,
      dtstart,
      count,
      byHour,
    } satisfies RRuleOptions
  })

/**
 * Rule for round-trip (no dtstart, no until): simple RRULE-only options.
 * All fields are primitive scalars safe for structural deep equality.
 */
const roundTripRuleArb: fc.Arbitrary<RRuleOptions> = fc
  .record({
    freq: freqArb,
    count: fc.option(countArb, { nil: undefined }),
    interval: fc.option(intervalArb, { nil: undefined }),
    wkst: fc.option(weekdayArb, { nil: undefined }),
    byMonth: byMonthArb,
    byHour: byHourArb,
  })
  .filter((opts) => validate(opts).ok)

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe('expand() structural properties (property-based, hermetic)', () => {
  // -------------------------------------------------------------------------
  // Property 1: Strictly increasing — occurrences are always monotonically
  // increasing with no duplicates.
  // -------------------------------------------------------------------------
  it('occurrences are strictly increasing in time and unique', () => {
    fc.assert(
      fc.property(countedRuleArb, (opts) => {
        const occs = expand(opts, 30)
        if (occs.length < 2) return

        const keys = occs.map(fmt)
        for (let i = 1; i < keys.length; i++) {
          // Strict inequality: each key must be strictly greater than the previous.
          expect(
            keys[i] > keys[i - 1],
            `occurrence ${i} not strictly after ${i - 1}: ${keys[i - 1]} >= ${keys[i]}`
          ).toBe(true)
        }
      }),
      { numRuns: 200, seed: 42 }
    )
  })

  // -------------------------------------------------------------------------
  // Property 2: COUNT is respected — expand() never returns more than COUNT
  // occurrences when the rule specifies one.
  // -------------------------------------------------------------------------
  it('COUNT is respected: expand() yields at most COUNT occurrences', () => {
    fc.assert(
      fc.property(countedRuleArb, (opts) => {
        const count = opts.count!
        const occs = expand(opts)
        // Must be at most COUNT (may be fewer if the rule terminates first)
        expect(occs.length).toBeLessThanOrEqual(count)
        // At least 1 occurrence is always expected (dtstart is in range)
        expect(occs.length).toBeGreaterThanOrEqual(1)
      }),
      { numRuns: 200, seed: 42 }
    )
  })

  // -------------------------------------------------------------------------
  // Property 3: UNTIL is respected — no occurrence is after UNTIL (inclusive).
  // -------------------------------------------------------------------------
  it('UNTIL is respected: no occurrence exceeds UNTIL', () => {
    fc.assert(
      fc.property(untilRuleArb, (opts) => {
        const until = opts.until as Temporal.PlainDateTime
        const T = getTemporal()
        const occs = expand(opts)
        expect(occs.length).toBeGreaterThanOrEqual(1)
        for (const occ of occs) {
          const cmp = T.PlainDateTime.compare(occ as Temporal.PlainDateTime, until)
          expect(cmp, `occurrence ${fmt(occ)} is after UNTIL ${fmt(until)}`).toBeLessThanOrEqual(0)
        }
      }),
      { numRuns: 200, seed: 42 }
    )
  })

  // -------------------------------------------------------------------------
  // Property 4: after/before window — expand(rule, {after, before}) equals
  // expand(rule) filtered to the [after, before] inclusive window.
  // -------------------------------------------------------------------------
  it('after/before window matches filtering the full expansion', () => {
    fc.assert(
      fc.property(countedRuleArb, fc.nat({ max: 9 }), fc.nat({ max: 9 }), (opts, idx0, idx1) => {
        const all = expand(opts, 30)
        if (all.length < 2) return

        const lo = Math.min(idx0, idx1) % all.length
        const hi = Math.max(idx0, idx1) % all.length

        const after = all[lo]
        const before = all[hi]

        const windowed = expand(opts, { after, before })
        const expected = all.slice(lo, hi + 1)

        expect(windowed.map(fmt)).toEqual(expected.map(fmt))
      }),
      { numRuns: 100, seed: 42 }
    )
  })

  // -------------------------------------------------------------------------
  // Property 5: limit option — expand(rule, {limit: n}) never returns more
  // than n occurrences regardless of COUNT or rule cardinality.
  // -------------------------------------------------------------------------
  it('limit option is respected: at most limit occurrences returned', () => {
    fc.assert(
      fc.property(countedRuleArb, fc.integer({ min: 1, max: 5 }), (opts, limit) => {
        const occs = expand(opts, { limit })
        expect(occs.length).toBeLessThanOrEqual(limit)
      }),
      { numRuns: 200, seed: 42 }
    )
  })

  // -------------------------------------------------------------------------
  // Property 6: BYMONTH membership — every occurrence month is in BYMONTH.
  // -------------------------------------------------------------------------
  it('BYMONTH membership: every occurrence month is in the BYMONTH list', () => {
    fc.assert(
      fc.property(byMonthRuleArb, (opts) => {
        const byMonth = new Set(opts.byMonth!)
        const occs = expand(opts)
        expect(occs.length).toBeGreaterThanOrEqual(1)
        for (const occ of occs) {
          const month = (occ as Temporal.PlainDateTime).month
          expect(
            byMonth.has(month),
            `occurrence month ${month} not in BYMONTH ${[...byMonth]}`
          ).toBe(true)
        }
      }),
      { numRuns: 200, seed: 42 }
    )
  })

  // -------------------------------------------------------------------------
  // Property 7: BYDAY membership — for rules with plain (no-ordinal) BYDAY and
  // WEEKLY frequency, every occurrence falls on one of the specified weekdays.
  // -------------------------------------------------------------------------
  it('BYDAY membership (plain weekdays): every occurrence weekday is in BYDAY', () => {
    fc.assert(
      fc.property(byDayRuleArb, (opts) => {
        const allowedDows = new Set(opts.byDay!.map((d) => WEEKDAY_ISO[d.weekday]))
        const T = getTemporal()
        const occs = expand(opts)
        expect(occs.length).toBeGreaterThanOrEqual(1)
        for (const occ of occs) {
          const pdt = occ as Temporal.PlainDateTime
          const pd = T.PlainDate.from({ year: pdt.year, month: pdt.month, day: pdt.day })
          expect(
            allowedDows.has(pd.dayOfWeek),
            `occurrence ${fmt(occ)} dayOfWeek=${pd.dayOfWeek} not in BYDAY ${[...allowedDows]}`
          ).toBe(true)
        }
      }),
      { numRuns: 200, seed: 42 }
    )
  })

  // -------------------------------------------------------------------------
  // Property 8: BYHOUR membership — every occurrence hour is in BYHOUR list.
  // -------------------------------------------------------------------------
  it('BYHOUR membership: every occurrence hour is in the BYHOUR list', () => {
    fc.assert(
      fc.property(byHourRuleArb, (opts) => {
        const byHour = new Set(opts.byHour!)
        const occs = expand(opts)
        expect(occs.length).toBeGreaterThanOrEqual(1)
        for (const occ of occs) {
          const hour = (occ as Temporal.PlainDateTime).hour
          expect(byHour.has(hour), `occurrence hour ${hour} not in BYHOUR ${[...byHour]}`).toBe(
            true
          )
        }
      }),
      { numRuns: 200, seed: 42 }
    )
  })

  // -------------------------------------------------------------------------
  // Property 9: INTERVAL spacing (DAILY, no BY*) — consecutive occurrences are
  // exactly INTERVAL days apart when no BY* rules alter the period structure.
  // -------------------------------------------------------------------------
  it('INTERVAL spacing (DAILY, no BY*): consecutive occurrences are exactly INTERVAL days apart', () => {
    fc.assert(
      fc.property(dailyNoByArb, (opts) => {
        const interval = opts.interval!
        const T = getTemporal()
        const occs = expand(opts)
        for (let i = 1; i < occs.length; i++) {
          const prev = occs[i - 1] as Temporal.PlainDateTime
          const curr = occs[i] as Temporal.PlainDateTime
          const diff = prev.until(curr, { largestUnit: 'day' }).days
          expect(
            diff,
            `gap between occurrence ${i - 1} and ${i} should be ${interval} day(s)`
          ).toBe(interval)
        }
      }),
      { numRuns: 200, seed: 42 }
    )
  })

  // -------------------------------------------------------------------------
  // Property 10: parse(stringify(rule)) round-trip — serialising an RRuleOptions
  // and parsing it back gives a result that re-serialises to the same string.
  // No Temporal objects involved: dtstart/until are absent from roundTripRuleArb.
  // -------------------------------------------------------------------------
  it('stringify → parse → stringify is idempotent (round-trip)', () => {
    fc.assert(
      fc.property(roundTripRuleArb, (opts) => {
        const str1 = stringify(opts)

        const parsed = parse(str1)
        expect(parsed.ok, `parse failed on "${str1}"`).toBe(true)
        if (!parsed.ok) return

        // The re-serialised form must equal the original canonical string.
        const str2 = stringify(parsed.value)
        expect(str2).toBe(str1)
      }),
      { numRuns: 300, seed: 42 }
    )
  })

  // -------------------------------------------------------------------------
  // Property 11: iterate() laziness — breaking from an infinite rule after N
  // steps yields exactly N occurrences and never hangs. This validates that the
  // generator honours JavaScript's early-return protocol.
  // -------------------------------------------------------------------------
  it('iterate() is lazy: taking N items from an infinite rule returns exactly N', () => {
    const TAKE = 5
    fc.assert(
      fc.property(infiniteRuleArb, (opts) => {
        let n = 0
        for (const _ of iterate(opts)) {
          n++
          if (n >= TAKE) break
        }
        expect(n).toBe(TAKE)
      }),
      { numRuns: 100, seed: 42 }
    )
  })

  // -------------------------------------------------------------------------
  // Property 11b: limit(1) applied to any counted rule yields a single-item
  // array that matches the first occurrence of the unconstrained expansion.
  // -------------------------------------------------------------------------
  it('limit(1) always returns the first occurrence', () => {
    fc.assert(
      fc.property(countedRuleArb, (opts) => {
        const first = expand(opts, { limit: 1 })
        const all = expand(opts)
        expect(first.length).toBe(1)
        expect(fmt(first[0])).toBe(fmt(all[0]))
      }),
      { numRuns: 200, seed: 42 }
    )
  })

  // -------------------------------------------------------------------------
  // Property 12: BY* limit INTERSECTION for YEARLY with BYMONTHDAY+BYYEARDAY.
  //
  // RFC 5545 §3.8.5.3: when multiple limit BY* parts are present, an occurrence
  // must satisfy ALL of them (intersection), not ANY (union). Specifically, for
  // YEARLY with both BYMONTHDAY and BYYEARDAY, every returned occurrence must
  // have its day-of-month in BYMONTHDAY AND its day-of-year in BYYEARDAY.
  // -------------------------------------------------------------------------
  it('BY* INTERSECTION: YEARLY BYMONTHDAY+BYYEARDAY occurrences satisfy both constraints', () => {
    const yearlyBothArb: fc.Arbitrary<RRuleOptions> = fc
      .record({
        dtstart: pdtArb,
        count: countArb,
        byMonthDay: fc.uniqueArray(fc.integer({ min: 1, max: 28 }), {
          minLength: 1,
          maxLength: 3,
        }),
        byYearDay: fc.uniqueArray(fc.integer({ min: 1, max: 365 }), {
          minLength: 1,
          maxLength: 3,
        }),
      })
      .map(({ dtstart, count, byMonthDay, byYearDay }) => ({
        freq: 'YEARLY' as Frequency,
        dtstart,
        count,
        byMonthDay,
        byYearDay,
      }))

    fc.assert(
      fc.property(yearlyBothArb, (opts) => {
        const T = getTemporal()
        const byMonthDaySet = new Set(opts.byMonthDay!)
        const byYearDaySet = new Set(opts.byYearDay!)

        const occs = expand(opts)
        for (const occ of occs) {
          const pdt = occ as Temporal.PlainDateTime
          const md = pdt.day

          // Every occurrence's monthday must be in BYMONTHDAY.
          expect(
            byMonthDaySet.has(md),
            `occurrence ${fmt(occ)} day=${md} not in BYMONTHDAY ${[...byMonthDaySet]}`
          ).toBe(true)

          // Every occurrence's yearday must be in BYYEARDAY.
          const jan1 = T.PlainDate.from({ year: pdt.year, month: 1, day: 1 })
          const occDate = T.PlainDate.from({ year: pdt.year, month: pdt.month, day: pdt.day })
          const yd = occDate.since(jan1, { largestUnit: 'day' }).days + 1
          expect(
            byYearDaySet.has(yd),
            `occurrence ${fmt(occ)} yearday=${yd} not in BYYEARDAY ${[...byYearDaySet]}`
          ).toBe(true)
        }
      }),
      { numRuns: 200, seed: 42 }
    )
  })
})
