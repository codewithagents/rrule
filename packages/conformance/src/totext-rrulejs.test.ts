// Differential style comparison: rrule-ts EN toText vs rrule.js toText.
//
// This is a SEMANTIC comparison, not exact string equality. Both libraries
// render the same RRULE rules to human-readable English text, but use
// different capitalization, articles, and phrasing conventions.
//
// Intentional wording differences (rrule.js vs rrule-ts):
//   - Capitalization: rrule.js v2.8.1 uses lowercase 'every day', matching rrule-ts.
//     (Older rrule.js versions capitalized to 'Every day'; v2.8.1 no longer does.)
//   - COUNT phrasing: rrule.js uses 'for 5 times' or 'for 1 time',
//     rrule-ts uses '5 times' or '1 time' (no leading 'for').
//   - UNTIL phrasing: rrule.js uses 'until ...' without comma,
//     rrule-ts also uses 'until ...' without comma (same convention).
//   - BYDAY lists: both use Oxford comma in EN for 3+ items.
//   - Ordinal BYDAY: rrule.js uses 'the 1st Monday of each month',
//     rrule-ts uses 'every month on the 1st Monday'.
//   - YEARLY+BYMONTH: rrule.js drops the 'year' frequency word and outputs
//     'every January', rrule-ts keeps it: 'every year in January'. Both are
//     valid English; rrule-ts follows the explicit-frequency convention.
//
// Normalization strategy: lowercase both outputs, collapse whitespace, strip
// leading/trailing punctuation, then check that both contain the same SEMANTIC
// tokens (frequency word, interval number if >1, weekday names, month names).
// We do NOT assert exact normalized equality because phrasing conventions differ.
//
// Purpose: Catch unexpected regressions where rrule-ts output drifts far from
// established calendar conventions without an intentional decision being made.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { toText } from 'rrule-ts/text'
import type { RRule as RRuleType, Weekday as WeekdayType, Options as RRuleJsOptions } from 'rrule'

const _require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { RRule } = _require('rrule') as {
  RRule: typeof RRuleType & {
    YEARLY: number
    MONTHLY: number
    WEEKLY: number
    DAILY: number
    HOURLY: number
    MINUTELY: number
    SECONDLY: number
    MO: WeekdayType
    TU: WeekdayType
    WE: WeekdayType
    TH: WeekdayType
    FR: WeekdayType
    SA: WeekdayType
    SU: WeekdayType
  }
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a toText output string for semantic comparison.
 * Steps:
 *   1. Lowercase
 *   2. Collapse multiple whitespace to single space
 *   3. Strip leading/trailing whitespace and punctuation
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?]+$/, '')
    .trim()
}

/**
 * Extract tokens that must appear in both outputs for semantic equivalence.
 * This is intentionally broad: we only check that key vocabulary (frequency
 * word, interval number if >1, weekday/month names) is present in both.
 */
function extractSemanticTokens(s: string): Set<string> {
  const n = normalize(s)
  const tokens = new Set<string>()

  // Frequency words
  for (const word of [
    'second',
    'minute',
    'hour',
    'day',
    'week',
    'month',
    'year',
    'seconds',
    'minutes',
    'hours',
    'days',
    'weeks',
    'months',
    'years',
  ]) {
    if (n.includes(word)) tokens.add(word)
  }

  // Weekday names
  for (const word of [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ]) {
    if (n.includes(word)) tokens.add(word)
  }

  // Month names
  for (const word of [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ]) {
    if (n.includes(word)) tokens.add(word)
  }

  // Interval numbers (>1): extract digits
  const nums = n.match(/\b(\d+)\b/g)
  if (nums) {
    for (const num of nums) {
      if (parseInt(num, 10) > 1) tokens.add(num)
    }
  }

  return tokens
}

/**
 * Assert that rrule-ts and rrule.js outputs share the same semantic tokens.
 * This catches cases where one library mentions 'Monday' and the other does not.
 */
