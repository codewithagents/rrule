// fromText.ts - Tokenized recursive-descent parser for canonical EN toText output.
//
// Returns Result<RRuleOptions, string>. Never throws on user input: all errors
// are returned as Err values.
//
// Supported grammar (formal BNF, EN only):
//
//   sentence          := interval-phrase
//                        [ bymonth-clause ]
//                        [ byday-clause | bymonthday-clause ]
//                        [ time-clause ]
//                        [ terminator ]
//
//   interval-phrase   := 'every' singular-unit
//                      | 'every' UINT plural-unit
//
//   singular-unit     := 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'
//   plural-unit       := 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years'
//
//   bymonth-clause    := 'in' month-name-list
//   month-name-list   := month-name { [ ',' ] [ 'and' ] month-name }
//
//   byday-clause      := 'on' 'the' byday-the-spec
//                      | 'on' weekday-name-list
//
//   byday-the-spec    := 'last' 'day'                              -- BYMONTHDAY=-1
//                      | 'last' 'weekday'                          -- BYSETPOS=-1 + Mon-Fri
//                      | 'last' weekday-name byday-more*           -- BYDAY=-1WD [...]
//                      | ordinal weekday-name byday-more*          -- BYDAY=NWD [...]
//                      | ordinal bymonthday-more*                  -- BYMONTHDAY=N [,M]*
//                      | neg-ordinal 'day' neg-day-more*           -- BYMONTHDAY=-N [,-M]*
//
//   byday-more        := ( ',' ['and'] | 'and' ) 'the' ( 'last' | ordinal ) weekday-name
//   bymonthday-more   := ( ',' ['and'] | 'and' ) ordinal
//   neg-day-more      := ( ',' ['and'] | 'and' ) neg-ordinal 'day'
//
//   time-clause       := 'at' time-string { ( ',' ['and'] | 'and' ) time-string }
//   time-string       := UINT ':' MM
//
//   terminator        := ',' UINT ( 'time' | 'times' )
//                      | 'until' date-phrase
//
//   date-phrase       := month-name UINT ',' UINT [ 'at' UINT ':' MM ]
//
//   weekday-name-list := weekday-name { ( ',' ['and'] | 'and' ) weekday-name }
//   weekday-name      := 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday'
//                      | 'Friday' | 'Saturday' | 'Sunday'
//   month-name        := 'January' | 'February' | 'March' | 'April' | 'May'
//                      | 'June' | 'July' | 'August' | 'September' | 'October'
//                      | 'November' | 'December'
//   ordinal           := UINT ( 'st' | 'nd' | 'rd' | 'th' )
//   neg-ordinal       := UINT ( 'st' | 'nd' | 'rd' | 'th' ) '-to-last'
//
// Out of scope (explicitly not supported):
//   - German (DE) locale or any locale other than 'en'
//   - BYWEEKNO, BYYEARDAY, BYSECOND, WKST
//   - Multi-value BYSETPOS (only BYSETPOS=-1 with the Mon-Fri weekday pattern)
//   - BYSETPOS with a single weekday (parsed as ordinal BYDAY instead)
//   - Free-form prose not produced by toText
//   - Fields absent from toText output: dtstart, tzid, wkst, bySecond
//
// Circular dependency note: fromText is pinned to toText's output format.
// If toText EN output changes, update fromText in the same commit.

import type { Frequency, RRuleOptions, Weekday, WeekdayNum } from '../types.js'
import type { Result } from '../result.js'
import { ok, err } from '../result.js'
import { getTemporal } from '../temporal.js'

// ---------------------------------------------------------------------------
// Lookup tables
// ---------------------------------------------------------------------------

const SINGULAR_FREQ: Record<string, Frequency> = {
  second: 'SECONDLY',
  minute: 'MINUTELY',
  hour: 'HOURLY',
  day: 'DAILY',
  week: 'WEEKLY',
  month: 'MONTHLY',
  year: 'YEARLY',
}

const PLURAL_FREQ: Record<string, Frequency> = {
  seconds: 'SECONDLY',
  minutes: 'MINUTELY',
  hours: 'HOURLY',
  days: 'DAILY',
  weeks: 'WEEKLY',
  months: 'MONTHLY',
  years: 'YEARLY',
}

const EN_MONTH_INDEX: Record<string, number> = {
  January: 1,
  February: 2,
  March: 3,
  April: 4,
  May: 5,
  June: 6,
  July: 7,
  August: 8,
  September: 9,
  October: 10,
  November: 11,
  December: 12,
}

