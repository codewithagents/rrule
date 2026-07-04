// Property-based tests for toText.
//
// Core property: toText(x, {locale: en}) NEVER throws for any RRuleOptions x
// that passes validate(). The output is always a string: either a natural
// sentence or the documented fallback '(complex recurrence rule)'.
//
// A secondary property validates that the fallback is only produced when the
// rule contains a field that cannot be naturally phrased (byWeekNo, byYearDay,
// or a complex bySetPos combination).

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { toText, COMPLEX_RULE_FALLBACK } from './index.js'
import { validate } from '../validate.js'
import type { Frequency, Weekday, RRuleOptions } from '../types.js'

// ---------------------------------------------------------------------------
// Sub-arbitraries
// ---------------------------------------------------------------------------

const freqArb = fc.constantFrom<Frequency>(
  'SECONDLY',
  'MINUTELY',
  'HOURLY',
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'YEARLY'
)

const weekdayArb = fc.constantFrom<Weekday>('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU')

const plainWeekdaySetArb = fc
  .uniqueArray(weekdayArb, { minLength: 1, maxLength: 7 })
  .map((days) => days.map((w) => ({ ordinal: undefined as undefined, weekday: w })))

const ordinalBydayArb = fc.uniqueArray(weekdayArb, { minLength: 1, maxLength: 4 }).chain((days) =>
  fc
    .array(
      fc.integer({ min: -4, max: 4 }).filter((n) => n !== 0),
      {
        minLength: days.length,
        maxLength: days.length,
      }
    )
    .map((ordinals) => days.map((w, i) => ({ ordinal: ordinals[i], weekday: w })))
)

// ---------------------------------------------------------------------------
// Rule arbitraries (all generate options that are passed through validate())
// ---------------------------------------------------------------------------

/** Simple rule: freq + optional interval + optional count. No BY* parts. */
const simpleRuleArb: fc.Arbitrary<RRuleOptions> = fc
  .record({
    freq: freqArb,
    interval: fc.option(fc.integer({ min: 1, max: 10 }), { nil: undefined }),
    count: fc.option(fc.integer({ min: 1, max: 20 }), { nil: undefined }),
  })
  .filter((opts) => validate(opts).ok)

/** WEEKLY rule with plain BYDAY weekday set. */
const weeklyBydayArb: fc.Arbitrary<RRuleOptions> = fc
  .record({
    interval: fc.option(fc.integer({ min: 1, max: 4 }), { nil: undefined }),
    count: fc.option(fc.integer({ min: 1, max: 10 }), { nil: undefined }),
    byDay: plainWeekdaySetArb,
  })
  .map((r) => ({ freq: 'WEEKLY' as Frequency, ...r }))
  .filter((opts) => validate(opts).ok)

/** MONTHLY rule with ordinal BYDAY. */
const monthlyOrdinalBydayArb: fc.Arbitrary<RRuleOptions> = fc
  .record({
    count: fc.option(fc.integer({ min: 1, max: 10 }), { nil: undefined }),
    byDay: ordinalBydayArb,
  })
  .map((r) => ({ freq: 'MONTHLY' as Frequency, ...r }))
  .filter((opts) => validate(opts).ok)

/** MONTHLY rule with BYMONTHDAY. */
const monthlyByMonthdayArb: fc.Arbitrary<RRuleOptions> = fc
  .record({
    count: fc.option(fc.integer({ min: 1, max: 10 }), { nil: undefined }),
    byMonthDay: fc.uniqueArray(
      fc.integer({ min: -28, max: 28 }).filter((n) => n !== 0),
      { minLength: 1, maxLength: 5 }
    ),
  })
  .map((r) => ({ freq: 'MONTHLY' as Frequency, ...r }))
  .filter((opts) => validate(opts).ok)

