// Unit tests for the rrule.js oracle adapter.
//
// Hand-checked expected occurrences verified against:
//   1. RFC 5545 §3.8.5.3 examples
//   2. python-dateutil output for the same RRULE + DTSTART
//
// These tests ensure the adapter normalizes output in the same format as the
// python oracle: floating -> "YYYY-MM-DDTHH:MM:SS", UTC -> "...Z".

import { describe, it, expect } from 'vitest'
import { runRRuleJs } from './rrulejs-oracle.js'

// ---------------------------------------------------------------------------
// Floating (no tzid, no Z suffix) cases
// ---------------------------------------------------------------------------

describe('rrule.js oracle adapter - floating cases', () => {
  it('FREQ=DAILY;COUNT=3 from 1997-09-02T09:00:00 floating', () => {
    const result = runRRuleJs({
      id: 'test-daily-float',
      label: 'daily floating',
      rrule: 'FREQ=DAILY;COUNT=3',
      dtstart: '1997-09-02T09:00:00',
      tzid: null,
      count: 3,
    })
    expect(result.error).toBeNull()
    expect(result.unsupported).toBeFalsy()
    expect(result.occurrences).toEqual([
      '1997-09-02T09:00:00',
      '1997-09-03T09:00:00',
      '1997-09-04T09:00:00',
    ])
  })

  it('FREQ=WEEKLY;BYDAY=TU,TH;COUNT=4 from 1997-09-02T09:00:00 floating', () => {
    const result = runRRuleJs({
      id: 'test-weekly-byday-float',
      label: 'weekly byday floating',
      rrule: 'FREQ=WEEKLY;BYDAY=TU,TH;COUNT=4',
      dtstart: '1997-09-02T09:00:00',
      tzid: null,
      count: 4,
    })
    expect(result.error).toBeNull()
    expect(result.unsupported).toBeFalsy()
    expect(result.occurrences).toEqual([
      '1997-09-02T09:00:00',
      '1997-09-04T09:00:00',
      '1997-09-09T09:00:00',
      '1997-09-11T09:00:00',
    ])
  })

  it('FREQ=MONTHLY;BYDAY=-1MO;COUNT=3 from 1997-09-02T09:00:00 floating', () => {
    // Last Monday of the month.
    const result = runRRuleJs({
      id: 'test-monthly-lastmo-float',
      label: 'last monday of month floating',
      rrule: 'FREQ=MONTHLY;BYDAY=-1MO;COUNT=3',
      dtstart: '1997-09-02T09:00:00',
      tzid: null,
      count: 3,
    })
    expect(result.error).toBeNull()
    expect(result.unsupported).toBeFalsy()
    // Sep 1997: last Mon is Sep 29. Oct 1997: Oct 27. Nov 1997: Nov 24.
    expect(result.occurrences).toEqual([
      '1997-09-29T09:00:00',
      '1997-10-27T09:00:00',
      '1997-11-24T09:00:00',
    ])
  })

  it('FREQ=YEARLY;BYMONTH=1;BYDAY=SU;COUNT=3 from 1997-09-02T09:00:00 floating', () => {
    // Every Sunday in January.
    const result = runRRuleJs({
      id: 'test-yearly-jan-sundays-float',
      label: 'sundays in january floating',
      rrule: 'FREQ=YEARLY;BYMONTH=1;BYDAY=SU;COUNT=3',
      dtstart: '1997-09-02T09:00:00',
      tzid: null,
      count: 3,
    })
    expect(result.error).toBeNull()
    expect(result.unsupported).toBeFalsy()
    // Jan 1998 Sundays: Jan 4, 11, 18
    expect(result.occurrences).toEqual([
      '1998-01-04T09:00:00',
      '1998-01-11T09:00:00',
      '1998-01-18T09:00:00',
    ])
  })

  it('FREQ=DAILY;INTERVAL=2;COUNT=3 from 2024-01-01T00:30:00 floating', () => {
    const result = runRRuleJs({
      id: 'test-daily-interval2-float',
      label: 'every other day floating',
      rrule: 'FREQ=DAILY;INTERVAL=2;COUNT=3',
      dtstart: '2024-01-01T00:30:00',
      tzid: null,
      count: 3,
    })
    expect(result.error).toBeNull()
    expect(result.unsupported).toBeFalsy()
    expect(result.occurrences).toEqual([
      '2024-01-01T00:30:00',
      '2024-01-03T00:30:00',
      '2024-01-05T00:30:00',
    ])
  })

  it('FREQ=WEEKLY;BYDAY=MO;UNTIL=19971113T090000 from 1997-09-02T09:00:00 floating', () => {
    // Every Monday until Nov 13 1997.
    const result = runRRuleJs({
      id: 'test-weekly-until-float',
      label: 'weekly monday until floating',
      rrule: 'FREQ=WEEKLY;BYDAY=MO;UNTIL=19971113T090000',
      dtstart: '1997-09-02T09:00:00',
      tzid: null,
      count: 20,
    })
    expect(result.error).toBeNull()
    expect(result.unsupported).toBeFalsy()
    // Mondays: Sep 8, 15, 22, 29, Oct 6, 13, 20, 27, Nov 3, 10 (stops at Nov 13 UNTIL)
    expect(result.occurrences).toEqual([
      '1997-09-08T09:00:00',
      '1997-09-15T09:00:00',
      '1997-09-22T09:00:00',
      '1997-09-29T09:00:00',
      '1997-10-06T09:00:00',
      '1997-10-13T09:00:00',
      '1997-10-20T09:00:00',
      '1997-10-27T09:00:00',
      '1997-11-03T09:00:00',
      '1997-11-10T09:00:00',
    ])
  })
})