const EN_WEEKDAY: Record<string, Weekday> = {
  Monday: 'MO',
  Tuesday: 'TU',
  Wednesday: 'WE',
  Thursday: 'TH',
  Friday: 'FR',
  Saturday: 'SA',
  Sunday: 'SU',
}

/** The Mon-Fri business-day set used for BYSETPOS=-1 + weekday pattern. */
const MON_TO_FRI: WeekdayNum[] = [
  { weekday: 'MO', ordinal: undefined },
  { weekday: 'TU', ordinal: undefined },
  { weekday: 'WE', ordinal: undefined },
  { weekday: 'TH', ordinal: undefined },
  { weekday: 'FR', ordinal: undefined },
]

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

/**
 * Split text into tokens. Commas are separated into standalone tokens so
 * the parser can skip them individually without touching surrounding words.
 */
function tokenize(text: string): string[] {
  return text
    .replace(/,/g, ' , ')
    .split(/\s+/)
    .filter((s) => s.length > 0)
}

// ---------------------------------------------------------------------------
// Ordinal helpers
// ---------------------------------------------------------------------------

/** Parse a positive English ordinal like '1st', '2nd', '15th'. Returns null on mismatch. */
function parseOrdinal(s: string): number | null {
  const m = s.match(/^(\d+)(st|nd|rd|th)$/)
  if (!m) return null
  return parseInt(m[1], 10)
}

/**
 * Parse a negative-ordinal token like '2nd-to-last'. Returns the negative
 * number (-2 for '2nd-to-last') or null if not that pattern.
 */
function parseNegOrdinalToLast(s: string): number | null {
  const m = s.match(/^(\d+)(st|nd|rd|th)-to-last$/)
  if (!m) return null
  return -parseInt(m[1], 10)
}

// ---------------------------------------------------------------------------
// Parser class
// ---------------------------------------------------------------------------

class Parser {
  private readonly tokens: string[]
  private pos: number = 0

  constructor(tokens: string[]) {
    this.tokens = tokens
  }

  peek(offset = 0): string | undefined {
    return this.tokens[this.pos + offset]
  }

  consume(): string {
    const t = this.tokens[this.pos]
    if (t === undefined) throw new Error('fromText: unexpected end of input')
    this.pos++
    return t
  }

  consumeIf(expected: string): boolean {
    if (this.peek() === expected) {
      this.pos++
      return true
    }
    return false
  }

  /** Save current position for backtracking. */
  save(): number {
    return this.pos
  }

  /** Restore a previously saved position. */
  restore(saved: number): void {
    this.pos = saved
  }

  isDone(): boolean {
    return this.pos >= this.tokens.length
  }
}

// ---------------------------------------------------------------------------
// Grammar rule parsers
// ---------------------------------------------------------------------------

function parseIntervalPhrase(p: Parser): { freq: Frequency; interval: number } {
  const first = p.consume()
  if (first !== 'every') throw new Error(`fromText: expected 'every', got '${first}'`)

  const next = p.peek()
  if (next === undefined) throw new Error("fromText: unexpected end after 'every'")

  if (next in SINGULAR_FREQ) {
    p.consume()
    return { freq: SINGULAR_FREQ[next], interval: 1 }
  }

  const n = parseInt(next, 10)
  if (isNaN(n) || n < 1)
    throw new Error(`fromText: expected freq unit or interval number, got '${next}'`)
  p.consume()

  const unit = p.peek()
  if (unit === undefined || !(unit in PLURAL_FREQ)) {
    throw new Error(`fromText: expected plural frequency unit after interval, got '${unit}'`)
  }
  p.consume()

  return { freq: PLURAL_FREQ[unit], interval: n }
}

/** Parse a list separator: optional comma then optional 'and'. Returns true if a separator was consumed. */
function consumeListSeparator(p: Parser): boolean {
  if (p.peek() === ',') {
    p.consume()
    p.consumeIf('and')
    return true
  }
  if (p.peek() === 'and') {
    p.consume()
    return true
  }
  return false
}