/** YEARLY rule with BYMONTH. */
const yearlyByMonthArb: fc.Arbitrary<RRuleOptions> = fc
  .record({
    count: fc.option(fc.integer({ min: 1, max: 10 }), { nil: undefined }),
    byMonth: fc.uniqueArray(fc.integer({ min: 1, max: 12 }), { minLength: 1, maxLength: 6 }),
  })
  .map((r) => ({ freq: 'YEARLY' as Frequency, ...r }))
  .filter((opts) => validate(opts).ok)

/** YEARLY rule with BYWEEKNO (should always return fallback). */
const yearlyByWeekNoArb: fc.Arbitrary<RRuleOptions> = fc
  .record({
    count: fc.option(fc.integer({ min: 1, max: 10 }), { nil: undefined }),
    byWeekNo: fc.uniqueArray(fc.integer({ min: 1, max: 53 }), { minLength: 1, maxLength: 5 }),
  })
  .map((r) => ({ freq: 'YEARLY' as Frequency, ...r }))
  .filter((opts) => validate(opts).ok)

/** YEARLY rule with BYYEARDAY (should always return fallback). */
const yearlyByYearDayArb: fc.Arbitrary<RRuleOptions> = fc
  .record({
    count: fc.option(fc.integer({ min: 1, max: 10 }), { nil: undefined }),
    byYearDay: fc.uniqueArray(fc.integer({ min: 1, max: 366 }), { minLength: 1, maxLength: 5 }),
  })
  .map((r) => ({ freq: 'YEARLY' as Frequency, ...r }))
  .filter((opts) => validate(opts).ok)

/** Any rule with BYHOUR (and optional BYMINUTE). */
const byHourArb: fc.Arbitrary<RRuleOptions> = fc
  .record({
    freq: freqArb,
    count: fc.option(fc.integer({ min: 1, max: 10 }), { nil: undefined }),
    byHour: fc.uniqueArray(fc.integer({ min: 0, max: 23 }), { minLength: 1, maxLength: 4 }),
    byMinute: fc.option(
      fc.uniqueArray(fc.integer({ min: 0, max: 59 }), { minLength: 1, maxLength: 4 }),
      { nil: undefined }
    ),
  })
  .filter((opts) => validate(opts).ok)

/** MONTHLY rule with single BYSETPOS + single plain weekday. */
const bySetPosSingleArb: fc.Arbitrary<RRuleOptions> = fc
  .record({
    count: fc.option(fc.integer({ min: 1, max: 10 }), { nil: undefined }),
    byDay: fc
      .constantFrom<Weekday>('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU')
      .map((w) => [{ ordinal: undefined as undefined, weekday: w }]),
    bySetPos: fc
      .integer({ min: -4, max: 4 })
      .filter((n) => n !== 0)
      .map((n) => [n]),
  })
  .map((r) => ({ freq: 'MONTHLY' as Frequency, ...r }))
  .filter((opts) => validate(opts).ok)

