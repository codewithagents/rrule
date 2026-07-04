// Adversarial boundary-region generator for the differential sweep.
//
// This is the AGGRESSIVE counterpart to generator.ts. The safe generator uses
// deliberately conservative caps (byMonthDay +/-28, byWeekNo <=52, byYearDay
// <=365, ordinals +/-4, no UNTIL, gap-avoiding dtstarts) so that its output is
// clean by construction and usable as a calibration baseline. This generator
// intentionally aims at the month-length / leap-year / ISO-week-53 / 5th-weekday
// / DST-gap boundaries where either rrule-ts OR python-dateutil is most likely
// to be wrong.
//
// Like the safe generator it is VALID-BY-CONSTRUCTION: every emitted case is run
// through rrule-ts validate() and dropped if it fails, so the oracle and the
// engine are only ever compared on RFC-legal input.
//
// Boundary regions targeted:
//   - BYMONTHDAY: 29, 30, 31 and -29, -30, -31 (day 31 in 30-day months, Feb).
//   - BYWEEKNO (YEARLY): 53, -1, -53 (ISO week 53 exists only in some years).
//   - BYYEARDAY (YEARLY + sub-daily): 366, -366, 365, -1, 60 (leap-day edge).
//   - BYDAY ordinals: +5 / -5 (the 5th weekday frequently does not exist).
//   - INTERVAL: widened up to 12.
//   - UNTIL: ~40% of cases use UNTIL instead of COUNT, with the RFC 5545
//     value-type rule respected (floating dtstart -> local UNTIL, UTC/zoned
//     dtstart -> UTC UNTIL).
//   - DTSTART: leap-year / Feb-29 anchors AND spring-forward-gap dtstarts.

import * as fc from 'fast-check'
import { validate, stringify, getTemporal } from 'rrule-ts'
import type { RRuleOptions, Frequency, Weekday, RRuleUntil, RRuleDtstart } from 'rrule-ts'
import type { OracleInput } from './generator.js'

// ---------------------------------------------------------------------------
// Shared sub-arbitraries
// ---------------------------------------------------------------------------

const weekdayArb = fc.constantFrom<Weekday>('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU')

const weekdaySetArb = fc
  .uniqueArray(weekdayArb, { minLength: 1, maxLength: 4 })
  .map((days) => days.map((w) => ({ ordinal: undefined as number | undefined, weekday: w })))