function parseMonthList(p: Parser): number[] {
  const months: number[] = []

  while (true) {
    const token = p.peek()
    if (token === undefined || !(token in EN_MONTH_INDEX)) break
    p.consume()
    months.push(EN_MONTH_INDEX[token])
    // Save position before consuming the separator: restore if the next
    // token is not a month name (the separator may belong to a terminator).
    const saved = p.save()
    if (!consumeListSeparator(p)) break
    if (p.peek() === undefined || !(p.peek()! in EN_MONTH_INDEX)) {
      p.restore(saved)
      break
    }
  }

  if (months.length === 0) throw new Error("fromText: expected month name after 'in'")
  return months
}

function parsePlainWeekdayList(p: Parser): WeekdayNum[] {
  const byDay: WeekdayNum[] = []

  while (true) {
    const token = p.peek()
    if (token === undefined || !(token in EN_WEEKDAY)) break
    p.consume()
    byDay.push({ weekday: EN_WEEKDAY[token], ordinal: undefined })
    // Save position before consuming the separator: restore if the next
    // token is not a weekday name (the separator may belong to a terminator).
    const saved = p.save()
    if (!consumeListSeparator(p)) break
    if (p.peek() === undefined || !(p.peek()! in EN_WEEKDAY)) {
      p.restore(saved)
      break
    }
  }

  if (byDay.length === 0) throw new Error('fromText: expected weekday name')
  return byDay
}

/**
 * Continue collecting ordinal BYDAY entries after the first entry is already added.
 * Expects pattern: { ( ',' ['and'] | 'and' ) 'the' ( 'last' | ordinal ) weekday-name }*
 */
function continueBydayOrdinalList(p: Parser, byDay: WeekdayNum[]): void {
  while (true) {
    // Look-ahead: check if next tokens are a list separator followed by 'the'.
    // Save position so we can restore it if the pattern does not match (the
    // separator may belong to the COUNT terminator: ', N times').
    if (p.peek() === ',') {
      const saved = p.save()
      p.consume() // ','
      p.consumeIf('and')
      if (p.peek() !== 'the') {
        p.restore(saved)
        break
      }
      p.consume() // 'the'
    } else if (p.peek() === 'and') {
      const saved = p.save()
      p.consume() // 'and'
      if (p.peek() !== 'the') {
        p.restore(saved)
        break
      }
      p.consume() // 'the'
    } else {
      break
    }

    // Parse 'last', 'Nth-to-last', or a positive ordinal.
    let nextOrd: number
    if (p.peek() === 'last') {
      p.consume()
      nextOrd = -1
    } else {
      const negNo = parseNegOrdinalToLast(p.peek() ?? '')
      if (negNo !== null) {
        p.consume()
        nextOrd = negNo
      } else {
        const no = parseOrdinal(p.peek() ?? '')
        if (no === null)
          throw new Error(`fromText: expected ordinal in BYDAY list, got '${p.peek()}'`)
        p.consume()
        nextOrd = no
      }
    }

    const nextWD = p.peek()
    if (nextWD === undefined || !(nextWD in EN_WEEKDAY)) {
      throw new Error(`fromText: expected weekday name in BYDAY list, got '${nextWD}'`)
    }
    p.consume()
    byDay.push({ weekday: EN_WEEKDAY[nextWD], ordinal: nextOrd })
  }
}

/**
 * Parse the content after 'on the': handles BYMONTHDAY, BYDAY ordinal,
 * BYSETPOS=-1+Mon-Fri, and negative BYMONTHDAY patterns.
 */