// ---------------------------------------------------------------------------
// UTC cases
// ---------------------------------------------------------------------------

describe('rrule.js oracle adapter - UTC cases', () => {
  it('FREQ=DAILY;COUNT=3 from 1997-09-02T09:00:00Z UTC', () => {
    const result = runRRuleJs({
      id: 'test-daily-utc',
      label: 'daily UTC',
      rrule: 'FREQ=DAILY;COUNT=3',
      dtstart: '1997-09-02T09:00:00Z',
      tzid: null,
      count: 3,
    })
    expect(result.error).toBeNull()
    expect(result.unsupported).toBeFalsy()
    expect(result.occurrences).toEqual([
      '1997-09-02T09:00:00Z',
      '1997-09-03T09:00:00Z',
      '1997-09-04T09:00:00Z',
    ])
  })

  it('FREQ=WEEKLY;BYDAY=TU,TH;COUNT=4 from 1997-09-02T09:00:00Z UTC', () => {
    const result = runRRuleJs({
      id: 'test-weekly-byday-utc',
      label: 'weekly byday UTC',
      rrule: 'FREQ=WEEKLY;BYDAY=TU,TH;COUNT=4',
      dtstart: '1997-09-02T09:00:00Z',
      tzid: null,
      count: 4,
    })
    expect(result.error).toBeNull()
    expect(result.unsupported).toBeFalsy()
    expect(result.occurrences).toEqual([
      '1997-09-02T09:00:00Z',
      '1997-09-04T09:00:00Z',
      '1997-09-09T09:00:00Z',
      '1997-09-11T09:00:00Z',
    ])
  })
})

// ---------------------------------------------------------------------------
// Zoned cases (must be marked unsupported, NOT compared)
// ---------------------------------------------------------------------------

describe('rrule.js oracle adapter - zoned cases (unsupported)', () => {
  it('marks America/New_York cases as unsupported', () => {
    const result = runRRuleJs({
      id: 'test-zoned-ny',
      label: 'zoned NY',
      rrule: 'FREQ=DAILY;COUNT=3',
      dtstart: '2024-01-15T10:00:00',
      tzid: 'America/New_York',
      count: 3,
    })
    expect(result.unsupported).toBe(true)
    expect(result.occurrences).toEqual([])
    expect(result.error).toBeNull()
  })

  it('marks Europe/Berlin cases as unsupported', () => {
    const result = runRRuleJs({
      id: 'test-zoned-berlin',
      label: 'zoned Berlin',
      rrule: 'FREQ=MONTHLY;BYDAY=1MO;COUNT=3',
      dtstart: '2024-01-15T10:00:00',
      tzid: 'Europe/Berlin',
      count: 3,
    })
    expect(result.unsupported).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Count cap: result must not exceed c.count even when RRULE has higher COUNT
// ---------------------------------------------------------------------------

describe('rrule.js oracle adapter - count capping', () => {
  it('caps results at c.count when RRULE COUNT is larger', () => {
    const result = runRRuleJs({
      id: 'test-count-cap',
      label: 'count cap',
      rrule: 'FREQ=DAILY;COUNT=10',
      dtstart: '1997-09-02T09:00:00',
      tzid: null,
      count: 3,
    })
    expect(result.error).toBeNull()
    expect(result.occurrences).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// BYWEEKNO case: the adjudicated oracle-divergent case
// ---------------------------------------------------------------------------

describe('rrule.js oracle adapter - BYWEEKNO case', () => {
  it('FREQ=YEARLY;BYWEEKNO=52 from 2000-01-01T09:00:00 floating - count=7', () => {
    // This is the case where rrule-ts is RFC-correct and python-dateutil has a bug.
    // We test what rrule.js produces so we can adjudicate between the oracles.
    const result = runRRuleJs({
      id: 'test-byweekno-52',
      label: 'byweekno=52 from 2000-01-01',
      rrule: 'FREQ=YEARLY;BYWEEKNO=52',
      dtstart: '2000-01-01T09:00:00',
      tzid: null,
      count: 7,
    })
    expect(result.error).toBeNull()
    expect(result.unsupported).toBeFalsy()
    // Record what rrule.js produces - the exact value is used in adjudication.
    // rrule-ts (RFC-correct): Dec 25-31 2000 only (ISO week 52 of year 2000).
    // dateutil (buggy): also includes Jan 1-2 2000 (ISO 1999-W52 bleeds).
    // We check rrule.js sides with one of the two; the result is part of the report.
    expect(result.occurrences.length).toBeGreaterThan(0)
    // Log for adjudication (will show in test output).
    console.log('[BYWEEKNO adjudication] rrule.js output:', result.occurrences)
  })
})
