// English locale pack for rrule-ts/text (import 'rrule-ts/locales/en').
//
// Implements the full LocalePack interface from types.ts with production-quality
// English strings and formatters.

import type { Frequency } from '../types.js'
import type { LocalePack } from './types.js'
import { getTemporal } from '../temporal.js'

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
    const T = getTemporal()
    // Use instanceof to safely identify the Temporal variant.
    if (date instanceof T.Instant) {
      const dt = date.toZonedDateTimeISO('UTC')
      const min = String(dt.minute).padStart(2, '0')
      return `${EN_MONTHS[dt.month - 1]} ${dt.day}, ${dt.year} at ${dt.hour}:${min}`
    }
    if (date instanceof T.PlainDateTime) {
      const min = String(date.minute).padStart(2, '0')
      return `${EN_MONTHS[date.month - 1]} ${date.day}, ${date.year} at ${date.hour}:${min}`
    }
    // Temporal.PlainDate
    const d = date as Temporal.PlainDate
    return `${EN_MONTHS[d.month - 1]} ${d.day}, ${d.year}`
  },

  formatNthToLastDay(n: number): string {
    // n is the absolute value (n >= 2).
    // EN: '2nd-to-last day', '3rd-to-last day', etc.
    const abs = n
    const mod100 = abs % 100
    const mod10 = abs % 10
    let suffix: string
    if (mod100 >= 11 && mod100 <= 13) {
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
    return `${abs}${suffix}-to-last day`
  },

  formatNthToLastOrdinal(n: number): string {
    // n is the absolute value (n >= 2).
    // Returns the adjectival "Nth-to-last" form used before a weekday name in BYDAY.
    // EN: 2 -> '2nd-to-last', 3 -> '3rd-to-last', 11 -> '11th-to-last', etc.
    const abs = n
    const mod100 = abs % 100
    const mod10 = abs % 10
    let suffix: string
    if (mod100 >= 11 && mod100 <= 13) {
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
    return `${abs}${suffix}-to-last`
  },

  complexRuleFallback: '(complex recurrence rule)',
}