function parseOnThePart(p: Parser, opts: RRuleOptions): void {
  const next = p.peek()
  if (next === undefined) throw new Error("fromText: unexpected end after 'on the'")

  // --- 'last ...' patterns ---
  if (next === 'last') {
    p.consume() // 'last'
    const after = p.peek()

    if (after === 'day') {
      p.consume()
      opts.byMonthDay = [-1]
      return
    }

    if (after === 'weekday') {
      p.consume()
      opts.bySetPos = [-1]
      opts.byDay = [...MON_TO_FRI]
      return
    }

    if (after !== undefined && after in EN_WEEKDAY) {
      p.consume()
      const byDay: WeekdayNum[] = [{ weekday: EN_WEEKDAY[after], ordinal: -1 }]
      continueBydayOrdinalList(p, byDay)
      opts.byDay = byDay
      return
    }

    throw new Error(
      `fromText: expected 'day', 'weekday', or weekday name after 'last', got '${after}'`
    )
  }

  // --- Nth-to-last: either negative BYMONTHDAY ('2nd-to-last day')
  //     or negative ordinal BYDAY ('2nd-to-last Monday') ---
  const negOrd = parseNegOrdinalToLast(next)
  if (negOrd !== null) {
    p.consume() // 'Nth-to-last'
    const nextTok = p.peek()

    // Nth-to-last weekday: BYDAY with negative ordinal (e.g. '2nd-to-last Monday').
    if (nextTok !== undefined && nextTok in EN_WEEKDAY) {
      p.consume()
      const byDay: WeekdayNum[] = [{ weekday: EN_WEEKDAY[nextTok], ordinal: negOrd }]
      continueBydayOrdinalList(p, byDay)
      opts.byDay = byDay
      return
    }

    // Otherwise must be followed by 'day': negative BYMONTHDAY.
    const dayToken = p.consume()
    if (dayToken !== 'day') {
      throw new Error(
        `fromText: expected 'day' or weekday name after neg-ordinal, got '${dayToken}'`
      )
    }
    const byMonthDay: number[] = [negOrd]

    while (true) {
      const saved = p.save()
      if (!consumeListSeparator(p)) break
      const nextNeg = parseNegOrdinalToLast(p.peek() ?? '')
      if (nextNeg === null) {
        p.restore(saved)
        break
      }
      p.consume()
      const d = p.consume()
      if (d !== 'day') throw new Error(`fromText: expected 'day' after neg-ordinal, got '${d}'`)
      byMonthDay.push(nextNeg)
    }

    opts.byMonthDay = byMonthDay
    return
  }

  // --- Positive ordinal: BYDAY ordinal or positive BYMONTHDAY ---
  const ordinal = parseOrdinal(next)
  if (ordinal === null) {
    throw new Error(
      `fromText: expected 'last', 'Nth-to-last', or ordinal after 'on the', got '${next}'`
    )
  }
  p.consume()

  const afterOrd = p.peek()
  if (afterOrd !== undefined && afterOrd in EN_WEEKDAY) {
    // BYDAY ordinal: 'on the Nth Weekday [and the Mth Weekday]*'
    p.consume()
    const byDay: WeekdayNum[] = [{ weekday: EN_WEEKDAY[afterOrd], ordinal }]
    continueBydayOrdinalList(p, byDay)
    opts.byDay = byDay
    return
  }

  // BYMONTHDAY: 'on the Nth [and Mth]*'
  const byMonthDay: number[] = [ordinal]

  while (true) {
    const saved = p.save()
    if (!consumeListSeparator(p)) break
    const nextOrd = parseOrdinal(p.peek() ?? '')
    if (nextOrd === null) {
      p.restore(saved)
      break
    }
    p.consume()
    byMonthDay.push(nextOrd)
  }

  opts.byMonthDay = byMonthDay
}

function parseTimeList(p: Parser): { byHour: number[]; byMinute: number[] | undefined } {
  const byHour: number[] = []
  let byMinute: number[] | undefined = undefined

  while (true) {
    const token = p.peek()
    if (token === undefined || !token.includes(':')) break

    p.consume()
    const colonIdx = token.indexOf(':')
    const h = parseInt(token.slice(0, colonIdx), 10)
    const m = parseInt(token.slice(colonIdx + 1), 10)
    if (isNaN(h) || isNaN(m)) throw new Error(`fromText: invalid time token '${token}'`)
    byHour.push(h)
    if (m !== 0) {
      // Non-zero minute: record it (overwrites previous if already set, but
      // toText always uses the same minute for all hours).
      byMinute = [m]
    }

    // Use lookahead to decide whether the separator belongs to the time list
    // or to the COUNT terminator (', N times'). Only consume the separator
    // when the token following it (possibly after 'and') is a time string.
    const sep = p.peek()
    if (sep === ',') {
      const afterComma = p.peek(1)
      if (afterComma === 'and') {
        // Pattern: ', and H:MM'
        const afterAnd = p.peek(2)
        if (afterAnd === undefined || !afterAnd.includes(':')) break
        p.consume() // ','
        p.consume() // 'and'
      } else {
        // Pattern: ', H:MM'
        if (afterComma === undefined || !afterComma.includes(':')) break
        p.consume() // ','
      }
    } else if (sep === 'and') {
      const afterAnd = p.peek(1)
      if (afterAnd === undefined || !afterAnd.includes(':')) break
      p.consume() // 'and'
    } else {
      break
    }
  }

  if (byHour.length === 0) throw new Error("fromText: expected time string after 'at'")
  return { byHour, byMinute }
}