// Ordinal BYDAY entries reaching the +/-5 boundary (5th weekday often absent).
const weekdayWithOrdinalArb = fc
  .record({
    ordinal: fc.oneof(
      fc.integer({ min: 1, max: 5 }),
      fc.integer({ min: -5, max: -1 }),
      fc.constantFrom(5, -5, 4, -4)
    ),
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

// BYMONTHDAY across the full legal range, with month-length edges emphasised.
const byMonthDayArb = fc.option(
  fc.uniqueArray(
    fc.oneof(
      fc.integer({ min: 1, max: 31 }),
      fc.integer({ min: -31, max: -1 }),
      fc.constantFrom(28, 29, 30, 31, -28, -29, -30, -31)
    ),
    { minLength: 1, maxLength: 3 }
  ),
  { nil: undefined }
)

// INTERVAL widened to 12 for date-based frequencies.
const intervalArb = fc.option(fc.integer({ min: 1, max: 12 }), { nil: undefined })

// INTERVAL for sub-daily (HOURLY/MINUTELY/SECONDLY) is biased toward 1. A
// sub-daily rule only becomes DEGENERATE (never-matching, so the engine grinds
// its entire ~200-year forward-scan horizon while dateutil errors instantly)
// when INTERVAL > 1 collides with a phase-incompatible BYHOUR/BYMINUTE/BYSECOND
// filter. Keeping INTERVAL mostly 1 preserves rich sub-daily + DST coverage
// while keeping the sweep fast; a minority of INTERVAL 2-4 cases still exercise
// the interval-stepping path (and the empty-set boundary) cheaply.
const subDailyIntervalArb = fc.constantFrom(
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  2,
  3,
  4
)
const countArb = fc.integer({ min: 3, max: 12 })
const wkstArb = fc.option(weekdayArb, { nil: undefined })

// Whether a case uses UNTIL (true) or COUNT (false); ~40% UNTIL.
const useUntilArb = fc.integer({ min: 0, max: 9 }).map((n) => n < 4)
// How many periods past dtstart to place UNTIL.
const untilKArb = fc.integer({ min: 3, max: 8 })

// BYWEEKNO reaching week 53 and negatives.
const byWeekNoArb = fc.option(
  fc.uniqueArray(
    fc.oneof(
      fc.integer({ min: 1, max: 53 }),
      fc.integer({ min: -53, max: -1 }),
      fc.constantFrom(53, -1, -53, 52, 1)
    ),
    { minLength: 1, maxLength: 2 }
  ),
  { nil: undefined }
)

// BYYEARDAY reaching the leap-day boundary in both directions.
const byYearDayArb = fc.option(
  fc.uniqueArray(
    fc.oneof(
      fc.integer({ min: 1, max: 366 }),
      fc.integer({ min: -366, max: -1 }),
      fc.constantFrom(366, -366, 365, -365, -1, 1, 60)
    ),
    { minLength: 1, maxLength: 3 }
  ),
  { nil: undefined }
)

// ---------------------------------------------------------------------------
// DTSTART variants: the safe set PLUS leap-day anchors AND spring-forward-gap
// dtstarts (deliberately inside the nonexistent wall-clock window so the known
// deviation is hit head-on and quantified, not avoided).
// ---------------------------------------------------------------------------

interface DtVariant {
  dtstart: string
  tzid: string | null
}

const dtstartVariants: DtVariant[] = [
  // Floating / UTC baselines.
  { dtstart: '1997-09-02T09:00:00', tzid: null },
  { dtstart: '1997-09-02T09:00:00Z', tzid: null },
  // Zoned, non-DST month.
  { dtstart: '2024-01-15T10:00:00', tzid: 'America/New_York' },
  { dtstart: '2024-01-15T10:00:00', tzid: 'Europe/Berlin' },
  // Leap-year / Feb-29 anchors (floating, UTC, zoned).
  { dtstart: '2024-02-29T09:00:00', tzid: null },
  { dtstart: '2024-02-29T09:00:00Z', tzid: null },
  { dtstart: '2024-02-29T12:00:00', tzid: 'America/New_York' },
  { dtstart: '2024-02-29T23:30:00', tzid: 'Europe/Berlin' },
  // Year-boundary anchors (Jan 1 leap + common year) to exercise 366/-366.
  { dtstart: '2024-01-01T00:30:00', tzid: null },
  { dtstart: '2023-01-01T00:30:00', tzid: null },
  { dtstart: '2020-12-31T23:00:00', tzid: null },
  // Fall-back fold anchors (post-fold, safe).
  { dtstart: '2024-11-03T00:30:00', tzid: 'America/Los_Angeles' },
  { dtstart: '2024-10-27T00:30:00', tzid: 'Europe/Berlin' },
  { dtstart: '2024-04-07T02:30:00', tzid: 'Australia/Lord_Howe' },
  // Post-gap safe zoned anchors.
  { dtstart: '2024-03-10T10:00:00', tzid: 'America/Los_Angeles' },
  { dtstart: '2024-03-31T10:00:00', tzid: 'Europe/Berlin' },
  { dtstart: '2024-09-27T10:00:00', tzid: 'Pacific/Apia' },
  // SPRING-FORWARD GAP anchors (wall time inside the nonexistent window).
  { dtstart: '2024-03-10T02:30:00', tzid: 'America/Los_Angeles' }, // gap 02:00-03:00 PST
  { dtstart: '2024-03-31T02:30:00', tzid: 'Europe/Berlin' }, // gap 02:00-03:00 CET
  { dtstart: '2024-10-06T02:15:00', tzid: 'Australia/Lord_Howe' }, // gap 02:00-02:30
]

const dtstartArb = fc.constantFrom(...dtstartVariants)

// ---------------------------------------------------------------------------
// Per-FREQ option descriptors. These produce PLAIN option data (numbers, flags)
// only; Temporal construction happens later in the sampling loop so fast-check
// arbitraries stay pure.
// ---------------------------------------------------------------------------

type ByDayKind = 'plain' | 'ordinal' | 'none'

interface OptsDescriptor {
  freq: Frequency
  interval?: number
  count: number
  wkst?: Weekday
  byMonth?: number[]
  byMonthDay?: number[]
  byWeekNo?: number[]
  byYearDay?: number[]
  byHour?: number[]
  byMinute?: number[]
  bySecond?: number[]
  byDayKind?: ByDayKind
  ordinalByDay?: Array<{ ordinal: number | undefined; weekday: Weekday }>
  plainByDay?: Array<{ ordinal: number | undefined; weekday: Weekday }>
  includeSetPos?: boolean
  bySetPos?: number[]
}

const bySetPosArb = fc.option(
  fc.uniqueArray(fc.oneof(fc.integer({ min: 1, max: 5 }), fc.integer({ min: -5, max: -1 })), {
    minLength: 1,
    maxLength: 2,
  }),
  { nil: undefined }
)

function yearlyDescriptorArb(): fc.Arbitrary<OptsDescriptor> {
  return fc.record({
    freq: fc.constant('YEARLY' as Frequency),
    interval: intervalArb,
    count: countArb,
    wkst: wkstArb,
    byMonth: byMonthArb,
    byWeekNo: byWeekNoArb,
    byYearDay: byYearDayArb,
    byMonthDay: byMonthDayArb,
    byHour: byHourArb,
    byMinute: byMinuteArb,
    byDayKind: fc.constantFrom<ByDayKind>('plain', 'ordinal', 'none'),
    plainByDay: weekdaySetArb,
    ordinalByDay: weekdayWithOrdinalArb,
    includeSetPos: fc.boolean(),
    bySetPos: bySetPosArb,
  })
}

function monthlyDescriptorArb(): fc.Arbitrary<OptsDescriptor> {
  return fc.record({
    freq: fc.constant('MONTHLY' as Frequency),
    interval: intervalArb,
    count: countArb,
    wkst: wkstArb,
    byMonth: byMonthArb,
    byMonthDay: byMonthDayArb,
    byHour: byHourArb,
    byMinute: byMinuteArb,
    byDayKind: fc.constantFrom<ByDayKind>('plain', 'ordinal', 'none'),
    plainByDay: weekdaySetArb,
    ordinalByDay: weekdayWithOrdinalArb,
    includeSetPos: fc.boolean(),
    bySetPos: bySetPosArb,
  })
}

function weeklyDescriptorArb(): fc.Arbitrary<OptsDescriptor> {
  return fc.record({
    freq: fc.constant('WEEKLY' as Frequency),
    interval: intervalArb,
    count: countArb,
    wkst: wkstArb,
    byMonth: byMonthArb,
    byHour: byHourArb,
    byMinute: byMinuteArb,
    byDayKind: fc.constantFrom<ByDayKind>('plain', 'none'),
    plainByDay: weekdaySetArb,
  })
}

function dailyDescriptorArb(): fc.Arbitrary<OptsDescriptor> {
  return fc.record({
    freq: fc.constant('DAILY' as Frequency),
    interval: intervalArb,
    count: countArb,
    wkst: wkstArb,
    byMonth: byMonthArb,
    byMonthDay: byMonthDayArb,
    byHour: byHourArb,
    byMinute: byMinuteArb,
    bySecond: bySecondArb,
    byDayKind: fc.constantFrom<ByDayKind>('plain', 'none'),
    plainByDay: weekdaySetArb,
    includeSetPos: fc.boolean(),
    bySetPos: bySetPosArb,
  })
}

function subDailyDescriptorArb(
  freq: 'HOURLY' | 'MINUTELY' | 'SECONDLY'
): fc.Arbitrary<OptsDescriptor> {
  // Sub-daily rules (HOURLY/MINUTELY/SECONDLY) carry ONLY time-level filters
  // (BYHOUR/BYMINUTE/BYSECOND) in the random sweep. Random COMBINATIONS of
  // day-level filters (BYMONTH+BYMONTHDAY+BYYEARDAY+BYDAY) on a sub-daily rule
  // are usually sparse or contradictory, which makes the dateutil oracle grind
  // day-by-day across thousands of years (no day satisfies all masks). That is
  // pure harness cost, not signal.
  //
  // The genuinely interesting behaviour there, whether the engine applies
  // day-level LIMITS to a sub-daily rule at all (RFC 5545 Table 1: BYMONTH/
  // BYMONTHDAY/BYDAY/BYYEARDAY are all "Limit" for HOURLY/MINUTELY/SECONDLY),
  // is covered deterministically by the subDailyDayLimitCases() regression set
  // below with SIMPLE, oracle-fast filters, instead of by random grind-prone
  // combinations.
  return fc.record({
    freq: fc.constant(freq as Frequency),
    interval: subDailyIntervalArb,
    count: countArb,
    byHour: byHourArb,
    byMinute: byMinuteArb,
    bySecond: bySecondArb,
  })
}

interface CaseDescriptor {
  desc: OptsDescriptor
  dtstart: string
  tzid: string | null
  useUntil: boolean
  untilK: number
}

function caseArb(): fc.Arbitrary<CaseDescriptor> {
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
      useUntil: useUntilArb,
      untilK: untilKArb,
    })
    .chain(({ freq, dtstartVariant, useUntil, untilK }) => {
      const descArb: fc.Arbitrary<OptsDescriptor> =
        freq === 'YEARLY'
          ? yearlyDescriptorArb()
          : freq === 'MONTHLY'
            ? monthlyDescriptorArb()
            : freq === 'WEEKLY'
              ? weeklyDescriptorArb()
              : freq === 'DAILY'
                ? dailyDescriptorArb()
                : subDailyDescriptorArb(freq as 'HOURLY' | 'MINUTELY' | 'SECONDLY')

      return descArb.map((desc) => ({
        desc,
        dtstart: dtstartVariant.dtstart,
        tzid: dtstartVariant.tzid,
        useUntil,
        untilK,
      }))
    })
}

