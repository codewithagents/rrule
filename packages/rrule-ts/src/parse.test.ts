import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { parse } from './parse.js'
import { stringify } from './stringify.js'
import { getTemporal } from './temporal.js'
import type { RRuleOptions } from './types.js'

// ---------------------------------------------------------------------------
// Happy path: parse basic RRULE strings
// ---------------------------------------------------------------------------

describe('parse - happy path', () => {
  it('parses a bare RRULE value (no prefix)', () => {
    const r = parse('FREQ=DAILY')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.freq).toBe('DAILY')
  })

  it('parses with RRULE: prefix', () => {
    const r = parse('RRULE:FREQ=WEEKLY')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.freq).toBe('WEEKLY')
  })

  it('parses all six non-DAILY frequency values', () => {
    for (const freq of ['SECONDLY', 'MINUTELY', 'HOURLY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const) {
      const r = parse(`RRULE:FREQ=${freq}`)
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.value.freq).toBe(freq)
    }
  })

  it('parses COUNT', () => {
    const r = parse('RRULE:FREQ=DAILY;COUNT=5')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.count).toBe(5)
  })

  it('parses INTERVAL', () => {
    const r = parse('RRULE:FREQ=WEEKLY;INTERVAL=2')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.interval).toBe(2)
  })

  it('parses WKST', () => {
    const r = parse('RRULE:FREQ=WEEKLY;WKST=SU')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.wkst).toBe('SU')
  })

  it('parses BYDAY with multiple plain weekdays', () => {
    const r = parse('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.byDay).toEqual([
        { ordinal: undefined, weekday: 'MO' },
        { ordinal: undefined, weekday: 'WE' },
        { ordinal: undefined, weekday: 'FR' },
      ])
    }
  })

  it('parses BYDAY with ordinal weekdays', () => {
    const r = parse('RRULE:FREQ=MONTHLY;BYDAY=2MO,-1FR')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.byDay).toEqual([
        { ordinal: 2, weekday: 'MO' },
        { ordinal: -1, weekday: 'FR' },
      ])
    }
  })

  it('parses BYMONTH, BYMONTHDAY, BYYEARDAY, BYWEEKNO', () => {
    const r = parse('RRULE:FREQ=YEARLY;BYMONTH=1,12;BYMONTHDAY=1,-1;BYYEARDAY=1,365;BYWEEKNO=1,52')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.byMonth).toEqual([1, 12])
      expect(r.value.byMonthDay).toEqual([1, -1])
      expect(r.value.byYearDay).toEqual([1, 365])
      expect(r.value.byWeekNo).toEqual([1, 52])
    }
  })

  it('parses BYHOUR, BYMINUTE, BYSECOND, BYSETPOS', () => {
    const r = parse('RRULE:FREQ=DAILY;BYHOUR=9,17;BYMINUTE=0,30;BYSECOND=0;BYSETPOS=1,-1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.byHour).toEqual([9, 17])
      expect(r.value.byMinute).toEqual([0, 30])
      expect(r.value.bySecond).toEqual([0])
      expect(r.value.bySetPos).toEqual([1, -1])
    }
  })

  it('parses UNTIL as PlainDate (date-only)', () => {
    const r = parse('RRULE:FREQ=DAILY;UNTIL=20241231')
    expect(r.ok).toBe(true)
    if (r.ok) {
      const until = r.value.until
      expect(until).toBeDefined()
      // PlainDate has year but no hour
      expect(until).toHaveProperty('year', 2024)
      expect(until).not.toHaveProperty('hour')
    }
  })

  it('parses UNTIL as Instant (UTC datetime)', () => {
    const r = parse('RRULE:FREQ=DAILY;UNTIL=20241231T235959Z')
    expect(r.ok).toBe(true)
    if (r.ok) {
      const until = r.value.until
      expect(until).toBeDefined()
      // Instant has epochMilliseconds but no year
      expect(until).toHaveProperty('epochMilliseconds')
      expect(until).not.toHaveProperty('year')
    }
  })

  it('parses UNTIL as PlainDateTime (floating)', () => {
    const r = parse('RRULE:FREQ=DAILY;UNTIL=20241231T235959')
    expect(r.ok).toBe(true)
    if (r.ok) {
      const until = r.value.until
      expect(until).toHaveProperty('year', 2024)
      expect(until).toHaveProperty('hour', 23)
      expect(until).not.toHaveProperty('timeZoneId')
    }
  })

  it('parses DTSTART as UTC Instant', () => {
    const r = parse('DTSTART:20240101T090000Z\nRRULE:FREQ=WEEKLY')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.dtstart).toHaveProperty('epochMilliseconds')
    }
  })

  it('parses DTSTART as PlainDate', () => {
    const r = parse('DTSTART:20240101\nRRULE:FREQ=WEEKLY')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.dtstart).toHaveProperty('year', 2024)
      expect(r.value.dtstart).not.toHaveProperty('hour')
    }
  })

  it('parses DTSTART;TZID= as ZonedDateTime', () => {
    const r = parse('DTSTART;TZID=Europe/Berlin:20240101T090000\nRRULE:FREQ=WEEKLY')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.dtstart).toHaveProperty('timeZoneId', 'Europe/Berlin')
      expect(r.value.tzid).toBe('Europe/Berlin')
    }
  })

  it('parses DTSTART as floating PlainDateTime', () => {
    const r = parse('DTSTART:20240101T090000\nRRULE:FREQ=WEEKLY')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.dtstart).toHaveProperty('year', 2024)
      expect(r.value.dtstart).toHaveProperty('hour', 9)
      expect(r.value.dtstart).not.toHaveProperty('timeZoneId')
    }
  })

  it('ignores blank lines', () => {
    const r = parse('\nRRULE:FREQ=DAILY\n')
    expect(r.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Sad path: parse returns Err on invalid input
// ---------------------------------------------------------------------------

describe('parse - sad path', () => {
  it('returns Err when input is empty', () => {
    const r = parse('  ')
    expect(r.ok).toBe(false)
  })

  it('returns Err when FREQ is missing', () => {
    const r = parse('RRULE:COUNT=3')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('FREQ')
  })

  it('returns Err on invalid FREQ value', () => {
    const r = parse('RRULE:FREQ=FORTNIGHTLY')
    expect(r.ok).toBe(false)
  })

  it('returns Err on duplicate RRULE part', () => {
    const r = parse('RRULE:FREQ=DAILY;FREQ=WEEKLY')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('duplicate')
  })

  it('returns Err on unknown RRULE part', () => {
    const r = parse('RRULE:FREQ=DAILY;BOGUS=1')
    expect(r.ok).toBe(false)
  })

  it('returns Err on invalid COUNT (non-integer)', () => {
    const r = parse('RRULE:FREQ=DAILY;COUNT=abc')
    expect(r.ok).toBe(false)
  })

  it('returns Err on invalid INTERVAL (float)', () => {
    const r = parse('RRULE:FREQ=DAILY;INTERVAL=1.5')
    expect(r.ok).toBe(false)
  })

  it('returns Err on BYDAY ordinal of 0', () => {
    const r = parse('RRULE:FREQ=MONTHLY;BYDAY=0MO')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('zero')
  })

  it('returns Err on invalid BYDAY entry', () => {
    const r = parse('RRULE:FREQ=WEEKLY;BYDAY=XX')
    expect(r.ok).toBe(false)
  })

  it('returns Err on unknown content line', () => {
    const r = parse('DTSTART:20240101\nSUMMARY:Meeting\nRRULE:FREQ=DAILY')
    expect(r.ok).toBe(false)
  })

  it('returns Err on malformed DTSTART (no colon)', () => {
    const r = parse('DTSTART;TZID=UTC\nRRULE:FREQ=DAILY')
    expect(r.ok).toBe(false)
  })

  it('returns Err when RRULE part has no equals sign', () => {
    const r = parse('RRULE:FREQ=DAILY;BADPART')
    expect(r.ok).toBe(false)
  })

  it('returns Err on invalid WKST weekday', () => {
    const r = parse('RRULE:FREQ=WEEKLY;WKST=XY')
    expect(r.ok).toBe(false)
  })

  it('returns Err on non-integer in BYMONTH', () => {
    const r = parse('RRULE:FREQ=YEARLY;BYMONTH=abc')
    expect(r.ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Round-trip property tests (fast-check)
// ---------------------------------------------------------------------------

describe('parse + stringify round-trip (property tests)', () => {
  // Arbitraries for generating valid RRuleOptions
  const freqArb = fc.constantFrom(
    'SECONDLY',
    'MINUTELY',
    'HOURLY',
    'DAILY',
    'WEEKLY',
    'MONTHLY',
    'YEARLY'
  ) as fc.Arbitrary<RRuleOptions['freq']>

  const weekdayArb = fc.constantFrom('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU') as fc.Arbitrary<
    import('./types.js').Weekday
  >

  const simpleRRuleArb = fc.record({
    freq: freqArb,
    interval: fc.option(fc.integer({ min: 1, max: 100 }), { nil: undefined }),
    count: fc.option(fc.integer({ min: 1, max: 999 }), { nil: undefined }),
    wkst: fc.option(weekdayArb, { nil: undefined }),
    byMonth: fc.option(
      fc.uniqueArray(fc.integer({ min: 1, max: 12 }), { minLength: 1, maxLength: 4 }),
      { nil: undefined }
    ),
    byMonthDay: fc.option(
      fc.uniqueArray(fc.oneof(fc.integer({ min: 1, max: 31 }), fc.integer({ min: -31, max: -1 })), {
        minLength: 1,
        maxLength: 4,
      }),
      { nil: undefined }
    ),
    byHour: fc.option(
      fc.uniqueArray(fc.integer({ min: 0, max: 23 }), { minLength: 1, maxLength: 4 }),
      { nil: undefined }
    ),
    byMinute: fc.option(
      fc.uniqueArray(fc.integer({ min: 0, max: 59 }), { minLength: 1, maxLength: 4 }),
      { nil: undefined }
    ),
    bySecond: fc.option(
      fc.uniqueArray(fc.integer({ min: 0, max: 60 }), { minLength: 1, maxLength: 4 }),
      { nil: undefined }
    ),
  })

  it('parse(stringify(x)) deep-equals x for simple options (no Temporal fields)', () => {
    fc.assert(
      fc.property(simpleRRuleArb, (opts) => {
        const str = stringify(opts)
        const result = parse(str)
        if (!result.ok) {
          throw new Error(`parse failed on stringify output: "${str}" — ${result.error}`)
        }
        // Deep comparison of the parsed result against the original
        expect(result.value).toEqual(opts)
      }),
      { numRuns: 200 }
    )
  })

  it('stringifies a complex rule and parses it back correctly', () => {
    const opts: RRuleOptions = {
      freq: 'WEEKLY',
      interval: 2,
      count: 10,
      wkst: 'SU',
      byDay: [
        { ordinal: undefined, weekday: 'MO' },
        { ordinal: undefined, weekday: 'FR' },
      ],
      byHour: [9, 17],
    }
    const str = stringify(opts)
    const r = parse(str)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toEqual(opts)
  })

  it('round-trips BYDAY with ordinals (MONTHLY)', () => {
    const opts: RRuleOptions = {
      freq: 'MONTHLY',
      byDay: [
        { ordinal: 1, weekday: 'MO' },
        { ordinal: -1, weekday: 'FR' },
      ],
    }
    const str = stringify(opts)
    const r = parse(str)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toEqual(opts)
  })

  it('round-trips a UTC UNTIL value', () => {
    const r = parse('RRULE:FREQ=DAILY;UNTIL=20241231T235959Z')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const str = stringify(r.value)
    const r2 = parse(str)
    expect(r2.ok).toBe(true)
    if (r2.ok) {
      expect(r2.value.until).toEqual(r.value.until)
    }
  })

  it('round-trips a PlainDate UNTIL value', () => {
    const r = parse('RRULE:FREQ=WEEKLY;UNTIL=20241231')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const str = stringify(r.value)
    const r2 = parse(str)
    expect(r2.ok).toBe(true)
    if (r2.ok) {
      expect(r2.value.until).toEqual(r.value.until)
    }
  })

  it('round-trips a DTSTART:UTC line', () => {
    const r = parse('DTSTART:20240101T090000Z\nRRULE:FREQ=WEEKLY;COUNT=5')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const str = stringify(r.value)
    const r2 = parse(str)
    expect(r2.ok).toBe(true)
    if (r2.ok) {
      expect(r2.value.dtstart).toEqual(r.value.dtstart)
      expect(r2.value.count).toBe(5)
    }
  })

  it('round-trips a DTSTART;TZID= line', () => {
    const r = parse('DTSTART;TZID=Europe/Berlin:20240101T090000\nRRULE:FREQ=WEEKLY')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const str = stringify(r.value)
    const r2 = parse(str)
    expect(r2.ok).toBe(true)
    if (r2.ok) {
      expect(r2.value.tzid).toBe('Europe/Berlin')
      expect(r2.value.dtstart).toEqual(r.value.dtstart)
    }
  })

  it('round-trips a DTSTART:PlainDate line', () => {
    const r = parse('DTSTART:20240101\nRRULE:FREQ=WEEKLY')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const str = stringify(r.value)
    const r2 = parse(str)
    expect(r2.ok).toBe(true)
    if (r2.ok) {
      expect(r2.value.dtstart).toEqual(r.value.dtstart)
    }
  })

  it('parse(stringify(x)) preserves DTSTART as PlainDate (property test)', () => {
    const T = getTemporal()
    // Arbitrary valid calendar dates in the range 2000-2099
    const plainDateArb = fc
      .record({
        year: fc.integer({ min: 2000, max: 2099 }),
        month: fc.integer({ min: 1, max: 12 }),
        day: fc.integer({ min: 1, max: 28 }), // day <=28 is valid in every month
      })
      .map(({ year, month, day }) => T.PlainDate.from({ year, month, day }))

    fc.assert(
      fc.property(plainDateArb, (dtstart) => {
        const opts: RRuleOptions = { freq: 'WEEKLY', dtstart }
        const str = stringify(opts)
        const result = parse(str)
        if (!result.ok) {
          throw new Error(`parse failed on "${str}": ${result.error}`)
        }
        expect(result.value.dtstart).toEqual(dtstart)
      }),
      { numRuns: 100 }
    )
  })

  it('parse(stringify(x)) preserves DTSTART as UTC Instant (property test)', () => {
    const T = getTemporal()
    // Arbitrary epoch milliseconds, whole-second granularity, years 2000-2099
    const instantArb = fc
      .integer({ min: 946684800, max: 4102444800 }) // seconds: 2000-01-01 to 2100-01-01
      .map((secs) => T.Instant.fromEpochMilliseconds(secs * 1000))

    fc.assert(
      fc.property(instantArb, (dtstart) => {
        const opts: RRuleOptions = { freq: 'DAILY', dtstart }
        const str = stringify(opts)
        const result = parse(str)
        if (!result.ok) {
          throw new Error(`parse failed on "${str}": ${result.error}`)
        }
        expect(result.value.dtstart).toEqual(dtstart)
      }),
      { numRuns: 100 }
    )
  })

  it('parse(stringify(x)) preserves DTSTART;TZID= as ZonedDateTime (property test)', () => {
    const T = getTemporal()
    const tzidArb = fc.constantFrom('Europe/Berlin', 'America/New_York', 'Asia/Tokyo', 'UTC')
    // Constrain date/time to avoid DST edge cases: use midday, years 2000-2099
    const zdtArb = fc
      .record({
        year: fc.integer({ min: 2000, max: 2099 }),
        month: fc.integer({ min: 1, max: 12 }),
        day: fc.integer({ min: 1, max: 28 }),
        tzid: tzidArb,
      })
      .map(({ year, month, day, tzid }) =>
        T.ZonedDateTime.from({ year, month, day, hour: 12, minute: 0, second: 0, timeZone: tzid })
      )

    fc.assert(
      fc.property(zdtArb, (dtstart) => {
        const opts: RRuleOptions = { freq: 'MONTHLY', dtstart, tzid: dtstart.timeZoneId }
        const str = stringify(opts)
        const result = parse(str)
        if (!result.ok) {
          throw new Error(`parse failed on "${str}": ${result.error}`)
        }
        // Verify structural equivalence (epochMilliseconds is the canonical identity)
        expect((result.value.dtstart as typeof dtstart).epochMilliseconds).toBe(
          dtstart.epochMilliseconds
        )
        expect(result.value.tzid).toBe(dtstart.timeZoneId)
      }),
      { numRuns: 100 }
    )
  })

  it('parse(stringify(x)) preserves UNTIL as UTC Instant (property test)', () => {
    const T = getTemporal()
    const instantArb = fc
      .integer({ min: 946684800, max: 4102444800 })
      .map((secs) => T.Instant.fromEpochMilliseconds(secs * 1000))

    fc.assert(
      fc.property(instantArb, (until) => {
        const opts: RRuleOptions = { freq: 'DAILY', until }
        const str = stringify(opts)
        const result = parse(str)
        if (!result.ok) {
          throw new Error(`parse failed on "${str}": ${result.error}`)
        }
        expect(result.value.until).toEqual(until)
      }),
      { numRuns: 100 }
    )
  })
})
