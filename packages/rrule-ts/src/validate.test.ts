import { describe, it, expect } from 'vitest'
import { validate } from './validate.js'
import { getTemporal } from './temporal.js'
import type { RRuleOptions } from './types.js'

// ---------------------------------------------------------------------------
// Helper: build minimal valid options and extend
// ---------------------------------------------------------------------------

function base(overrides: Partial<RRuleOptions> = {}): RRuleOptions {
  return { freq: 'DAILY', ...overrides }
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('validate - happy path', () => {
  it('accepts a minimal valid RRULE', () => {
    const r = validate(base())
    expect(r.ok).toBe(true)
  })

  it('returns the same options object on success', () => {
    const opts = base({ count: 5 })
    const r = validate(opts)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe(opts)
  })

  it('accepts COUNT without UNTIL', () => {
    expect(validate(base({ count: 10 })).ok).toBe(true)
  })

  it('accepts UNTIL without COUNT (UTC Instant)', () => {
    const T = getTemporal()
    const until = T.Instant.from('2024-12-31T23:59:59Z')
    const dtstart = T.Instant.from('2024-01-01T00:00:00Z')
    expect(validate(base({ until, dtstart })).ok).toBe(true)
  })

  it('accepts INTERVAL >= 1', () => {
    expect(validate(base({ interval: 1 })).ok).toBe(true)
    expect(validate(base({ interval: 100 })).ok).toBe(true)
  })

  it('accepts BYDAY plain weekdays on WEEKLY', () => {
    const opts = base({
      freq: 'WEEKLY',
      byDay: [{ ordinal: undefined, weekday: 'MO' }],
    })
    expect(validate(opts).ok).toBe(true)
  })

  it('accepts BYDAY ordinals on MONTHLY', () => {
    const opts = base({
      freq: 'MONTHLY',
      byDay: [{ ordinal: 2, weekday: 'MO' }],
    })
    expect(validate(opts).ok).toBe(true)
  })

  it('accepts BYDAY ordinals on YEARLY', () => {
    const opts = base({
      freq: 'YEARLY',
      byDay: [{ ordinal: -1, weekday: 'SU' }],
    })
    expect(validate(opts).ok).toBe(true)
  })

  it('accepts BYMONTH in range 1-12', () => {
    expect(validate(base({ byMonth: [1, 6, 12] })).ok).toBe(true)
  })

  it('accepts BYMONTHDAY with negative values in range', () => {
    expect(validate(base({ byMonthDay: [-31, -1, 1, 31] })).ok).toBe(true)
  })

  it('accepts BYHOUR 0-23', () => {
    expect(validate(base({ byHour: [0, 12, 23] })).ok).toBe(true)
  })

  it('accepts BYMINUTE 0-59', () => {
    expect(validate(base({ byMinute: [0, 59] })).ok).toBe(true)
  })

  it('accepts BYSECOND 0-60 (60 for leap second)', () => {
    expect(validate(base({ bySecond: [0, 60] })).ok).toBe(true)
  })

  it('accepts BYSETPOS with positive and negative values', () => {
    expect(validate(base({ bySetPos: [1, -1, 366, -366] })).ok).toBe(true)
  })

  it('accepts BYWEEKNO in range 1-53', () => {
    expect(validate(base({ freq: 'YEARLY', byWeekNo: [1, 53] })).ok).toBe(true)
  })

  it('accepts BYYEARDAY in range 1-366', () => {
    expect(validate(base({ freq: 'YEARLY', byYearDay: [1, 366, -1, -366] })).ok).toBe(true)
  })

  it('accepts PlainDate UNTIL with PlainDate DTSTART', () => {
    const T = getTemporal()
    const dtstart = T.PlainDate.from('2024-01-01')
    const until = T.PlainDate.from('2024-12-31')
    expect(validate(base({ dtstart, until })).ok).toBe(true)
  })

  it('accepts PlainDateTime UNTIL with PlainDateTime DTSTART', () => {
    const T = getTemporal()
    const dtstart = T.PlainDateTime.from('2024-01-01T00:00:00')
    const until = T.PlainDateTime.from('2024-12-31T23:59:59')
    expect(validate(base({ dtstart, until })).ok).toBe(true)
  })

  it('accepts ZonedDateTime DTSTART with Instant UNTIL (per RFC)', () => {
    const T = getTemporal()
    const dtstart = T.ZonedDateTime.from('2024-01-01T00:00:00[Europe/Berlin]')
    const until = T.Instant.from('2024-12-31T22:59:59Z')
    expect(validate(base({ dtstart, until, tzid: 'Europe/Berlin' })).ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// COUNT xor UNTIL
// ---------------------------------------------------------------------------

describe('validate - COUNT_XNOR_UNTIL', () => {
  it('rejects when both COUNT and UNTIL are set', () => {
    const T = getTemporal()
    const until = T.Instant.from('2024-12-31T23:59:59Z')
    const r = validate(base({ count: 5, until }))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      const rule = r.error.find((e) => e.ruleId === 'COUNT_XNOR_UNTIL')
      expect(rule).toBeDefined()
      expect(rule?.field).toBe('COUNT')
    }
  })
})

// ---------------------------------------------------------------------------
// INTERVAL
// ---------------------------------------------------------------------------

describe('validate - INTERVAL_MIN_1', () => {
  it('rejects INTERVAL = 0', () => {
    const r = validate(base({ interval: 0 }))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.some((e) => e.ruleId === 'INTERVAL_MIN_1')).toBe(true)
    }
  })

  it('rejects INTERVAL = -1', () => {
    const r = validate(base({ interval: -1 }))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.some((e) => e.ruleId === 'INTERVAL_MIN_1')).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// COUNT
// ---------------------------------------------------------------------------

describe('validate - COUNT_MIN_1', () => {
  it('rejects COUNT = 0', () => {
    const r = validate(base({ count: 0 }))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.some((e) => e.ruleId === 'COUNT_MIN_1')).toBe(true)
    }
  })

  it('rejects COUNT = -5', () => {
    const r = validate(base({ count: -5 }))
    expect(r.ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// UNTIL type must match DTSTART
// ---------------------------------------------------------------------------

describe('validate - UNTIL_TYPE_MATCH_DTSTART', () => {
  it('rejects PlainDate DTSTART with Instant UNTIL', () => {
    const T = getTemporal()
    const dtstart = T.PlainDate.from('2024-01-01')
    const until = T.Instant.from('2024-12-31T23:59:59Z')
    const r = validate(base({ dtstart, until }))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.some((e) => e.ruleId === 'UNTIL_TYPE_MATCH_DTSTART')).toBe(true)
    }
  })

  it('rejects Instant DTSTART with PlainDate UNTIL', () => {
    const T = getTemporal()
    const dtstart = T.Instant.from('2024-01-01T00:00:00Z')
    const until = T.PlainDate.from('2024-12-31')
    const r = validate(base({ dtstart, until }))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.some((e) => e.ruleId === 'UNTIL_TYPE_MATCH_DTSTART')).toBe(true)
    }
  })

  it('rejects ZonedDateTime DTSTART with PlainDate UNTIL', () => {
    const T = getTemporal()
    const dtstart = T.ZonedDateTime.from('2024-01-01T09:00:00[Europe/Berlin]')
    const until = T.PlainDate.from('2024-12-31')
    const r = validate(base({ dtstart, until, tzid: 'Europe/Berlin' }))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.some((e) => e.ruleId === 'UNTIL_TYPE_MATCH_DTSTART')).toBe(true)
    }
  })

  it('rejects PlainDateTime DTSTART with Instant UNTIL', () => {
    const T = getTemporal()
    const dtstart = T.PlainDateTime.from('2024-01-01T09:00:00')
    const until = T.Instant.from('2024-12-31T23:59:59Z')
    const r = validate(base({ dtstart, until }))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.some((e) => e.ruleId === 'UNTIL_TYPE_MATCH_DTSTART')).toBe(true)
    }
  })

  it('skips UNTIL check when dtstart is absent', () => {
    const T = getTemporal()
    const until = T.Instant.from('2024-12-31T23:59:59Z')
    // No dtstart: no type-match requirement
    const r = validate(base({ until }))
    expect(r.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// BYDAY ordinals
// ---------------------------------------------------------------------------

describe('validate - BYDAY_ORDINAL_FREQ', () => {
  it('rejects BYDAY ordinals on DAILY freq', () => {
    const r = validate(
      base({
        freq: 'DAILY',
        byDay: [{ ordinal: 1, weekday: 'MO' }],
      })
    )
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.some((e) => e.ruleId === 'BYDAY_ORDINAL_FREQ')).toBe(true)
    }
  })

  it('rejects BYDAY ordinals on WEEKLY freq', () => {
    const r = validate(
      base({
        freq: 'WEEKLY',
        byDay: [{ ordinal: 2, weekday: 'TU' }],
      })
    )
    expect(r.ok).toBe(false)
  })

  it('allows plain BYDAY (no ordinal) on WEEKLY', () => {
    const r = validate(
      base({
        freq: 'WEEKLY',
        byDay: [{ ordinal: undefined, weekday: 'MO' }],
      })
    )
    expect(r.ok).toBe(true)
  })
})

describe('validate - BYDAY_ORDINAL_NO_BYWEEKNO', () => {
  it('rejects BYDAY ordinals combined with BYWEEKNO', () => {
    const r = validate(
      base({
        freq: 'YEARLY',
        byDay: [{ ordinal: 1, weekday: 'MO' }],
        byWeekNo: [1],
      })
    )
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.some((e) => e.ruleId === 'BYDAY_ORDINAL_NO_BYWEEKNO')).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// BY* ranges
// ---------------------------------------------------------------------------

describe('validate - BY* range checks', () => {
  it('rejects BYMONTH = 0', () => {
    const r = validate(base({ byMonth: [0] }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.some((e) => e.ruleId === 'BYMONTH_RANGE')).toBe(true)
  })

  it('rejects BYMONTH = 13', () => {
    const r = validate(base({ byMonth: [13] }))
    expect(r.ok).toBe(false)
  })

  it('rejects BYMONTHDAY = 0', () => {
    const r = validate(base({ byMonthDay: [0] }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.some((e) => e.ruleId === 'BYMONTHDAY_RANGE')).toBe(true)
  })

  it('rejects BYMONTHDAY = 32', () => {
    const r = validate(base({ byMonthDay: [32] }))
    expect(r.ok).toBe(false)
  })

  it('rejects BYMONTHDAY = -32', () => {
    const r = validate(base({ byMonthDay: [-32] }))
    expect(r.ok).toBe(false)
  })

  it('rejects BYHOUR = 24', () => {
    const r = validate(base({ byHour: [24] }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.some((e) => e.ruleId === 'BYHOUR_RANGE')).toBe(true)
  })

  it('rejects BYMINUTE = 60', () => {
    const r = validate(base({ byMinute: [60] }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.some((e) => e.ruleId === 'BYMINUTE_RANGE')).toBe(true)
  })

  it('rejects BYSECOND = 61', () => {
    const r = validate(base({ bySecond: [61] }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.some((e) => e.ruleId === 'BYSECOND_RANGE')).toBe(true)
  })

  it('accepts BYSECOND = 60 (leap second)', () => {
    expect(validate(base({ bySecond: [60] })).ok).toBe(true)
  })

  it('rejects BYSETPOS = 0', () => {
    const r = validate(base({ bySetPos: [0] }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.some((e) => e.ruleId === 'BYSETPOS_RANGE')).toBe(true)
  })

  it('rejects BYSETPOS = 367', () => {
    const r = validate(base({ bySetPos: [367] }))
    expect(r.ok).toBe(false)
  })

  it('rejects BYSETPOS = -367', () => {
    const r = validate(base({ bySetPos: [-367] }))
    expect(r.ok).toBe(false)
  })

  it('rejects BYWEEKNO = 0', () => {
    const r = validate(base({ byWeekNo: [0] }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.some((e) => e.ruleId === 'BYWEEKNO_RANGE')).toBe(true)
  })

  it('rejects BYWEEKNO = 54', () => {
    const r = validate(base({ byWeekNo: [54] }))
    expect(r.ok).toBe(false)
  })

  it('rejects BYYEARDAY = 0', () => {
    const r = validate(base({ byYearDay: [0] }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.some((e) => e.ruleId === 'BYYEARDAY_RANGE')).toBe(true)
  })

  it('rejects BYYEARDAY = 367', () => {
    const r = validate(base({ byYearDay: [367] }))
    expect(r.ok).toBe(false)
  })

  it('reports multiple errors in one pass', () => {
    // INTERVAL=0 AND BYMONTH=13 AND COUNT with UNTIL all together
    const T = getTemporal()
    const r = validate(
      base({
        interval: 0,
        byMonth: [13],
        count: 5,
        until: T.Instant.from('2024-12-31T23:59:59Z'),
      })
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.length).toBeGreaterThanOrEqual(2)
  })
})