// ---------------------------------------------------------------------------
// Descriptor -> RRuleOptions (plain, no Temporal)
// ---------------------------------------------------------------------------

function resolveByDay(d: OptsDescriptor): RRuleOptions['byDay'] {
  if (d.byDayKind === 'plain') return d.plainByDay as RRuleOptions['byDay']
  if (d.byDayKind === 'ordinal') return d.ordinalByDay as RRuleOptions['byDay']
  return undefined
}

function descriptorToOptions(d: OptsDescriptor): RRuleOptions {
  const byDay = resolveByDay(d)
  const opts: RRuleOptions = { freq: d.freq }
  if (d.interval !== undefined) opts.interval = d.interval
  if (d.wkst !== undefined) opts.wkst = d.wkst
  if (d.byMonth !== undefined) opts.byMonth = d.byMonth
  if (d.byMonthDay !== undefined) opts.byMonthDay = d.byMonthDay
  if (d.byWeekNo !== undefined) opts.byWeekNo = d.byWeekNo
  if (d.byYearDay !== undefined) opts.byYearDay = d.byYearDay
  if (d.byHour !== undefined) opts.byHour = d.byHour
  if (d.byMinute !== undefined) opts.byMinute = d.byMinute
  if (d.bySecond !== undefined) opts.bySecond = d.bySecond
  if (byDay !== undefined) opts.byDay = byDay

  // BYSETPOS requires at least one other BY* rule.
  const hasByRule =
    opts.byMonth !== undefined ||
    opts.byMonthDay !== undefined ||
    opts.byWeekNo !== undefined ||
    opts.byYearDay !== undefined ||
    opts.byHour !== undefined ||
    opts.byMinute !== undefined ||
    opts.bySecond !== undefined ||
    opts.byDay !== undefined
  if (d.includeSetPos && d.bySetPos !== undefined && hasByRule) {
    opts.bySetPos = d.bySetPos
  }
  return opts
}