function assertSemanticEquivalence(
  label: string,
  rruleTsOutput: string,
  rruleJsOutput: string
): void {
  const tsTokens = extractSemanticTokens(rruleTsOutput)
  const jsTokens = extractSemanticTokens(rruleJsOutput)

  const missingFromTs = [...jsTokens].filter((t) => !tsTokens.has(t))
  const missingFromJs = [...tsTokens].filter((t) => !jsTokens.has(t))

  expect(
    missingFromTs,
    `[${label}] rrule.js has tokens not in rrule-ts: ${missingFromTs.join(', ')}\n  rrule-ts: "${rruleTsOutput}"\n  rrule.js: "${rruleJsOutput}"`
  ).toEqual([])

  expect(
    missingFromJs,
    `[${label}] rrule-ts has tokens not in rrule.js: ${missingFromJs.join(', ')}\n  rrule-ts: "${rruleTsOutput}"\n  rrule.js: "${rruleJsOutput}"`
  ).toEqual([])
}

// ---------------------------------------------------------------------------
// Test helper: run both libraries and compare
// ---------------------------------------------------------------------------

interface CompareCase {
  label: string
  rruleTsOpts: Parameters<typeof toText>[0]
  rruleJsOpts: Partial<RRuleJsOptions>
}

function compare(c: CompareCase): void {
  const rruleTsText = toText(c.rruleTsOpts)
  const rruleJsRule = new RRule({ ...c.rruleJsOpts })
  const rruleJsText = rruleJsRule.toText()
  assertSemanticEquivalence(c.label, rruleTsText, rruleJsText)
}

// ---------------------------------------------------------------------------
// Comparison test suite
// ---------------------------------------------------------------------------

