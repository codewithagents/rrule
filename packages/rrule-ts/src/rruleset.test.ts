// Unit tests for RRuleSet: k-way merge of RRULE/RDATE with EXRULE/EXDATE exclusion.
//
// Covers: addRRule, addExRule, addRDate, addExDate, expand(limit),
// Symbol.iterator, chronological ordering, deduplication, and mixed type sets.

import { describe, it, expect } from 'vitest'
import { getTemporal } from './temporal.js'
import { RRuleSet } from './rruleset.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pdt(y: number, m: number, d: number, h = 9, mi = 0, s = 0): Temporal.PlainDateTime {
  return getTemporal().PlainDateTime.from({
    year: y,
    month: m,
    day: d,
    hour: h,
    minute: mi,
    second: s,
  })
}

function pd(y: number, m: number, d: number): Temporal.PlainDate {
  return getTemporal().PlainDate.from({ year: y, month: m, day: d })
}

function inst(iso: string): Temporal.Instant {
  return getTemporal().Instant.from(iso)
}

function zdt(
  y: number,
  m: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  tz: string
): Temporal.ZonedDateTime {
  return getTemporal().ZonedDateTime.from({
    year: y,
    month: m,
    day: d,
    hour: h,
    minute: mi,
    second: s,
    timeZone: tz,
  })
}

function strs(results: ReturnType<RRuleSet['expand']>): string[] {
  return results.map((r) => String(r).replace(/\[.*\]$/, ''))
}

// ---------------------------------------------------------------------------
// Empty set
// ---------------------------------------------------------------------------

