// fromText tests: golden parse tests and round-trip property test.
//
// Golden tests: for each EN toText example that produces a natural sentence,
// assert that fromText returns ok: true and the parsed options deep-equal
// the original rule (minus dtstart, tzid, wkst, bySecond which are not
// expressed in text).
//
// Round-trip property: generate valid RRuleOptions in the supported subset
// (no byWeekNo, byYearDay, bySecond, wkst, dtstart, tzid; no byMinute=[0]).
// Assert fromText(toText(x, {locale: en})).value deep-equals x.

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { fromText, toText, COMPLEX_RULE_FALLBACK } from './index.js'
import { en } from '../locales/en.js'
import { getTemporal } from '../temporal.js'
import type { Frequency, Weekday, WeekdayNum, RRuleOptions } from '../types.js'

/** Mon-Fri set for the 'last weekday' BYSETPOS=-1 pattern. Defined in test scope. */
const MON_TO_FRI: WeekdayNum[] = [
  { weekday: 'MO', ordinal: undefined },
  { weekday: 'TU', ordinal: undefined },
  { weekday: 'WE', ordinal: undefined },
  { weekday: 'TH', ordinal: undefined },
  { weekday: 'FR', ordinal: undefined },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseOk(text: string): RRuleOptions {
  const result = fromText(text)
  if (!result.ok) throw new Error(`fromText failed for "${text}": ${result.error}`)
  return result.value
}

// ---------------------------------------------------------------------------
// Golden parse tests: EN examples from the design plan
// ---------------------------------------------------------------------------

describe('fromText EN: frequency and interval', () => {
  it('every day -> FREQ=DAILY', () => {
    expect(parseOk('every day')).toEqual({ freq: 'DAILY' })
  })

  it('every 2 days -> FREQ=DAILY;INTERVAL=2', () => {
    expect(parseOk('every 2 days')).toEqual({ freq: 'DAILY', interval: 2 })
  })

  it('every week -> FREQ=WEEKLY', () => {
    expect(parseOk('every week')).toEqual({ freq: 'WEEKLY' })
  })

  it('every month -> FREQ=MONTHLY', () => {
    expect(parseOk('every month')).toEqual({ freq: 'MONTHLY' })
  })

  it('every year -> FREQ=YEARLY', () => {
    expect(parseOk('every year')).toEqual({ freq: 'YEARLY' })
  })

  it('every hour -> FREQ=HOURLY', () => {
    expect(parseOk('every hour')).toEqual({ freq: 'HOURLY' })
  })

  it('every 6 hours -> FREQ=HOURLY;INTERVAL=6', () => {
    expect(parseOk('every 6 hours')).toEqual({ freq: 'HOURLY', interval: 6 })
  })

  it('every minute -> FREQ=MINUTELY', () => {
    expect(parseOk('every minute')).toEqual({ freq: 'MINUTELY' })
  })

  it('every second -> FREQ=SECONDLY', () => {
    expect(parseOk('every second')).toEqual({ freq: 'SECONDLY' })
  })

  it('every 2 weeks -> FREQ=WEEKLY;INTERVAL=2', () => {
    expect(parseOk('every 2 weeks')).toEqual({ freq: 'WEEKLY', interval: 2 })
  })

  it('every 3 months -> FREQ=MONTHLY;INTERVAL=3', () => {
    expect(parseOk('every 3 months')).toEqual({ freq: 'MONTHLY', interval: 3 })
  })
})

describe('fromText EN: BYDAY plain weekdays', () => {
  it('every week on Monday -> BYDAY=MO', () => {
    expect(parseOk('every week on Monday')).toEqual({
      freq: 'WEEKLY',
      byDay: [{ weekday: 'MO', ordinal: undefined }],
    })
  })

  it('every week on Monday, Wednesday, and Friday -> BYDAY=MO,WE,FR', () => {
    expect(parseOk('every week on Monday, Wednesday, and Friday')).toEqual({
      freq: 'WEEKLY',
      byDay: [
        { weekday: 'MO', ordinal: undefined },
        { weekday: 'WE', ordinal: undefined },
        { weekday: 'FR', ordinal: undefined },
      ],
    })
  })

  it('every 2 weeks on Monday -> FREQ=WEEKLY;INTERVAL=2;BYDAY=MO', () => {
    expect(parseOk('every 2 weeks on Monday')).toEqual({
      freq: 'WEEKLY',
      interval: 2,
      byDay: [{ weekday: 'MO', ordinal: undefined }],
    })
  })

  it('every week on Monday and Tuesday -> BYDAY=MO,TU (two days)', () => {
    expect(parseOk('every week on Monday and Tuesday')).toEqual({
      freq: 'WEEKLY',
      byDay: [
        { weekday: 'MO', ordinal: undefined },
        { weekday: 'TU', ordinal: undefined },
      ],
    })
  })

  it('every day on Saturday and Sunday -> BYDAY=SA,SU', () => {
    expect(parseOk('every day on Saturday and Sunday')).toEqual({
      freq: 'DAILY',
      byDay: [
        { weekday: 'SA', ordinal: undefined },
        { weekday: 'SU', ordinal: undefined },
      ],
    })
  })
})

describe('fromText EN: BYDAY ordinal weekdays (MONTHLY/YEARLY)', () => {
  it('every month on the 1st Monday -> BYDAY=1MO', () => {
    expect(parseOk('every month on the 1st Monday')).toEqual({
      freq: 'MONTHLY',
      byDay: [{ weekday: 'MO', ordinal: 1 }],
    })
  })

  it('every month on the last Friday -> BYDAY=-1FR', () => {
    expect(parseOk('every month on the last Friday')).toEqual({
      freq: 'MONTHLY',
      byDay: [{ weekday: 'FR', ordinal: -1 }],
    })
  })

  it('every month on the 2nd Tuesday -> BYDAY=2TU', () => {
    expect(parseOk('every month on the 2nd Tuesday')).toEqual({
      freq: 'MONTHLY',
      byDay: [{ weekday: 'TU', ordinal: 2 }],
    })
  })

  it('every month on the 3rd Wednesday -> BYDAY=3WE', () => {
    expect(parseOk('every month on the 3rd Wednesday')).toEqual({
      freq: 'MONTHLY',
      byDay: [{ weekday: 'WE', ordinal: 3 }],
    })
  })

  it('every month on the 4th Thursday -> BYDAY=4TH', () => {
    expect(parseOk('every month on the 4th Thursday')).toEqual({
      freq: 'MONTHLY',
      byDay: [{ weekday: 'TH', ordinal: 4 }],
    })
  })

  it('every month on the 1st Monday and the last Friday (two ordinal entries)', () => {
    expect(parseOk('every month on the 1st Monday and the last Friday')).toEqual({
      freq: 'MONTHLY',
      byDay: [
        { weekday: 'MO', ordinal: 1 },
        { weekday: 'FR', ordinal: -1 },
      ],
    })
  })

  it('three ordinal BYDAY items with Oxford comma', () => {
    expect(
      parseOk('every month on the 1st Monday, the 2nd Tuesday, and the 3rd Wednesday')
    ).toEqual({
      freq: 'MONTHLY',
      byDay: [
        { weekday: 'MO', ordinal: 1 },
        { weekday: 'TU', ordinal: 2 },
        { weekday: 'WE', ordinal: 3 },
      ],
    })
  })
})

describe('fromText EN: BYMONTHDAY', () => {
  it('every month on the 1st -> BYMONTHDAY=1', () => {
    expect(parseOk('every month on the 1st')).toEqual({
      freq: 'MONTHLY',
      byMonthDay: [1],
    })
  })

  it('every month on the last day -> BYMONTHDAY=-1', () => {
    expect(parseOk('every month on the last day')).toEqual({
      freq: 'MONTHLY',
      byMonthDay: [-1],
    })
  })

  it('every month on the 15th -> BYMONTHDAY=15', () => {
    expect(parseOk('every month on the 15th')).toEqual({
      freq: 'MONTHLY',
      byMonthDay: [15],
    })
  })

  it('every month on the 1st and 15th -> BYMONTHDAY=1,15', () => {
    expect(parseOk('every month on the 1st and 15th')).toEqual({
      freq: 'MONTHLY',
      byMonthDay: [1, 15],
    })
  })

  it('every month on the 1st, 15th, and 28th -> BYMONTHDAY=1,15,28 (Oxford comma)', () => {
    expect(parseOk('every month on the 1st, 15th, and 28th')).toEqual({
      freq: 'MONTHLY',
      byMonthDay: [1, 15, 28],
    })
  })

  it('every month on the 2nd-to-last day -> BYMONTHDAY=-2', () => {
    expect(parseOk('every month on the 2nd-to-last day')).toEqual({
      freq: 'MONTHLY',
      byMonthDay: [-2],
    })
  })

  it('every month on the 3rd-to-last day -> BYMONTHDAY=-3', () => {
    expect(parseOk('every month on the 3rd-to-last day')).toEqual({
      freq: 'MONTHLY',
      byMonthDay: [-3],
    })
  })
})

describe('fromText EN: BYMONTH', () => {
  it('every year in January -> BYMONTH=1', () => {
    expect(parseOk('every year in January')).toEqual({
      freq: 'YEARLY',
      byMonth: [1],
    })
  })

  it('every year in January on the 1st -> BYMONTH=1;BYMONTHDAY=1', () => {
    expect(parseOk('every year in January on the 1st')).toEqual({
      freq: 'YEARLY',
      byMonth: [1],
      byMonthDay: [1],
    })
  })

  it('every year in March and September -> BYMONTH=3,9', () => {
    expect(parseOk('every year in March and September')).toEqual({
      freq: 'YEARLY',
      byMonth: [3, 9],
    })
  })

  it('every year in January, April, and July -> BYMONTH=1,4,7 (Oxford comma)', () => {
    expect(parseOk('every year in January, April, and July')).toEqual({
      freq: 'YEARLY',
      byMonth: [1, 4, 7],
    })
  })
})

describe('fromText EN: BYSETPOS patterns', () => {
  it('every month on the last weekday -> BYSETPOS=-1;BYDAY=Mon-Fri', () => {
    expect(parseOk('every month on the last weekday')).toEqual({
      freq: 'MONTHLY',
      bySetPos: [-1],
      byDay: [
        { weekday: 'MO', ordinal: undefined },
        { weekday: 'TU', ordinal: undefined },
        { weekday: 'WE', ordinal: undefined },
        { weekday: 'TH', ordinal: undefined },
        { weekday: 'FR', ordinal: undefined },
      ],
    })
  })
})

describe('fromText EN: COUNT and UNTIL', () => {
  it('every day, 5 times -> COUNT=5', () => {
    expect(parseOk('every day, 5 times')).toEqual({
      freq: 'DAILY',
      count: 5,
    })
  })

  it('every day, 1 time -> COUNT=1', () => {
    expect(parseOk('every day, 1 time')).toEqual({
      freq: 'DAILY',
      count: 1,
    })
  })

  it('every week until January 1, 2025 -> UNTIL=PlainDate(2025,1,1)', () => {
    const T = getTemporal()
    const result = fromText('every week until January 1, 2025')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.freq).toBe('WEEKLY')
    const until = result.value.until as Temporal.PlainDate
    expect(until.year).toBe(2025)
    expect(until.month).toBe(1)
    expect(until.day).toBe(1)
    void T
  })

  it('every day until June 15, 2025 at 9:00 -> UNTIL=PlainDateTime', () => {
    const result = fromText('every day until June 15, 2025 at 9:00')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const until = result.value.until as Temporal.PlainDateTime
    expect(until.year).toBe(2025)
    expect(until.month).toBe(6)
    expect(until.day).toBe(15)
    expect(until.hour).toBe(9)
    expect(until.minute).toBe(0)
  })
})

