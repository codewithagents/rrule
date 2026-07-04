// French locale pack for rrule-ts/text (import 'rrule-ts/locales/fr').
//
// Implements the full LocalePack interface with French grammatical gender
// agreement, French ordinals (1er/2e), and 'et' list conjunction (no Oxford
// comma).

import type { Frequency } from '../types.js'
import type { LocalePack } from './types.js'
import { getTemporal } from '../temporal.js'

export type { LocalePack, LocaleTokens } from './types.js'

// ---------------------------------------------------------------------------
// Internal tables
// ---------------------------------------------------------------------------

const FR_MONTHS: LocalePack['months'] = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
]

// Singular forms for interval=1.
// masculine (tous les): jours, mois, ans
// feminine (toutes les): secondes, minutes, heures, semaines
const FREQ_SINGULAR: Record<Frequency, string> = {
  SECONDLY: 'toutes les secondes',
  MINUTELY: 'toutes les minutes',
  HOURLY: 'toutes les heures',
  DAILY: 'tous les jours',
  WEEKLY: 'toutes les semaines',
  MONTHLY: 'tous les mois',
  YEARLY: 'tous les ans',
}

// Plural forms for interval>1: [gendered prefix, unit noun].
const FREQ_PLURAL: Record<Frequency, [string, string]> = {
  SECONDLY: ['toutes les', 'secondes'],
  MINUTELY: ['toutes les', 'minutes'],
  HOURLY: ['toutes les', 'heures'],
  DAILY: ['tous les', 'jours'],
  WEEKLY: ['toutes les', 'semaines'],
  MONTHLY: ['tous les', 'mois'],
  YEARLY: ['tous les', 'ans'],
}

// ---------------------------------------------------------------------------
// French locale pack
// ---------------------------------------------------------------------------

/**
 * French locale pack.
 *
 * formatInterval: n=1 uses gender-inflected singular ('tous les jours');
 *   n>1 uses 'tous les N jours' / 'toutes les N semaines'.
 * formatOrdinal: 1->'1er', 2+->'Ne'; -1->'dernier'.
 * formatCount: 'N fois'.
 * formatList: 'et' conjunction, no Oxford comma ('A, B et C').
 * formatDate: PlainDate -> 'D Month YYYY' (French date order, '1er' for day 1).
 */
export const fr: LocalePack = {
  id: 'fr',
  weekdays: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'],
  months: FR_MONTHS,
  tokens: {
    on: 'le',
    at: 'à',
    in: 'en',
    inSingular: 'en',
    until: "jusqu'au",
    // Empty: 'le' in the 'on' token already covers 'on the', so no separate 'the'.
    the: '',
    last: 'dernier',
    lastDay: 'dernier jour',
    weekday: 'jour ouvrable',
  },

  formatInterval(n: number, freq: Frequency): string {
    if (n === 1) return FREQ_SINGULAR[freq]
    const [prefix, unit] = FREQ_PLURAL[freq]
    return `${prefix} ${n} ${unit}`
  },

  formatOrdinal(n: number): string {
    // French ordinals: 1 -> '1er', 2+ -> 'Ne'.
    // For -1 (adjectival 'last' in BYDAY context): 'dernier'.
    if (n === -1) return 'dernier'
    const abs = Math.abs(n)
    if (abs === 1) return '1er'
    return `${abs}e`
  },

  formatCount(n: number): string {
    return `${n} fois`
  },

  formatList(items: string[]): string {
    if (items.length === 0) return ''
    if (items.length === 1) return items[0]
    if (items.length === 2) return `${items[0]} et ${items[1]}`
    // No Oxford comma in French: "A, B et C".
    return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`
  },

  formatDate(date): string {
    // French date order: D Month YYYY (e.g. '1er janvier 2025', '15 mars 2025').
    const T = getTemporal()
    const dayStr = (day: number): string => (day === 1 ? '1er' : `${day}`)
    if (date instanceof T.Instant) {
      const dt = date.toZonedDateTimeISO('UTC')
      const min = String(dt.minute).padStart(2, '0')
      return `${dayStr(dt.day)} ${FR_MONTHS[dt.month - 1]} ${dt.year} à ${dt.hour}:${min}`
    }
    if (date instanceof T.PlainDateTime) {
      const min = String(date.minute).padStart(2, '0')
      return `${dayStr(date.day)} ${FR_MONTHS[date.month - 1]} ${date.year} à ${date.hour}:${min}`
    }
    const d = date as Temporal.PlainDate
    return `${dayStr(d.day)} ${FR_MONTHS[d.month - 1]} ${d.year}`
  },

  formatNthToLastDay(n: number): string {
    // n is the absolute value (n >= 2).
    // FR: n=2 -> 'avant-dernier jour', n>=3 -> 'Ne-avant-dernier jour'.
    if (n === 2) return 'avant-dernier jour'
    return `${n}e-avant-dernier jour`
  },

  formatNthToLastOrdinal(n: number): string {
    // n is the absolute value (n >= 2).
    // Returns the adjectival 'Nth-to-last' form used before a weekday name.
    // FR: n=2 -> 'avant-dernier', n>=3 -> 'Ne-avant-dernier'.
    if (n === 2) return 'avant-dernier'
    return `${n}e-avant-dernier`
  },

  complexRuleFallback: '(règle de récurrence complexe)',
}
