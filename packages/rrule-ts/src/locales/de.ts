// German locale pack for rrule-ts/text (import 'rrule-ts/locales/de').
//
// Implements the full LocalePack interface with German grammatical gender,
// period-suffix ordinals, and ' und ' list conjunction (no Oxford comma).

import type { Frequency } from '../types.js'
import type { LocalePack } from './types.js'
import { getTemporal } from '../temporal.js'

export type { LocalePack, LocaleTokens } from './types.js'

// ---------------------------------------------------------------------------
// Internal tables
// ---------------------------------------------------------------------------

const DE_MONTHS: LocalePack['months'] = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
]

// Grammatical gender rules for interval=1 (singular, gender-inflected form).
// masculine: jeden Tag, jeden Monat
// feminine: jede Woche, jede Stunde, jede Minute, jede Sekunde
// neuter: jedes Jahr
const FREQ_SINGULAR: Record<Frequency, string> = {
  SECONDLY: 'jede Sekunde',
  MINUTELY: 'jede Minute',
  HOURLY: 'jede Stunde',
  DAILY: 'jeden Tag',
  WEEKLY: 'jede Woche',
  MONTHLY: 'jeden Monat',
  YEARLY: 'jedes Jahr',
}

// Plural forms for interval>1 (alle N [unit]).
const FREQ_PLURAL: Record<Frequency, string> = {
  SECONDLY: 'Sekunden',
  MINUTELY: 'Minuten',
  HOURLY: 'Stunden',
  DAILY: 'Tage',
  WEEKLY: 'Wochen',
  MONTHLY: 'Monate',
  YEARLY: 'Jahre',
}

// ---------------------------------------------------------------------------
// German locale pack
// ---------------------------------------------------------------------------

/**
 * German locale pack.
 *
 * formatInterval: n=1 uses gender-inflected singular ('jeden Tag');
 *   n>1 uses 'alle N [Einheit]'.
 * formatOrdinal: positive n -> 'n.' (appends period); -1 -> 'letzten'.
 * formatCount: 'N-mal'.
 * formatList: ' und ' conjunction, no Oxford comma ('A, B und C').
 * formatDate: PlainDate -> 'D. Month YYYY' (German date order).
 */
export const de: LocalePack = {
  id: 'de',
  weekdays: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'],
  months: DE_MONTHS,
  tokens: {
    on: 'am',
    at: 'um',
    in: 'in',
    inSingular: 'im',
    until: 'bis',
    // Empty: German uses 'am' to cover 'on the', so no separate 'the' token.
    the: '',
    last: 'letzten',
    lastDay: 'letzten Tag',
    weekday: 'Werktag',
  },

  formatInterval(n: number, freq: Frequency): string {
    if (n === 1) return FREQ_SINGULAR[freq]
    return `alle ${n} ${FREQ_PLURAL[freq]}`
  },

  formatOrdinal(n: number): string {
    // German ordinals use a period suffix: 1. 2. 3. etc.
    // For -1 (adjectival 'last' in BYDAY context): 'letzten'.
    if (n === -1) return 'letzten'
    // For -2 (second-to-last): 'vorletzten'.
    if (n === -2) return 'vorletzten'
    const abs = Math.abs(n)
    return `${abs}.`
  },

  formatCount(n: number): string {
    return `${n}-mal`
  },

  formatList(items: string[]): string {
    if (items.length === 0) return ''
    if (items.length === 1) return items[0]
    if (items.length === 2) return `${items[0]} und ${items[1]}`
    // No Oxford comma in German: "A, B und C"
    return `${items.slice(0, -1).join(', ')} und ${items[items.length - 1]}`
  },

  formatDate(date): string {
    // German date order: D. Month YYYY
    const T = getTemporal()
    // Use instanceof to safely identify the Temporal variant.
    if (date instanceof T.Instant) {
      const dt = date.toZonedDateTimeISO('UTC')
      const min = String(dt.minute).padStart(2, '0')
      return `${dt.day}. ${DE_MONTHS[dt.month - 1]} ${dt.year} um ${dt.hour}:${min}`
    }
    if (date instanceof T.PlainDateTime) {
      const min = String(date.minute).padStart(2, '0')
      return `${date.day}. ${DE_MONTHS[date.month - 1]} ${date.year} um ${date.hour}:${min}`
    }
    const d = date as Temporal.PlainDate
    return `${d.day}. ${DE_MONTHS[d.month - 1]} ${d.year}`
  },

  formatNthToLastDay(n: number): string {
    // n is the absolute value (n >= 2).
    // DE: n=2 -> 'vorletzten Tag' (German has a specific word for second-to-last).
    // n>=3 -> 'N.-letzten Tag' (literal period-ordinal + letzten Tag).
    if (n === 2) return 'vorletzten Tag'
    return `${n}.-letzten Tag`
  },

  formatNthToLastOrdinal(n: number): string {
    // n is the absolute value (n >= 2).
    // Returns the adjectival "Nth-to-last" form used before a weekday name in BYDAY.
    // DE: n=2 -> 'vorletzten', n>=3 -> 'N.-letzten'.
    if (n === 2) return 'vorletzten'
    return `${n}.-letzten`
  },

  complexRuleFallback: '(komplexe Wiederholungsregel)',
}