describe('fromText EN: BYHOUR and BYMINUTE', () => {
  it('every day at 9:00 -> BYHOUR=9 (no byMinute)', () => {
    expect(parseOk('every day at 9:00')).toEqual({
      freq: 'DAILY',
      byHour: [9],
    })
  })

  it('every day at 9:30 -> BYHOUR=9;BYMINUTE=30', () => {
    expect(parseOk('every day at 9:30')).toEqual({
      freq: 'DAILY',
      byHour: [9],
      byMinute: [30],
    })
  })

  it('every day at 9:00 and 17:00 -> BYHOUR=9,17 (no byMinute)', () => {
    expect(parseOk('every day at 9:00 and 17:00')).toEqual({
      freq: 'DAILY',
      byHour: [9, 17],
    })
  })

  it('every day at 9:30 and 17:30 -> BYHOUR=9,17;BYMINUTE=30', () => {
    expect(parseOk('every day at 9:30 and 17:30')).toEqual({
      freq: 'DAILY',
      byHour: [9, 17],
      byMinute: [30],
    })
  })
})

describe('fromText EN: combinations', () => {
  it('every year in January on the 1st Monday -> YEARLY;BYMONTH=1;BYDAY=1MO', () => {
    expect(parseOk('every year in January on the 1st Monday')).toEqual({
      freq: 'YEARLY',
      byMonth: [1],
      byDay: [{ weekday: 'MO', ordinal: 1 }],
    })
  })

  it('every week on Monday at 9:00 -> WEEKLY;BYDAY=MO;BYHOUR=9', () => {
    expect(parseOk('every week on Monday at 9:00')).toEqual({
      freq: 'WEEKLY',
      byDay: [{ weekday: 'MO', ordinal: undefined }],
      byHour: [9],
    })
  })

  it('every month on the 1st at 9:30 -> MONTHLY;BYMONTHDAY=1;BYHOUR=9;BYMINUTE=30', () => {
    expect(parseOk('every month on the 1st at 9:30')).toEqual({
      freq: 'MONTHLY',
      byMonthDay: [1],
      byHour: [9],
      byMinute: [30],
    })
  })

  it('every day, 10 times -> COUNT=10', () => {
    expect(parseOk('every day, 10 times')).toEqual({
      freq: 'DAILY',
      count: 10,
    })
  })
})