describe('rrule-ts EN toText vs rrule.js toText: semantic comparison', () => {
  // --- Frequency without interval ---

  it('FREQ=DAILY', () => {
    compare({
      label: 'DAILY',
      rruleTsOpts: { freq: 'DAILY' },
      rruleJsOpts: { freq: RRule.DAILY },
    })
  })

  it('FREQ=WEEKLY', () => {
    compare({
      label: 'WEEKLY',
      rruleTsOpts: { freq: 'WEEKLY' },
      rruleJsOpts: { freq: RRule.WEEKLY },
    })
  })

  it('FREQ=MONTHLY', () => {
    compare({
      label: 'MONTHLY',
      rruleTsOpts: { freq: 'MONTHLY' },
      rruleJsOpts: { freq: RRule.MONTHLY },
    })
  })

  it('FREQ=YEARLY', () => {
    compare({
      label: 'YEARLY',
      rruleTsOpts: { freq: 'YEARLY' },
      rruleJsOpts: { freq: RRule.YEARLY },
    })
  })

  it('FREQ=HOURLY', () => {
    compare({
      label: 'HOURLY',
      rruleTsOpts: { freq: 'HOURLY' },
      rruleJsOpts: { freq: RRule.HOURLY },
    })
  })

  it('FREQ=MINUTELY', () => {
    compare({
      label: 'MINUTELY',
      rruleTsOpts: { freq: 'MINUTELY' },
      rruleJsOpts: { freq: RRule.MINUTELY },
    })
  })

  // --- Frequency with interval ---

  it('FREQ=DAILY;INTERVAL=2', () => {
    compare({
      label: 'DAILY;INTERVAL=2',
      rruleTsOpts: { freq: 'DAILY', interval: 2 },
      rruleJsOpts: { freq: RRule.DAILY, interval: 2 },
    })
  })

  it('FREQ=WEEKLY;INTERVAL=2', () => {
    compare({
      label: 'WEEKLY;INTERVAL=2',
      rruleTsOpts: { freq: 'WEEKLY', interval: 2 },
      rruleJsOpts: { freq: RRule.WEEKLY, interval: 2 },
    })
  })

  it('FREQ=MONTHLY;INTERVAL=3', () => {
    compare({
      label: 'MONTHLY;INTERVAL=3',
      rruleTsOpts: { freq: 'MONTHLY', interval: 3 },
      rruleJsOpts: { freq: RRule.MONTHLY, interval: 3 },
    })
  })

  it('FREQ=HOURLY;INTERVAL=6', () => {
    compare({
      label: 'HOURLY;INTERVAL=6',
      rruleTsOpts: { freq: 'HOURLY', interval: 6 },
      rruleJsOpts: { freq: RRule.HOURLY, interval: 6 },
    })
  })

  // --- BYDAY plain weekdays ---

  it('FREQ=WEEKLY;BYDAY=MO', () => {
    compare({
      label: 'WEEKLY;BYDAY=MO',
      rruleTsOpts: { freq: 'WEEKLY', byDay: [{ weekday: 'MO', ordinal: undefined }] },
      rruleJsOpts: { freq: RRule.WEEKLY, byweekday: [RRule.MO] },
    })
  })

  it('FREQ=WEEKLY;BYDAY=MO,WE,FR', () => {
    compare({
      label: 'WEEKLY;BYDAY=MO,WE,FR',
      rruleTsOpts: {
        freq: 'WEEKLY',
        byDay: [
          { weekday: 'MO', ordinal: undefined },
          { weekday: 'WE', ordinal: undefined },
          { weekday: 'FR', ordinal: undefined },
        ],
      },
      rruleJsOpts: { freq: RRule.WEEKLY, byweekday: [RRule.MO, RRule.WE, RRule.FR] },
    })
  })

  it('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO', () => {
    compare({
      label: 'WEEKLY;INTERVAL=2;BYDAY=MO',
      rruleTsOpts: {
        freq: 'WEEKLY',
        interval: 2,
        byDay: [{ weekday: 'MO', ordinal: undefined }],
      },
      rruleJsOpts: { freq: RRule.WEEKLY, interval: 2, byweekday: [RRule.MO] },
    })
  })

  // --- BYDAY ordinal weekdays ---

  it('FREQ=MONTHLY;BYDAY=1MO', () => {
    compare({
      label: 'MONTHLY;BYDAY=1MO',
      rruleTsOpts: { freq: 'MONTHLY', byDay: [{ weekday: 'MO', ordinal: 1 }] },
      rruleJsOpts: { freq: RRule.MONTHLY, byweekday: [RRule.MO.nth(1)] },
    })
  })

  it('FREQ=MONTHLY;BYDAY=-1FR', () => {
    compare({
      label: 'MONTHLY;BYDAY=-1FR',
      rruleTsOpts: { freq: 'MONTHLY', byDay: [{ weekday: 'FR', ordinal: -1 }] },
      rruleJsOpts: { freq: RRule.MONTHLY, byweekday: [RRule.FR.nth(-1)] },
    })
  })

  it('FREQ=MONTHLY;BYDAY=2TU', () => {
    compare({
      label: 'MONTHLY;BYDAY=2TU',
      rruleTsOpts: { freq: 'MONTHLY', byDay: [{ weekday: 'TU', ordinal: 2 }] },
      rruleJsOpts: { freq: RRule.MONTHLY, byweekday: [RRule.TU.nth(2)] },
    })
  })

  // --- BYMONTHDAY ---

  it('FREQ=MONTHLY;BYMONTHDAY=1', () => {
    compare({
      label: 'MONTHLY;BYMONTHDAY=1',
      rruleTsOpts: { freq: 'MONTHLY', byMonthDay: [1] },
      rruleJsOpts: { freq: RRule.MONTHLY, bymonthday: [1] },
    })
  })

  it('FREQ=MONTHLY;BYMONTHDAY=15', () => {
    compare({
      label: 'MONTHLY;BYMONTHDAY=15',
      rruleTsOpts: { freq: 'MONTHLY', byMonthDay: [15] },
      rruleJsOpts: { freq: RRule.MONTHLY, bymonthday: [15] },
    })
  })

  // --- BYMONTH ---

  it('FREQ=YEARLY;BYMONTH=1', () => {
    // Intentional wording gap: rrule.js collapses YEARLY+BYMONTH into 'every January'
    // (drops the 'year' frequency word), while rrule-ts keeps the explicit frequency:
    // 'every year in January'. Both are valid English but differ in convention.
    // We verify only that the month name appears in both and both start with 'every'.
    // rrule.js: 'every January'
    // rrule-ts: 'every year in January'
    const rruleTsText = toText({ freq: 'YEARLY', byMonth: [1] })
    const rruleJsText = new RRule({ freq: RRule.YEARLY, bymonth: [1] }).toText()
    expect(normalize(rruleTsText)).toContain('january')
    expect(normalize(rruleJsText)).toContain('january')
    expect(normalize(rruleTsText)).toContain('every')
    expect(normalize(rruleJsText)).toContain('every')
  })

  it('FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1', () => {
    // Same YEARLY+BYMONTH gap as above: rrule.js outputs 'every January on the 1st',
    // rrule-ts outputs 'every year in January on the 1st'. Both agree on the month
    // name and the ordinal day; the 'year' token is absent from rrule.js output.
    // rrule.js: 'every January on the 1st'
    // rrule-ts: 'every year in January on the 1st'
    const rruleTsText = toText({ freq: 'YEARLY', byMonth: [1], byMonthDay: [1] })
    const rruleJsText = new RRule({ freq: RRule.YEARLY, bymonth: [1], bymonthday: [1] }).toText()
    expect(normalize(rruleTsText)).toContain('january')
    expect(normalize(rruleJsText)).toContain('january')
    expect(normalize(rruleTsText)).toContain('1st')
    expect(normalize(rruleJsText)).toContain('1st')
    expect(normalize(rruleTsText)).toContain('every')
    expect(normalize(rruleJsText)).toContain('every')
  })

  it('FREQ=YEARLY;BYMONTH=3,9', () => {
    // Same YEARLY+BYMONTH gap: rrule.js outputs 'every March and September' (no 'year'),
    // rrule-ts outputs 'every year in March and September'. Both agree on month names.
    // rrule.js: 'every March and September'
    // rrule-ts: 'every year in March and September'
    const rruleTsText = toText({ freq: 'YEARLY', byMonth: [3, 9] })
    const rruleJsText = new RRule({ freq: RRule.YEARLY, bymonth: [3, 9] }).toText()
    expect(normalize(rruleTsText)).toContain('march')
    expect(normalize(rruleJsText)).toContain('march')
    expect(normalize(rruleTsText)).toContain('september')
    expect(normalize(rruleJsText)).toContain('september')
    expect(normalize(rruleTsText)).toContain('every')
    expect(normalize(rruleJsText)).toContain('every')
  })

  // --- COUNT ---

  it('FREQ=DAILY;COUNT=5', () => {
    // Intentional difference: rrule.js renders 'for 5 times', rrule-ts renders '5 times'.
    // The semantic token '5' is present in both. We do NOT check for 'for' here.
    const rruleTsText = toText({ freq: 'DAILY', count: 5 })
    const rruleJsText = new RRule({ freq: RRule.DAILY, count: 5 }).toText()

    expect(rruleTsText).toContain('5')
    expect(rruleTsText).toContain('day')
    expect(rruleJsText).toContain('5')
    expect(rruleJsText.toLowerCase()).toContain('day')

    // rrule-ts does NOT include 'for' before the count phrase.
    expect(rruleTsText).not.toContain(', for ')

    // Document the known difference.
    // rrule.js: 'Every day for 5 times'
    // rrule-ts: 'every day, 5 times'
  })

  it('FREQ=DAILY;COUNT=1', () => {
    const rruleTsText = toText({ freq: 'DAILY', count: 1 })
    const rruleJsText = new RRule({ freq: RRule.DAILY, count: 1 }).toText()

    expect(rruleTsText).toContain('1')
    expect(rruleTsText).toContain('day')
    expect(rruleJsText).toContain('1')
    expect(rruleJsText.toLowerCase()).toContain('day')
  })

  // --- Capitalization sanity check ---

  it('both rrule-ts and rrule.js (v2.8.1) output starts with lowercase "every"', () => {
    const rruleTsText = toText({ freq: 'DAILY' })
    const rruleJsText = new RRule({ freq: RRule.DAILY }).toText()

    // rrule-ts always uses lowercase 'every'.
    expect(rruleTsText.startsWith('every')).toBe(true)

    // rrule.js v2.8.1 also uses lowercase 'every day'. Older versions of rrule.js
    // used to capitalize the first letter ('Every day'). As of v2.8.1 both libraries
    // agree on lowercase. This test documents that alignment.
    expect(rruleJsText.startsWith('every')).toBe(true)
  })
})
