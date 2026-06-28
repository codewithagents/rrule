import { describe, it, expect } from 'vitest'
import { stringify } from './stringify.js'
import { getTemporal } from './temporal.js'
import type { RRuleOptions } from './types.js'

describe('stringify', () => {
  it('emits the minimal RRULE: FREQ only', () => {
    expect(stringify({ freq: 'DAILY' })).toBe('RRULE:FREQ=DAILY')
  })

  it('includes COUNT when set', () => {
    expect(stringify({ freq: 'DAILY', count: 3 })).toBe('RRULE:FREQ=DAILY;COUNT=3')
  })

  it('includes INTERVAL when set', () => {
    expect(stringify({ freq: 'WEEKLY', interval: 2 })).toBe('RRULE:FREQ=WEEKLY;INTERVAL=2')
  })

  it('includes WKST when set', () => {
    expect(stringify({ freq: 'WEEKLY', wkst: 'SU' })).toBe('RRULE:FREQ=WEEKLY;WKST=SU')
  })

  it('includes BYDAY with plain weekdays', () => {
    const opts: RRuleOptions = {
      freq: 'WEEKLY',
      byDay: [
        { ordinal: undefined, weekday: 'MO' },
        { ordinal: undefined, weekday: 'WE' },
        { ordinal: undefined, weekday: 'FR' },
      ],
    }
    expect(stringify(opts)).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR')
  })

  it('includes BYDAY with ordinal weekdays', () => {
    const opts: RRuleOptions = {
      freq: 'MONTHLY',
      byDay: [
        { ordinal: 2, weekday: 'MO' },
        { ordinal: -1, weekday: 'FR' },
      ],
    }
    expect(stringify(opts)).toBe('RRULE:FREQ=MONTHLY;BYDAY=2MO,-1FR')
  })

  it('includes BYMONTH, BYMONTHDAY, BYYEARDAY, BYWEEKNO', () => {
    const opts: RRuleOptions = {
      freq: 'YEARLY',
      byMonth: [1, 6, 12],
      byMonthDay: [1, -1],
      byYearDay: [1, 365],
      byWeekNo: [1, 52],
    }
    const s = stringify(opts)
    expect(s).toContain('BYMONTH=1,6,12')
    expect(s).toContain('BYMONTHDAY=1,-1')
    expect(s).toContain('BYYEARDAY=1,365')
    expect(s).toContain('BYWEEKNO=1,52')
  })

  it('includes BYHOUR, BYMINUTE, BYSECOND, BYSETPOS', () => {
    const opts: RRuleOptions = {
      freq: 'DAILY',
      byHour: [9, 17],
      byMinute: [0, 30],
      bySecond: [0],
      bySetPos: [1, -1],
    }
    const s = stringify(opts)
    expect(s).toContain('BYHOUR=9,17')
    expect(s).toContain('BYMINUTE=0,30')
    expect(s).toContain('BYSECOND=0')
    expect(s).toContain('BYSETPOS=1,-1')
  })

  it('produces canonical part ordering: FREQ first', () => {
    const opts: RRuleOptions = {
      freq: 'WEEKLY',
      count: 10,
      interval: 2,
      wkst: 'SU',
    }
    const s = stringify(opts)
    const freqIdx = s.indexOf('FREQ=')
    const countIdx = s.indexOf('COUNT=')
    const intervalIdx = s.indexOf('INTERVAL=')
    expect(freqIdx).toBeLessThan(countIdx)
    expect(countIdx).toBeLessThan(intervalIdx)
  })

  it('emits UNTIL before COUNT in canonical order', () => {
    const T = getTemporal()
    const until = T.Instant.from('2024-12-31T23:59:59Z')
    const opts: RRuleOptions = { freq: 'DAILY', until }
    const s = stringify(opts)
    expect(s).toContain('UNTIL=20241231T235959Z')
    const untilIdx = s.indexOf('UNTIL=')
    const freqIdx = s.indexOf('FREQ=')
    expect(freqIdx).toBeLessThan(untilIdx)
  })

  it('formats a PlainDate UNTIL as YYYYMMDD (no time component)', () => {
    const T = getTemporal()
    const until = T.PlainDate.from('2024-12-31')
    const opts: RRuleOptions = { freq: 'DAILY', until }
    const s = stringify(opts)
    expect(s).toContain('UNTIL=20241231')
    // The value after UNTIL= must be date-only (no T immediately after the 8 digits)
    expect(s).toMatch(/UNTIL=\d{8}(?!T)/)
  })

  it('formats a PlainDateTime UNTIL without Z suffix', () => {
    const T = getTemporal()
    const until = T.PlainDateTime.from('2024-12-31T23:59:59')
    const opts: RRuleOptions = { freq: 'DAILY', until }
    expect(stringify(opts)).toContain('UNTIL=20241231T235959')
    expect(stringify(opts)).not.toContain('Z')
  })

  it('prepends DTSTART: line when dtstart is set', () => {
    const T = getTemporal()
    const dtstart = T.Instant.from('2024-01-01T09:00:00Z')
    const opts: RRuleOptions = { freq: 'WEEKLY', dtstart }
    const s = stringify(opts)
    const lines = s.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('DTSTART:20240101T090000Z')
    expect(lines[1]).toMatch(/^RRULE:FREQ=WEEKLY/)
  })

  it('prepends DTSTART;TZID= line when tzid is set', () => {
    const T = getTemporal()
    const dtstart = T.ZonedDateTime.from('2024-01-01T09:00:00[Europe/Berlin]')
    const opts: RRuleOptions = { freq: 'WEEKLY', dtstart, tzid: 'Europe/Berlin' }
    const s = stringify(opts)
    expect(s).toMatch(/^DTSTART;TZID=Europe\/Berlin:/)
  })

  it('emits DTSTART:YYYYMMDD for PlainDate dtstart', () => {
    const T = getTemporal()
    const dtstart = T.PlainDate.from('2024-03-15')
    const opts: RRuleOptions = { freq: 'WEEKLY', dtstart }
    const s = stringify(opts)
    expect(s).toContain('DTSTART:20240315')
    expect(s).not.toMatch(/DTSTART:.*T/)
  })

  it('emits DTSTART:YYYYMMDDTHHmmss for PlainDateTime dtstart', () => {
    const T = getTemporal()
    const dtstart = T.PlainDateTime.from('2024-03-15T09:30:00')
    const opts: RRuleOptions = { freq: 'WEEKLY', dtstart }
    const s = stringify(opts)
    expect(s).toContain('DTSTART:20240315T093000')
    expect(s).not.toContain('Z')
  })
})
