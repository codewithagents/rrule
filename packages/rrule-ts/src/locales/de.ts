// German locale pack for rrule-ts/text (import 'rrule-ts/locales/de').
//
// Stub for the expansion phase.
// TODO(expansion-phase): provide full German locale strings for toText.

import type { LocalePack } from './en.js'

export type { LocalePack }

/**
 * German locale pack.
 *
 * @stub Partial data. The full locale will be populated in the expansion phase.
 * TODO(expansion-phase): fill all strings and wire into toText.
 */
export const de: LocalePack = {
  id: 'de',
  weekdays: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'],
  months: [
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
  ],
  frequencies: {
    SECONDLY: 'jede Sekunde',
    MINUTELY: 'jede Minute',
    HOURLY: 'jede Stunde',
    DAILY: 'täglich',
    WEEKLY: 'wöchentlich',
    MONTHLY: 'monatlich',
    YEARLY: 'jährlich',
  },
}