describe('RRuleSet empty', () => {
  it('expand() on an empty set returns []', () => {
    const set = new RRuleSet()
    expect(set.expand()).toEqual([])
  })

  it('Symbol.iterator on an empty set yields nothing', () => {
    const set = new RRuleSet()
    expect([...set]).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Single RRULE
// ---------------------------------------------------------------------------

describe('RRuleSet single RRULE', () => {
  it('produces the same results as iterate() on the same rule', () => {
    const set = new RRuleSet()
    set.addRRule({
      freq: 'DAILY',
      count: 5,
      dtstart: pdt(2024, 1, 1),
    })
    const results = set.expand()
    expect(strs(results)).toEqual([
      '2024-01-01T09:00:00',
      '2024-01-02T09:00:00',
      '2024-01-03T09:00:00',
      '2024-01-04T09:00:00',
      '2024-01-05T09:00:00',
    ])
  })

  it('expand(limit) truncates to the given limit', () => {
    const set = new RRuleSet()
    set.addRRule({
      freq: 'DAILY',
      count: 10,
      dtstart: pdt(2024, 1, 1),
    })
    const results = set.expand(3)
    expect(results).toHaveLength(3)
    expect(strs(results)[0]).toBe('2024-01-01T09:00:00')
  })
})

// ---------------------------------------------------------------------------
// Multiple RRULEs: merge, sort, and deduplicate
// ---------------------------------------------------------------------------

describe('RRuleSet multiple RRULEs', () => {
  it('merges two non-overlapping weekly rules in chronological order', () => {
    // Rule A: every Mon starting Jan 8. Rule B: every Wed starting Jan 10.
    const set = new RRuleSet()
    set.addRRule({
      freq: 'WEEKLY',
      count: 3,
      byDay: [{ weekday: 'MO', ordinal: undefined }],
      dtstart: pdt(2024, 1, 8),
    })
    set.addRRule({
      freq: 'WEEKLY',
      count: 3,
      byDay: [{ weekday: 'WE', ordinal: undefined }],
      dtstart: pdt(2024, 1, 10),
    })
    const results = set.expand()
    // Expected chronological order: Jan 8(Mon), Jan 10(Wed), Jan 15(Mon), Jan 17(Wed), Jan 22(Mon), Jan 24(Wed)
    expect(strs(results)).toEqual([
      '2024-01-08T09:00:00',
      '2024-01-10T09:00:00',
      '2024-01-15T09:00:00',
      '2024-01-17T09:00:00',
      '2024-01-22T09:00:00',
      '2024-01-24T09:00:00',
    ])
  })

  it('deduplicates occurrences when two rules produce the same dates', () => {
    // Both rules land on the same daily dates — result should not have duplicates.
    const set = new RRuleSet()
    set.addRRule({
      freq: 'DAILY',
      count: 5,
      dtstart: pdt(2024, 1, 1),
    })
    set.addRRule({
      freq: 'DAILY',
      count: 5,
      dtstart: pdt(2024, 1, 1),
    })
    const results = set.expand()
    // Deduplication: each date appears once
    expect(results).toHaveLength(5)
    const strings = strs(results)
    const unique = new Set(strings)
    expect(unique.size).toBe(5)
  })

  it('addRRule returns this for chaining', () => {
    const set = new RRuleSet()
    const returned = set.addRRule({ freq: 'DAILY', count: 1, dtstart: pdt(2024, 1, 1) })
    expect(returned).toBe(set)
  })
})

// ---------------------------------------------------------------------------
// addRDate: explicit inclusion dates
// ---------------------------------------------------------------------------

describe('RRuleSet addRDate', () => {
  it('adds an explicit PlainDateTime occurrence in sorted position', () => {
    const set = new RRuleSet()
    // RRULE: Jan 8 and Jan 15 (weekly Mondays)
    set.addRRule({
      freq: 'WEEKLY',
      count: 2,
      byDay: [{ weekday: 'MO', ordinal: undefined }],
      dtstart: pdt(2024, 1, 8),
    })
    // RDATE: Jan 11 (Friday, not in the rule)
    set.addRDate(pdt(2024, 1, 11))
    const results = set.expand()
    // Expected: Jan 8, Jan 11, Jan 15 in order
    expect(strs(results)).toEqual([
      '2024-01-08T09:00:00',
      '2024-01-11T09:00:00',
      '2024-01-15T09:00:00',
    ])
  })

  it('addRDate returns this for chaining', () => {
    const set = new RRuleSet()
    const returned = set.addRDate(pdt(2024, 1, 1))
    expect(returned).toBe(set)
  })

  it('RDATE duplicates an RRULE occurrence: still yields once', () => {
    const set = new RRuleSet()
    set.addRRule({
      freq: 'DAILY',
      count: 3,
      dtstart: pdt(2024, 1, 1),
    })
    // Add Jan 2 as RDATE (already in the rule)
    set.addRDate(pdt(2024, 1, 2))
    const results = set.expand()
    expect(results).toHaveLength(3)
  })

  it('RDATE alone (no RRULE): just the explicit dates', () => {
    const set = new RRuleSet()
    set.addRDate(pdt(2024, 6, 15))
    set.addRDate(pdt(2024, 3, 10))
    const results = set.expand()
    // Sorted chronologically: Mar 10, Jun 15
    expect(strs(results)).toEqual(['2024-03-10T09:00:00', '2024-06-15T09:00:00'])
  })

  it('PlainDate RDATE with PlainDate RRULE', () => {
    const set = new RRuleSet()
    set.addRRule({
      freq: 'WEEKLY',
      count: 2,
      byDay: [{ weekday: 'MO', ordinal: undefined }],
      dtstart: pd(2024, 1, 8),
    })
    set.addRDate(pd(2024, 1, 11))
    const results = set.expand()
    expect(strs(results)).toEqual(['2024-01-08', '2024-01-11', '2024-01-15'])
  })
})

// ---------------------------------------------------------------------------
// addExDate: explicit exclusion dates
// ---------------------------------------------------------------------------

describe('RRuleSet addExDate', () => {
  it('removes a specific occurrence from the rule', () => {
    const set = new RRuleSet()
    set.addRRule({
      freq: 'DAILY',
      count: 5,
      dtstart: pdt(2024, 1, 1),
    })
    // Exclude Jan 3
    set.addExDate(pdt(2024, 1, 3))
    const results = set.expand()
    // Jan 1, 2, 4, 5 (Jan 3 excluded)
    expect(strs(results)).toEqual([
      '2024-01-01T09:00:00',
      '2024-01-02T09:00:00',
      '2024-01-04T09:00:00',
      '2024-01-05T09:00:00',
    ])
  })

  it('addExDate returns this for chaining', () => {
    const set = new RRuleSet()
    const returned = set.addExDate(pdt(2024, 1, 1))
    expect(returned).toBe(set)
  })

  it('multiple ExDates removed', () => {
    const set = new RRuleSet()
    set.addRRule({
      freq: 'DAILY',
      count: 5,
      dtstart: pdt(2024, 1, 1),
    })
    set.addExDate(pdt(2024, 1, 2))
    set.addExDate(pdt(2024, 1, 4))
    const results = set.expand()
    expect(strs(results)).toEqual([
      '2024-01-01T09:00:00',
      '2024-01-03T09:00:00',
      '2024-01-05T09:00:00',
    ])
  })

  it('ExDate that does not match any occurrence is a no-op', () => {
    const set = new RRuleSet()
    set.addRRule({
      freq: 'DAILY',
      count: 3,
      dtstart: pdt(2024, 1, 1),
    })
    // Exclude a date not in the rule
    set.addExDate(pdt(2024, 6, 15))
    const results = set.expand()
    expect(results).toHaveLength(3)
  })

  it('PlainDate ExDate', () => {
    const set = new RRuleSet()
    set.addRRule({
      freq: 'DAILY',
      count: 4,
      dtstart: pd(2024, 1, 1),
    })
    set.addExDate(pd(2024, 1, 2))
    const results = set.expand()
    expect(strs(results)).toEqual(['2024-01-01', '2024-01-03', '2024-01-04'])
  })
})

// ---------------------------------------------------------------------------
// addExRule: exclude all occurrences from a second rule
// ---------------------------------------------------------------------------

describe('RRuleSet addExRule', () => {
  it('excludes occurrences generated by the ExRule', () => {
    // RRULE: Mon/Tue/Wed/Thu/Fri for 5 days from Jan 1 (Mon)
    // EXRULE: every Wednesday (should remove Wed)
    const set = new RRuleSet()
    set.addRRule({
      freq: 'DAILY',
      count: 5,
      byDay: [
        { weekday: 'MO', ordinal: undefined },
        { weekday: 'TU', ordinal: undefined },
        { weekday: 'WE', ordinal: undefined },
        { weekday: 'TH', ordinal: undefined },
        { weekday: 'FR', ordinal: undefined },
      ],
      dtstart: pdt(2024, 1, 1),
    })
    set.addExRule({
      freq: 'WEEKLY',
      count: 2,
      byDay: [{ weekday: 'WE', ordinal: undefined }],
      dtstart: pdt(2024, 1, 3),
    })
    const results = set.expand()
    // Should not include Jan 3 (Wed) or Jan 10 (Wed)
    const strings = strs(results)
    expect(strings).not.toContain('2024-01-03T09:00:00')
    // Mon, Tue, Thu, Fri should still be present
    expect(strings).toContain('2024-01-01T09:00:00')
    expect(strings).toContain('2024-01-02T09:00:00')
  })

  it('addExRule returns this for chaining', () => {
    const set = new RRuleSet()
    const returned = set.addExRule({ freq: 'DAILY', count: 1, dtstart: pdt(2024, 1, 1) })
    expect(returned).toBe(set)
  })

  it('ExRule removes dates even if they are also in RDATE', () => {
    const set = new RRuleSet()
    // RDATE only: Jan 1 and Jan 2
    set.addRDate(pdt(2024, 1, 1))
    set.addRDate(pdt(2024, 1, 2))
    // EXRULE: daily from Jan 1, count=1 (excludes Jan 1)
    set.addExRule({
      freq: 'DAILY',
      count: 1,
      dtstart: pdt(2024, 1, 1),
    })
    const results = set.expand()
    // Jan 1 is excluded by ExRule; Jan 2 remains
    expect(strs(results)).toEqual(['2024-01-02T09:00:00'])
  })
})

// ---------------------------------------------------------------------------
// Symbol.iterator (lazy iteration)
// ---------------------------------------------------------------------------

describe('RRuleSet Symbol.iterator', () => {
  it('can be iterated with for...of', () => {
    const set = new RRuleSet()
    set.addRRule({
      freq: 'DAILY',
      count: 3,
      dtstart: pdt(2024, 1, 1),
    })
    const results: string[] = []
    for (const occ of set) {
      results.push(String(occ))
    }
    expect(results).toHaveLength(3)
    expect(results[0]).toBe('2024-01-01T09:00:00')
  })

  it('spread operator materializes all occurrences', () => {
    const set = new RRuleSet()
    set.addRRule({
      freq: 'DAILY',
      count: 4,
      dtstart: pdt(2024, 1, 1),
    })
    const results = [...set]
    expect(results).toHaveLength(4)
  })
})

// ---------------------------------------------------------------------------
// Instant (UTC) type support
// ---------------------------------------------------------------------------

describe('RRuleSet with Instant dtstart', () => {
  it('produces Instant occurrences and deduplicates correctly', () => {
    const set = new RRuleSet()
    set.addRRule({
      freq: 'DAILY',
      count: 3,
      dtstart: inst('2024-01-01T09:00:00Z'),
    })
    set.addRDate(inst('2024-01-04T09:00:00Z'))
    const results = set.expand()
    // Jan 1, 2, 3, 4 in UTC
    expect(results).toHaveLength(4)
    expect(String(results[0])).toBe('2024-01-01T09:00:00Z')
    expect(String(results[3])).toBe('2024-01-04T09:00:00Z')
  })

  it('ExDate with Instant type excludes by epoch key', () => {
    const set = new RRuleSet()
    set.addRRule({
      freq: 'DAILY',
      count: 3,
      dtstart: inst('2024-01-01T09:00:00Z'),
    })
    set.addExDate(inst('2024-01-02T09:00:00Z'))
    const results = set.expand()
    expect(results).toHaveLength(2)
    expect(String(results[0])).toBe('2024-01-01T09:00:00Z')
    expect(String(results[1])).toBe('2024-01-03T09:00:00Z')
  })
})

// ---------------------------------------------------------------------------
// ZonedDateTime type support
// ---------------------------------------------------------------------------

describe('RRuleSet with ZonedDateTime dtstart', () => {
  it('produces ZonedDateTime occurrences', () => {
    const set = new RRuleSet()
    set.addRRule({
      freq: 'DAILY',
      count: 3,
      dtstart: zdt(2024, 1, 1, 9, 0, 0, 'UTC'),
    })
    const results = set.expand()
    expect(results).toHaveLength(3)
    for (const r of results) {
      expect(r).toHaveProperty('timeZoneId')
    }
  })

  it('ZonedDateTime ExDate excludes by epoch milliseconds', () => {
    const set = new RRuleSet()
    set.addRRule({
      freq: 'DAILY',
      count: 3,
      dtstart: zdt(2024, 1, 1, 9, 0, 0, 'UTC'),
    })
    set.addExDate(zdt(2024, 1, 2, 9, 0, 0, 'UTC'))
    const results = set.expand()
    expect(results).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// expand() with limit on RRuleSet
// ---------------------------------------------------------------------------

describe('RRuleSet.expand(limit)', () => {
  it('limits output when limit is smaller than total occurrences', () => {
    const set = new RRuleSet()
    set.addRRule({
      freq: 'DAILY',
      count: 100,
      dtstart: pdt(2024, 1, 1),
    })
    const results = set.expand(5)
    expect(results).toHaveLength(5)
  })

  it('no limit: returns all available occurrences', () => {
    const set = new RRuleSet()
    set.addRRule({
      freq: 'DAILY',
      count: 7,
      dtstart: pdt(2024, 1, 1),
    })
    const results = set.expand()
    expect(results).toHaveLength(7)
  })
})