function parseUntilDate(p: Parser): Temporal.PlainDate | Temporal.PlainDateTime {
  const T = getTemporal()

  const monthStr = p.consume()
  const month = EN_MONTH_INDEX[monthStr]
  if (month === undefined)
    throw new Error(`fromText: expected month name in UNTIL, got '${monthStr}'`)

  const dayStr = p.consume()
  const day = parseInt(dayStr, 10)
  if (isNaN(day)) throw new Error(`fromText: expected day number in UNTIL, got '${dayStr}'`)

  p.consumeIf(',')

  const yearStr = p.consume()
  const year = parseInt(yearStr, 10)
  if (isNaN(year)) throw new Error(`fromText: expected year in UNTIL, got '${yearStr}'`)

  // Optional 'at H:MM' suffix indicates PlainDateTime.
  if (p.peek() === 'at') {
    p.consume()
    const timeStr = p.consume()
    if (!timeStr.includes(':')) {
      throw new Error(`fromText: expected time string after 'at' in UNTIL, got '${timeStr}'`)
    }
    const colonIdx = timeStr.indexOf(':')
    const hour = parseInt(timeStr.slice(0, colonIdx), 10)
    const minute = parseInt(timeStr.slice(colonIdx + 1), 10)
    if (isNaN(hour) || isNaN(minute)) {
      throw new Error(`fromText: invalid time in UNTIL: '${timeStr}'`)
    }
    return T.PlainDateTime.from({ year, month, day, hour, minute })
  }

  return T.PlainDate.from({ year, month, day })
}

function parseSentence(p: Parser): RRuleOptions {
  // 1. Interval phrase: always present.
  const { freq, interval } = parseIntervalPhrase(p)
  const opts: RRuleOptions = { freq }
  if (interval > 1) opts.interval = interval

  // 2. Optional BYMONTH clause ('in ...').
  if (p.peek() === 'in') {
    p.consume()
    opts.byMonth = parseMonthList(p)
  }

  // 3. Optional BYDAY or BYMONTHDAY clause ('on ...').
  if (p.peek() === 'on') {
    p.consume()
    if (p.peek() === 'the') {
      p.consume()
      parseOnThePart(p, opts)
    } else {
      opts.byDay = parsePlainWeekdayList(p)
    }
  }

  // 4. Optional time clause ('at ...').
  if (p.peek() === 'at') {
    p.consume()
    const { byHour, byMinute } = parseTimeList(p)
    opts.byHour = byHour
    if (byMinute !== undefined) opts.byMinute = byMinute
  }

  // 5. Terminator: ', N times' (COUNT) or 'until date' (UNTIL).
  if (p.peek() === ',') {
    p.consume()
    const numStr = p.consume()
    const n = parseInt(numStr, 10)
    if (isNaN(n) || n < 1) throw new Error(`fromText: expected positive count, got '${numStr}'`)
    const unit = p.consume()
    if (unit !== 'time' && unit !== 'times') {
      throw new Error(`fromText: expected 'time' or 'times' after count, got '${unit}'`)
    }
    opts.count = n
  } else if (p.peek() === 'until') {
    p.consume()
    opts.until = parseUntilDate(p)
  }

  return opts
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a human-readable English recurrence description into RRuleOptions.
 *
 * Only accepts canonical output produced by toText with the EN locale. Not a
 * general natural-language parser.
 *
 * Round-trip guarantee: for all RRuleOptions x where toText(x, {locale: en})
 * does not return the complex-rule fallback string,
 * fromText(toText(x, {locale: en}), {locale: en}).value deep-equals x
 * (excluding dtstart, tzid, wkst, bySecond which are absent from text output,
 * and excluding byMinute=[0] which is indistinguishable from byMinute=undefined
 * in the rendered text).
 *
 * Returns Err if the text cannot be parsed as EN toText output.
 *
 * Out of scope: BYWEEKNO, BYYEARDAY, BYSECOND, WKST,
 * multi-value BYSETPOS, free-form prose not produced by toText.
 * fromText is EN-only: passing DE (or any other locale) text returns Err.
 */
export function fromText(text: string): Result<RRuleOptions, string> {
  const tokens = tokenize(text.trim())
  if (tokens.length === 0) return err('fromText: empty input')

  const p = new Parser(tokens)
  try {
    const result = parseSentence(p)
    if (!p.isDone()) {
      return err(`fromText: unexpected tokens after sentence end: '${p.peek()}'`)
    }
    return ok(result)
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e))
  }
}
