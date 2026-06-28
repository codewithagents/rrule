// English locale pack for rrule-ts/text (import 'rrule-ts/locales/en').
//
// Stub for the expansion phase.
// TODO(expansion-phase): provide full English locale strings for toText.

/** Shape of a locale pack used by toText. */
export interface LocalePack {
  /** Locale identifier. */
  id: string
  /** Weekday names, indexed 0=Monday ... 6=Sunday. */
  weekdays: [string, string, string, string, string, string, string]
  /** Month names, indexed 0=January ... 11=December. */
  months: [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ]
  /** Frequency labels. */
  frequencies: Record<string, string>
}

/**
 * English locale pack.
 *
 * @stub Partial data. The full locale will be populated in the expansion phase.
 * TODO(expansion-phase): fill all strings and wire into toText.
 */
export const en: LocalePack = {
  id: 'en',
  weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  months: [
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
  ],
  frequencies: {
    SECONDLY: 'every second',
    MINUTELY: 'every minute',
    HOURLY: 'every hour',
    DAILY: 'every day',
    WEEKLY: 'every week',
    MONTHLY: 'every month',
    YEARLY: 'every year',
  },
}
