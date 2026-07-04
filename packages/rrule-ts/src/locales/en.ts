// English locale pack for rrule-ts/text (import 'rrule-ts/locales/en').
//
// Implements the full LocalePack interface from types.ts with production-quality
// English strings and formatters.

import type { Frequency } from '../types.js'
import type { LocalePack } from './types.js'

export type { LocalePack, LocaleTokens } from './types.js'

// ---------------------------------------------------------------------------
// Internal tables (referenced from methods to avoid closure-over-self issues)
// ---------------------------------------------------------------------------

const EN_MONTHS: LocalePack['months'] = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const FREQ_SINGULAR: Record<Frequency, string> = {
  SECONDLY: 'every second',
  MINUTELY: 'every minute',
  HOURLY: 'every hour',
  DAILY: 'every day',
  WEEKLY: 'every week',
  MONTHLY: 'every month',
  YEARLY: 'every year',
}

const FREQ_PLURAL: Record<Frequency, string> = {
  SECONDLY: 'seconds',
  MINUTELY: 'minutes',
  HOURLY: 'hours',
  DAILY: 'days',
  WEEKLY: 'weeks',
  MONTHLY: 'months',
  YEARLY: 'years',
}

// ---------------------------------------------------------------------------
// English locale pack
// ---------------------------------------------------------------------------

/**
 * English locale pack.
 *
 * formatInterval: n=1 -> 'every day'; n>1 -> 'every N days'.
 * formatOrdinal: 1->'1st', 2->'2nd', 3->'3rd', 4->'4th', -1->'last'.
 * formatCount: 1->'1 time'; N->'N times'.
 * formatList: Oxford comma ('A, B, and C').
 * formatDate: PlainDate -> 'January 1, 2025'; DateTime/Instant -> '...at H:MM'.
 */
export const en: LocalePack = {
  id: 'en',
  weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  months: EN_MONTHS,
  tokens: {
    on: 'on',
    at: 'at',
    in: 'in',
    inSingular: 'in',
    until: 'until',
    the: 'the',
    last: 'last',
    lastDay: 'last day',
    weekday: 'weekday',
  },

  formatInterval(n: number, freq: Frequency): string {
    if (n === 1) return FREQ_SINGULAR[freq]
    return `every ${n} ${FREQ_PLURAL[freq]}`
  },

  formatOrdinal(n: number): string {
    if (n === -1) return 'last'
    const abs = Math.abs(n)
    const mod100 = abs % 100
    const mod10 = abs % 10
    let suffix: string
    if (mod100 >= 11 && mod100 <= 13) {
      // 11th, 12th, 13th: special case
      suffix = 'th'
    } else if (mod10 === 1) {
      suffix = 'st'
    } else if (mod10 === 2) {
      suffix = 'nd'
    } else if (mod10 === 3) {
      suffix = 'rd'
    } else {
      suffix = 'th'
    }
    return `${abs}${suffix}`
  },

  formatCount(n: number): string {
    return n === 1 ? '1 time' : `${n} times`
  },

  formatList(items: string[]): string {
    if (items.length === 0) return ''
    if (items.length === 1) return items[0]
    if (items.length === 2) return `${items[0]} and ${items[1]}`
    // Oxford comma: "A, B, and C"
    return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
  },

  formatDate(date): string {
    // Duck-type to identify the Temporal variant.
    // Temporal.Instant: has epochMilliseconds but no year on the object itself.
    if ('epochMilliseconds' in date && !('year' in date)) {
      const inst = date as Temporal.Instant
      const dt = inst.toZonedDateTimeISO('UTC')
      const min = String(dt.minute).padStart(2, '0')
      return `${EN_MONTHS[dt.month - 1]} ${dt.day}, ${dt.year} at ${dt.hour}:${min}`
    }
    // Temporal.PlainDateTime: has year and hour.
    if ('hour' in date) {
      const dt = date as Temporal.PlainDateTime
      const min = String(dt.minute).padStart(2, '0')
      return `${EN_MONTHS[dt.month - 1]} ${dt.day}, ${dt.year} at ${dt.hour}:${min}`
    }
    // Temporal.PlainDate: has year, no hour.
    const d = date as Temporal.PlainDate
    return `${EN_MONTHS[d.month - 1]} ${d.day}, ${d.year}`
  },
}