/** Composite: any of the above rule types. */
const anyValidRuleArb: fc.Arbitrary<RRuleOptions> = fc.oneof(
  simpleRuleArb,
  weeklyBydayArb,
  monthlyOrdinalBydayArb,
  monthlyByMonthdayArb,
  yearlyByMonthArb,
  yearlyByWeekNoArb,
  yearlyByYearDayArb,
  byHourArb,
  bySetPosSingleArb
)

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe('toText property: never throws for any valid RRuleOptions', () => {
  it('does not throw for simple freq+interval+count rules', () => {
    fc.assert(
      fc.property(simpleRuleArb, (opts) => {
        let result: string
        expect(() => {
          result = toText(opts)
        }).not.toThrow()
        expect(typeof result!).toBe('string')
        expect(result!.length).toBeGreaterThan(0)
      }),
      { numRuns: 300, seed: 42 }
    )
  })

  it('does not throw for WEEKLY + plain BYDAY rules', () => {
    fc.assert(
      fc.property(weeklyBydayArb, (opts) => {
        let result: string
        expect(() => {
          result = toText(opts)
        }).not.toThrow()
        expect(typeof result!).toBe('string')
      }),
      { numRuns: 200, seed: 42 }
    )
  })

  it('does not throw for MONTHLY + ordinal BYDAY rules', () => {
    fc.assert(
      fc.property(monthlyOrdinalBydayArb, (opts) => {
        let result: string
        expect(() => {
          result = toText(opts)
        }).not.toThrow()
        expect(typeof result!).toBe('string')
      }),
      { numRuns: 200, seed: 42 }
    )
  })

  it('does not throw for MONTHLY + BYMONTHDAY rules', () => {
    fc.assert(
      fc.property(monthlyByMonthdayArb, (opts) => {
        let result: string
        expect(() => {
          result = toText(opts)
        }).not.toThrow()
        expect(typeof result!).toBe('string')
      }),
      { numRuns: 200, seed: 42 }
    )
  })

  it('does not throw for YEARLY + BYMONTH rules', () => {
    fc.assert(
      fc.property(yearlyByMonthArb, (opts) => {
        let result: string
        expect(() => {
          result = toText(opts)
        }).not.toThrow()
        expect(typeof result!).toBe('string')
      }),
      { numRuns: 200, seed: 42 }
    )
  })

  it('does not throw for rules with BYHOUR / BYMINUTE', () => {
    fc.assert(
      fc.property(byHourArb, (opts) => {
        let result: string
        expect(() => {
          result = toText(opts)
        }).not.toThrow()
        expect(typeof result!).toBe('string')
      }),
      { numRuns: 200, seed: 42 }
    )
  })

  it('does not throw for MONTHLY + BYSETPOS + single weekday', () => {
    fc.assert(
      fc.property(bySetPosSingleArb, (opts) => {
        let result: string
        expect(() => {
          result = toText(opts)
        }).not.toThrow()
        expect(typeof result!).toBe('string')
      }),
      { numRuns: 200, seed: 42 }
    )
  })

  it('does not throw for any valid rule (composite)', () => {
    fc.assert(
      fc.property(anyValidRuleArb, (opts) => {
        let result: string
        expect(() => {
          result = toText(opts)
        }).not.toThrow()
        expect(typeof result!).toBe('string')
        expect(result!.length).toBeGreaterThan(0)
      }),
      { numRuns: 500, seed: 42 }
    )
  })
})

describe('toText property: fallback appears only for non-phraseable rules', () => {
  it('BYWEEKNO rules always produce the fallback string', () => {
    fc.assert(
      fc.property(yearlyByWeekNoArb, (opts) => {
        expect(toText(opts)).toBe(COMPLEX_RULE_FALLBACK)
      }),
      { numRuns: 100, seed: 42 }
    )
  })

  it('BYYEARDAY rules always produce the fallback string', () => {
    fc.assert(
      fc.property(yearlyByYearDayArb, (opts) => {
        expect(toText(opts)).toBe(COMPLEX_RULE_FALLBACK)
      }),
      { numRuns: 100, seed: 42 }
    )
  })

  it('non-BYWEEKNO non-BYYEARDAY simple rules never produce the fallback', () => {
    fc.assert(
      fc.property(simpleRuleArb, (opts) => {
        expect(toText(opts)).not.toBe(COMPLEX_RULE_FALLBACK)
      }),
      { numRuns: 300, seed: 42 }
    )
  })
})

describe('toText property: output always starts with "every"', () => {
  it('non-fallback rules start with "every" in EN locale', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          simpleRuleArb,
          weeklyBydayArb,
          monthlyOrdinalBydayArb,
          monthlyByMonthdayArb,
          yearlyByMonthArb
        ),
        (opts) => {
          const result = toText(opts)
          expect(result.startsWith('every')).toBe(true)
        }
      ),
      { numRuns: 400, seed: 42 }
    )
  })
})