describe('fromText regression: negative BYDAY ordinals below -1 (BLOCKING)', () => {
  it('every month on the 2nd-to-last Monday -> BYDAY=-2MO', () => {
    expect(parseOk('every month on the 2nd-to-last Monday')).toEqual({
      freq: 'MONTHLY',
      byDay: [{ weekday: 'MO', ordinal: -2 }],
    })
  })

  it('every month on the 3rd-to-last Friday -> BYDAY=-3FR', () => {
    expect(parseOk('every month on the 3rd-to-last Friday')).toEqual({
      freq: 'MONTHLY',
      byDay: [{ weekday: 'FR', ordinal: -3 }],
    })
  })

  it('BYDAY=-2MO round-trips through toText and back', () => {
    const opts = { freq: 'MONTHLY' as const, byDay: [{ weekday: 'MO' as const, ordinal: -2 }] }
    const text = toText(opts, { locale: en })
    expect(text).toBe('every month on the 2nd-to-last Monday')
    expect(text).not.toBe(COMPLEX_RULE_FALLBACK)
    const parsed = fromText(text)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value).toEqual(opts)
  })

  it('BYDAY=-3FR round-trips through toText and back', () => {
    const opts = { freq: 'MONTHLY' as const, byDay: [{ weekday: 'FR' as const, ordinal: -3 }] }
    const text = toText(opts, { locale: en })
    expect(text).toBe('every month on the 3rd-to-last Friday')
    expect(text).not.toBe(COMPLEX_RULE_FALLBACK)
    const parsed = fromText(text)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value).toEqual(opts)
  })
})