// ---------------------------------------------------------------------------
// UNTIL construction (RFC 5545 value-type rules honoured)
// ---------------------------------------------------------------------------

function parseDtstartTemporal(
  T: typeof Temporal,
  dtstart: string,
  tzid: string | null
): RRuleDtstart {
  if (tzid !== null) return T.ZonedDateTime.from(`${dtstart}[${tzid}]`)
  if (dtstart.endsWith('Z')) return T.Instant.from(dtstart)
  return T.PlainDateTime.from(dtstart)
}

type DurationLike = Record<string, number>

function periodDuration(freq: Frequency, amount: number): DurationLike {
  switch (freq) {
    case 'YEARLY':
      return { years: amount }
    case 'MONTHLY':
      return { months: amount }
    case 'WEEKLY':
      return { weeks: amount }
    case 'DAILY':
      return { days: amount }
    case 'HOURLY':
      return { hours: amount }
    case 'MINUTELY':
      return { minutes: amount }
    case 'SECONDLY':
      return { seconds: amount }
  }
}

/**
 * Build an UNTIL value placed roughly `k` periods past dtstart, of the RFC-legal
 * value type for the given dtstart:
 *   - floating dtstart  -> floating UNTIL (PlainDateTime)
 *   - UTC dtstart       -> UTC UNTIL      (Instant)
 *   - zoned dtstart     -> UTC UNTIL      (Instant; RFC 5545 mandates UTC)
 */