describe('fromText regression: fallback strings return Err', () => {
  it('BYSETPOS=2 + Mon-Fri complex fallback is not parseable', () => {
    // toText returns the fallback; fromText must return Err for it.
    const result = fromText(COMPLEX_RULE_FALLBACK)
    expect(result.ok).toBe(false)
  })

  it('BYDAY+BYMONTHDAY complex fallback is not parseable', () => {
    const result = fromText(COMPLEX_RULE_FALLBACK)
    expect(result.ok).toBe(false)
  })
})

describe('fromText EN: error cases', () => {
  it('returns Err for empty string', () => {
    const result = fromText('')
    expect(result.ok).toBe(false)
  })

  it('returns Err for the complex-rule fallback string', () => {
    const result = fromText(COMPLEX_RULE_FALLBACK)
    expect(result.ok).toBe(false)
  })

  it('returns Err for German text (not valid EN toText output)', () => {
    // fromText is EN-only. German text is not valid EN toText output.
    const result = fromText('jeden Tag')
    expect(result.ok).toBe(false)
  })

  it('returns Err for free-form prose', () => {
    const result = fromText('once a day')
    expect(result.ok).toBe(false)
  })

  it('returns Err for garbage input', () => {
    const result = fromText('xyzzy zap bloop')
    expect(result.ok).toBe(false)
  })

  it('returns Err for trailing garbage after valid sentence', () => {
    const result = fromText('every day xyz')
    expect(result.ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Round-trip golden assertions (toText -> fromText -> deep equal)
// ---------------------------------------------------------------------------

describe('fromText EN: round-trip golden assertions', () => {
  function roundTrip(opts: RRuleOptions): RRuleOptions {
    const text = toText(opts, { locale: en })
    expect(text).not.toBe(COMPLEX_RULE_FALLBACK)
    const parsed = fromText(text)
    expect(parsed.ok, `fromText failed for "${text}": ${!parsed.ok ? parsed.error : ''}`).toBe(true)
    return parsed.ok ? parsed.value : opts
  }

  it('FREQ=DAILY round-trips', () => {
    expect(roundTrip({ freq: 'DAILY' })).toEqual({ freq: 'DAILY' })
  })

  it('FREQ=DAILY;INTERVAL=2 round-trips', () => {
    expect(roundTrip({ freq: 'DAILY', interval: 2 })).toEqual({ freq: 'DAILY', interval: 2 })
  })

  it('FREQ=WEEKLY;BYDAY=MO round-trips', () => {
    expect(roundTrip({ freq: 'WEEKLY', byDay: [{ weekday: 'MO', ordinal: undefined }] })).toEqual({
      freq: 'WEEKLY',
      byDay: [{ weekday: 'MO', ordinal: undefined }],
    })
  })

  it('FREQ=MONTHLY;BYDAY=1MO round-trips', () => {
    expect(roundTrip({ freq: 'MONTHLY', byDay: [{ weekday: 'MO', ordinal: 1 }] })).toEqual({
      freq: 'MONTHLY',
      byDay: [{ weekday: 'MO', ordinal: 1 }],
    })
  })

  it('FREQ=MONTHLY;BYDAY=-1FR round-trips', () => {
    expect(roundTrip({ freq: 'MONTHLY', byDay: [{ weekday: 'FR', ordinal: -1 }] })).toEqual({
      freq: 'MONTHLY',
      byDay: [{ weekday: 'FR', ordinal: -1 }],
    })
  })

  it('FREQ=MONTHLY;BYMONTHDAY=1 round-trips', () => {
    expect(roundTrip({ freq: 'MONTHLY', byMonthDay: [1] })).toEqual({
      freq: 'MONTHLY',
      byMonthDay: [1],
    })
  })

  it('FREQ=MONTHLY;BYMONTHDAY=-1 round-trips', () => {
    expect(roundTrip({ freq: 'MONTHLY', byMonthDay: [-1] })).toEqual({
      freq: 'MONTHLY',
      byMonthDay: [-1],
    })
  })

  it('FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1 round-trips', () => {
    expect(roundTrip({ freq: 'YEARLY', byMonth: [1], byMonthDay: [1] })).toEqual({
      freq: 'YEARLY',
      byMonth: [1],
      byMonthDay: [1],
    })
  })

  it('FREQ=DAILY;COUNT=5 round-trips', () => {
    expect(roundTrip({ freq: 'DAILY', count: 5 })).toEqual({ freq: 'DAILY', count: 5 })
  })

  it('FREQ=DAILY;BYHOUR=9;BYMINUTE=30 round-trips', () => {
    expect(roundTrip({ freq: 'DAILY', byHour: [9], byMinute: [30] })).toEqual({
      freq: 'DAILY',
      byHour: [9],
      byMinute: [30],
    })
  })

  it('FREQ=MONTHLY;BYSETPOS=-1;BYDAY=Mon-Fri round-trips', () => {
    expect(
      roundTrip({
        freq: 'MONTHLY',
        byDay: [
          { weekday: 'MO', ordinal: undefined },
          { weekday: 'TU', ordinal: undefined },
          { weekday: 'WE', ordinal: undefined },
          { weekday: 'TH', ordinal: undefined },
          { weekday: 'FR', ordinal: undefined },
        ],
        bySetPos: [-1],
      })
    ).toEqual({
      freq: 'MONTHLY',
      byDay: [
        { weekday: 'MO', ordinal: undefined },
        { weekday: 'TU', ordinal: undefined },
        { weekday: 'WE', ordinal: undefined },
        { weekday: 'TH', ordinal: undefined },
        { weekday: 'FR', ordinal: undefined },
      ],
      bySetPos: [-1],
    })
  })
})

// ---------------------------------------------------------------------------
// Round-trip PROPERTY test
// ---------------------------------------------------------------------------

const weekdayArb = fc.constantFrom<Weekday>('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU')

// Plain weekday set (no ordinals) for WEEKLY/DAILY.
const plainBydayArb: fc.Arbitrary<WeekdayNum[]> = fc
  .uniqueArray(weekdayArb, { minLength: 1, maxLength: 7 })
  .map((days) => days.map((w) => ({ ordinal: undefined as undefined, weekday: w })))

// Ordinal weekday set for MONTHLY/YEARLY (positive ordinals only, no -1 in ordinal position
// since that's handled via the last-ordinal path and is covered by golden tests).
// We include -1 to ensure it round-trips too.
const ordinalBydayArb: fc.Arbitrary<WeekdayNum[]> = fc
  .uniqueArray(weekdayArb, { minLength: 1, maxLength: 3 })
  .chain((days) =>
    fc
      .array(
        fc.integer({ min: -1, max: 4 }).filter((n) => n !== 0),
        { minLength: days.length, maxLength: days.length }
      )
      .map((ords) => days.map((w, i) => ({ weekday: w, ordinal: ords[i] })))
  )

// Simple rule: freq + optional interval + optional count.
const simpleRuleArb: fc.Arbitrary<RRuleOptions> = fc.record({
  freq: fc.constantFrom<Frequency>(
    'SECONDLY',
    'MINUTELY',
    'HOURLY',
    'DAILY',
    'WEEKLY',
    'MONTHLY',
    'YEARLY'
  ),
  interval: fc.option(fc.integer({ min: 2, max: 10 }), { nil: undefined }),
  count: fc.option(fc.integer({ min: 1, max: 20 }), { nil: undefined }),
})

// WEEKLY + plain BYDAY + optional count.
const weeklyBydayArb: fc.Arbitrary<RRuleOptions> = fc
  .record({
    interval: fc.option(fc.integer({ min: 2, max: 4 }), { nil: undefined }),
    count: fc.option(fc.integer({ min: 1, max: 10 }), { nil: undefined }),
    byDay: plainBydayArb,
  })
  .map((r) => ({ freq: 'WEEKLY' as Frequency, ...r }))

// MONTHLY + ordinal BYDAY + optional count.
const monthlyOrdinalBydayArb: fc.Arbitrary<RRuleOptions> = fc
  .record({
    count: fc.option(fc.integer({ min: 1, max: 10 }), { nil: undefined }),
    byDay: ordinalBydayArb,
  })
  .map((r) => ({ freq: 'MONTHLY' as Frequency, ...r }))

// MONTHLY + BYMONTHDAY (positive only, to avoid neg-ordinal ambiguity with 'last').
// We do test -1 via golden tests. For the property test, use positive values only.
const monthlyByMonthdayArb: fc.Arbitrary<RRuleOptions> = fc
  .record({
    count: fc.option(fc.integer({ min: 1, max: 10 }), { nil: undefined }),
    byMonthDay: fc.uniqueArray(fc.integer({ min: 1, max: 28 }), {
      minLength: 1,
      maxLength: 4,
    }),
  })
  .map((r) => ({ freq: 'MONTHLY' as Frequency, ...r }))

// YEARLY + BYMONTH + optional BYMONTHDAY (positive) + optional count.
const yearlyByMonthArb: fc.Arbitrary<RRuleOptions> = fc
  .record({
    count: fc.option(fc.integer({ min: 1, max: 10 }), { nil: undefined }),
    byMonth: fc.uniqueArray(fc.integer({ min: 1, max: 12 }), { minLength: 1, maxLength: 6 }),
    byMonthDay: fc.option(
      fc.uniqueArray(fc.integer({ min: 1, max: 28 }), { minLength: 1, maxLength: 3 }),
      { nil: undefined }
    ),
  })
  .map((r) => ({ freq: 'YEARLY' as Frequency, ...r }))

// MONTHLY + BYSETPOS=-1 + Mon-Fri (the "last weekday" pattern).
const lastWeekdayArb: fc.Arbitrary<RRuleOptions> = fc
  .record({
    count: fc.option(fc.integer({ min: 1, max: 10 }), { nil: undefined }),
  })
  .map((r) => ({
    freq: 'MONTHLY' as Frequency,
    ...r,
    bySetPos: [-1],
    byDay: [...MON_TO_FRI],
  }))

// Rule with BYHOUR + non-zero BYMINUTE (byMinute=[0] is indistinguishable from
// byMinute=undefined in the text and is excluded to keep the round-trip bijective).
const withByHourArb = (base: fc.Arbitrary<RRuleOptions>): fc.Arbitrary<RRuleOptions> =>
  fc
    .record({
      base,
      byHour: fc.uniqueArray(fc.integer({ min: 0, max: 23 }), { minLength: 1, maxLength: 3 }),
      byMinute: fc.option(
        // Only non-zero minutes: zero minutes are omitted from fromText output.
        fc.uniqueArray(fc.integer({ min: 1, max: 59 }), { minLength: 1, maxLength: 1 }),
        { nil: undefined }
      ),
    })
    .map(({ base: b, byHour, byMinute }) => ({
      ...b,
      byHour,
      ...(byMinute !== undefined ? { byMinute } : {}),
    }))
    // Exclude rules where BYSETPOS is present (BYSETPOS + BYHOUR = complex fallback).
    .filter((opts) => opts.bySetPos === undefined)

// Composite: any of the above.
const roundTripRuleArb: fc.Arbitrary<RRuleOptions> = fc.oneof(
  simpleRuleArb,
  weeklyBydayArb,
  monthlyOrdinalBydayArb,
  monthlyByMonthdayArb,
  yearlyByMonthArb,
  lastWeekdayArb,
  withByHourArb(simpleRuleArb),
  withByHourArb(weeklyBydayArb),
  withByHourArb(monthlyOrdinalBydayArb),
  withByHourArb(monthlyByMonthdayArb)
)

/**
 * Remove fields that fromText does not reconstruct (dtstart, tzid, wkst, bySecond)
 * and normalize undefined values out of the object for deep equality comparison.
 */
function normalizeForRoundTrip(opts: RRuleOptions): Partial<RRuleOptions> {
  const { dtstart: _ds, tzid: _tz, wkst: _wk, bySecond: _bs, ...rest } = opts
  // Remove keys whose value is undefined.
  return Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined))
}

describe('fromText EN: round-trip property test', () => {
  it('fromText(toText(x)) deep-equals x for all rules in the supported subset', () => {
    fc.assert(
      fc.property(roundTripRuleArb, (opts) => {
        const text = toText(opts, { locale: en })

        // Skip rules that fall through to the complex fallback (should not happen
        // for this subset, but guard defensively).
        if (text === COMPLEX_RULE_FALLBACK) return

        const parsed = fromText(text)
        expect(
          parsed.ok,
          `fromText failed for "${text}" (opts=${JSON.stringify(opts)}): ${!parsed.ok ? parsed.error : ''}`
        ).toBe(true)
        if (!parsed.ok) return

        const expected = normalizeForRoundTrip(opts)
        const actual = normalizeForRoundTrip(parsed.value)

        expect(actual).toEqual(expected)
      }),
      { numRuns: 500, seed: 42 }
    )
  })

  it('toText output for the supported subset never throws', () => {
    fc.assert(
      fc.property(roundTripRuleArb, (opts) => {
        expect(() => toText(opts, { locale: en })).not.toThrow()
      }),
      { numRuns: 200, seed: 42 }
    )
  })
})