function computeUntil(
  T: typeof Temporal,
  dtstart: string,
  tzid: string | null,
  freq: Frequency,
  interval: number,
  k: number
): RRuleUntil {
  const amount = Math.max(1, interval) * k
  const dur = periodDuration(freq, amount)

  if (tzid !== null) {
    const zdt = T.ZonedDateTime.from(`${dtstart}[${tzid}]`)
    return zdt.add(dur).toInstant()
  }
  if (dtstart.endsWith('Z')) {
    const inst = T.Instant.from(dtstart)
    return inst.toZonedDateTimeISO('UTC').add(dur).toInstant()
  }
  return T.PlainDateTime.from(dtstart).add(dur)
}

// ---------------------------------------------------------------------------
// RRULE string extraction (strip DTSTART/TZID, keep only the RRULE value)
// ---------------------------------------------------------------------------

function rruleOnly(opts: RRuleOptions): string {
  const { dtstart: _d, tzid: _t, ...rruleOpts } = opts
  const str = stringify(rruleOpts)
  return str.startsWith('RRULE:') ? str.slice(6) : str
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Deterministic sub-daily day-level LIMIT regression cases.
 *
 * RFC 5545 §3.3.10 Table 1: for HOURLY/MINUTELY/SECONDLY the BYMONTH,
 * BYMONTHDAY, BYYEARDAY and BYDAY rule parts all act as a LIMIT (filter). These
 * cases use SIMPLE, single day-level filters that the dateutil oracle resolves
 * quickly (bounded day-by-day advance to the next matching day), unlike the
 * random multi-filter combinations that make dateutil grind. They exist so the
 * sweep still exercises "does a sub-daily rule apply its day-level limits" on a
 * fast, curated set.
 */
export function subDailyDayLimitCases(): OracleInput[] {
  const specs: Array<{ rrule: string; dtstart: string; tzid: string | null }> = [
    // HOURLY + a single day-level limit.
    {
      rrule: 'FREQ=HOURLY;BYHOUR=9;BYMONTHDAY=15;COUNT=6',
      dtstart: '2024-01-01T00:00:00',
      tzid: null,
    },
    { rrule: 'FREQ=HOURLY;BYHOUR=9;BYDAY=MO;COUNT=6', dtstart: '2024-01-01T00:00:00', tzid: null },
    { rrule: 'FREQ=HOURLY;BYHOUR=9;BYMONTH=6;COUNT=6', dtstart: '2024-01-01T00:00:00', tzid: null },
    {
      rrule: 'FREQ=HOURLY;BYHOUR=9;BYYEARDAY=100;COUNT=4',
      dtstart: '2024-01-01T00:00:00',
      tzid: null,
    },
    {
      rrule: 'FREQ=HOURLY;BYHOUR=9;BYMONTHDAY=15;COUNT=6',
      dtstart: '2024-01-01T00:00:00',
      tzid: 'America/New_York',
    },
    {
      rrule: 'FREQ=HOURLY;BYHOUR=9;BYDAY=MO;COUNT=6',
      dtstart: '2024-01-01T00:00:00',
      tzid: 'Europe/Berlin',
    },
    // MINUTELY + a single day-level limit.
    {
      rrule: 'FREQ=MINUTELY;BYHOUR=9;BYMINUTE=0;BYMONTHDAY=15;COUNT=4',
      dtstart: '2024-01-01T00:00:00',
      tzid: null,
    },
    {
      rrule: 'FREQ=MINUTELY;BYHOUR=9;BYMINUTE=0;BYDAY=WE;COUNT=4',
      dtstart: '2024-01-01T00:00:00',
      tzid: null,
    },
    {
      rrule: 'FREQ=MINUTELY;BYHOUR=9;BYMINUTE=0;BYMONTH=6;COUNT=4',
      dtstart: '2024-01-01T00:00:00',
      tzid: null,
    },
    // SECONDLY + a single day-level limit.
    {
      rrule: 'FREQ=SECONDLY;BYHOUR=9;BYMINUTE=0;BYSECOND=0;BYMONTHDAY=15;COUNT=4',
      dtstart: '2024-01-01T00:00:00',
      tzid: null,
    },
    {
      rrule: 'FREQ=SECONDLY;BYHOUR=9;BYMINUTE=0;BYSECOND=0;BYDAY=FR;COUNT=4',
      dtstart: '2024-01-01T00:00:00',
      tzid: null,
    },
    {
      rrule: 'FREQ=SECONDLY;BYHOUR=9;BYMINUTE=0;BYSECOND=0;BYYEARDAY=200;COUNT=4',
      dtstart: '2024-01-01T00:00:00',
      tzid: null,
    },
  ]
  return specs.map((s, i) => ({
    id: `subdaily-limit-${i}`,
    label: `sub-daily day-limit: ${s.rrule.match(/FREQ=(\w+)/)?.[1]}`,
    rrule: s.rrule,
    dtstart: s.dtstart,
    tzid: s.tzid,
    count: Number(s.rrule.match(/COUNT=(\d+)/)?.[1] ?? 6),
  }))
}

/**
 * Sample `n` valid aggressive-boundary RRULE cases. Every candidate is run
 * through rrule-ts validate() and dropped if it fails, so callers only ever see
 * RFC-legal input. Deterministic in `seed`.
 *
 * A safety `count` cap (default 50) is always present in the oracle input, even
 * for UNTIL cases, so the oracle never runs unbounded.
 */
export function sampleCasesAggressive(n: number, seed = 1337, countCap = 50): OracleInput[] {
  const T = getTemporal()
  const candidates = fc.sample(caseArb(), { numRuns: n * 3, seed })
  const results: OracleInput[] = []
  let idx = 0

  for (const cand of candidates) {
    if (results.length >= n) break

    const opts = descriptorToOptions(cand.desc)
    const interval = opts.interval ?? 1

    let oracleCount: number
    if (cand.useUntil) {
      let until: RRuleUntil
      let dtstartTemporal: RRuleDtstart
      try {
        until = computeUntil(T, cand.dtstart, cand.tzid, cand.desc.freq, interval, cand.untilK)
        dtstartTemporal = parseDtstartTemporal(T, cand.dtstart, cand.tzid)
      } catch {
        continue
      }
      opts.until = until
      // dtstart/tzid are set ONLY so validate() can enforce the UNTIL value-type
      // rule; they are stripped again before stringify.
      opts.dtstart = dtstartTemporal
      if (cand.tzid !== null) opts.tzid = cand.tzid
      oracleCount = countCap
    } else {
      opts.count = cand.desc.count
      oracleCount = cand.desc.count
    }

    const vResult = validate(opts)
    if (!vResult.ok) continue

    const rruleLine = rruleOnly(opts)

    results.push({
      id: `agg-${idx++}`,
      label: `aggressive: FREQ=${opts.freq}${cand.useUntil ? ';UNTIL' : ';COUNT'}`,
      rrule: rruleLine,
      dtstart: cand.dtstart,
      tzid: cand.tzid,
      count: oracleCount,
    })
  }

  return results
}
