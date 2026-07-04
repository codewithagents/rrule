// Golden-string unit tests for toText.
//
// Each test case asserts exact string equality against the expected output
// defined in the design plan (2026-07-04-rrule-ts-totext-i18n.json).
// All EN examples from the plan are covered here.

import { describe, it, expect } from 'vitest'
import { toText, COMPLEX_RULE_FALLBACK } from './index.js'
import { en } from '../locales/en.js'
import { de } from '../locales/de.js'
import { fr } from '../locales/fr.js'
import { getTemporal } from '../temporal.js'
// de.complexRuleFallback is DE-specific: used to assert DE fallback output.
const DE_FALLBACK = de.complexRuleFallback
// fr.complexRuleFallback is FR-specific: used to assert FR fallback output.
const FR_FALLBACK = fr.complexRuleFallback

// ---------------------------------------------------------------------------
// EN golden strings
// ---------------------------------------------------------------------------

describe('toText EN: frequency and interval', () => {
  it('FREQ=DAILY -> every day', () => {
    expect(toText({ freq: 'DAILY' })).toBe('every day')
  })

  it('FREQ=DAILY;INTERVAL=2 -> every 2 days', () => {
    expect(toText({ freq: 'DAILY', interval: 2 })).toBe('every 2 days')
  })

  it('FREQ=HOURLY -> every hour', () => {
    expect(toText({ freq: 'HOURLY' })).toBe('every hour')
  })

  it('FREQ=HOURLY;INTERVAL=6 -> every 6 hours', () => {
    expect(toText({ freq: 'HOURLY', interval: 6 })).toBe('every 6 hours')
  })

  it('FREQ=MINUTELY -> every minute', () => {
    expect(toText({ freq: 'MINUTELY' })).toBe('every minute')
  })

  it('FREQ=SECONDLY -> every second', () => {
    expect(toText({ freq: 'SECONDLY' })).toBe('every second')
  })

  it('FREQ=WEEKLY with interval=1 -> every week', () => {
    expect(toText({ freq: 'WEEKLY' })).toBe('every week')
  })

  it('FREQ=MONTHLY with interval=1 -> every month', () => {
    expect(toText({ freq: 'MONTHLY' })).toBe('every month')
  })

  it('FREQ=YEARLY with interval=1 -> every year', () => {
    expect(toText({ freq: 'YEARLY' })).toBe('every year')
  })
})

describe('toText EN: BYDAY plain weekdays (WEEKLY)', () => {
  it('FREQ=WEEKLY;BYDAY=MO -> every week on Monday', () => {
    expect(toText({ freq: 'WEEKLY', byDay: [{ weekday: 'MO', ordinal: undefined }] })).toBe(
      'every week on Monday'
    )
  })

  it('FREQ=WEEKLY;BYDAY=MO,WE,FR -> every week on Monday, Wednesday, and Friday', () => {
    expect(
      toText({
        freq: 'WEEKLY',
        byDay: [
          { weekday: 'MO', ordinal: undefined },
          { weekday: 'WE', ordinal: undefined },
          { weekday: 'FR', ordinal: undefined },
        ],
      })
    ).toBe('every week on Monday, Wednesday, and Friday')
  })

  it('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO -> every 2 weeks on Monday', () => {
    expect(
      toText({ freq: 'WEEKLY', interval: 2, byDay: [{ weekday: 'MO', ordinal: undefined }] })
    ).toBe('every 2 weeks on Monday')
  })

  it('FREQ=WEEKLY;BYDAY=MO,TU (two days) -> every week on Monday and Tuesday', () => {
    expect(
      toText({
        freq: 'WEEKLY',
        byDay: [
          { weekday: 'MO', ordinal: undefined },
          { weekday: 'TU', ordinal: undefined },
        ],
      })
    ).toBe('every week on Monday and Tuesday')
  })
})

describe('toText EN: BYDAY ordinal weekdays (MONTHLY)', () => {
  it('FREQ=MONTHLY;BYDAY=1MO -> every month on the 1st Monday', () => {
    expect(toText({ freq: 'MONTHLY', byDay: [{ weekday: 'MO', ordinal: 1 }] })).toBe(
      'every month on the 1st Monday'
    )
  })

  it('FREQ=MONTHLY;BYDAY=-1FR -> every month on the last Friday', () => {
    expect(toText({ freq: 'MONTHLY', byDay: [{ weekday: 'FR', ordinal: -1 }] })).toBe(
      'every month on the last Friday'
    )
  })

  it('FREQ=MONTHLY;BYDAY=2TU -> every month on the 2nd Tuesday', () => {
    expect(toText({ freq: 'MONTHLY', byDay: [{ weekday: 'TU', ordinal: 2 }] })).toBe(
      'every month on the 2nd Tuesday'
    )
  })

  it('FREQ=MONTHLY;BYDAY=3WE -> every month on the 3rd Wednesday', () => {
    expect(toText({ freq: 'MONTHLY', byDay: [{ weekday: 'WE', ordinal: 3 }] })).toBe(
      'every month on the 3rd Wednesday'
    )
  })

  it('FREQ=MONTHLY;BYDAY=4TH -> every month on the 4th Thursday', () => {
    expect(toText({ freq: 'MONTHLY', byDay: [{ weekday: 'TH', ordinal: 4 }] })).toBe(
      'every month on the 4th Thursday'
    )
  })
})

describe('toText EN: BYMONTHDAY', () => {
  it('FREQ=MONTHLY;BYMONTHDAY=1 -> every month on the 1st', () => {
    expect(toText({ freq: 'MONTHLY', byMonthDay: [1] })).toBe('every month on the 1st')
  })

  it('FREQ=MONTHLY;BYMONTHDAY=-1 -> every month on the last day', () => {
    expect(toText({ freq: 'MONTHLY', byMonthDay: [-1] })).toBe('every month on the last day')
  })

  it('FREQ=MONTHLY;BYMONTHDAY=15 -> every month on the 15th', () => {
    expect(toText({ freq: 'MONTHLY', byMonthDay: [15] })).toBe('every month on the 15th')
  })

  it('FREQ=MONTHLY;BYMONTHDAY=1,15 -> every month on the 1st and 15th', () => {
    expect(toText({ freq: 'MONTHLY', byMonthDay: [1, 15] })).toBe('every month on the 1st and 15th')
  })

  it('FREQ=MONTHLY;BYMONTHDAY=-2 -> every month on the 2nd-to-last day (EN)', () => {
    expect(toText({ freq: 'MONTHLY', byMonthDay: [-2] })).toBe('every month on the 2nd-to-last day')
  })

  it('FREQ=MONTHLY;BYMONTHDAY=-3 -> every month on the 3rd-to-last day (EN)', () => {
    expect(toText({ freq: 'MONTHLY', byMonthDay: [-3] })).toBe('every month on the 3rd-to-last day')
  })
})

describe('toText EN: BYMONTH', () => {
  it('FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1 -> every year in January on the 1st', () => {
    expect(toText({ freq: 'YEARLY', byMonth: [1], byMonthDay: [1] })).toBe(
      'every year in January on the 1st'
    )
  })

  it('FREQ=YEARLY;BYMONTH=1 -> every year in January', () => {
    expect(toText({ freq: 'YEARLY', byMonth: [1] })).toBe('every year in January')
  })

  it('FREQ=YEARLY;BYMONTH=3,9 -> every year in March and September', () => {
    expect(toText({ freq: 'YEARLY', byMonth: [3, 9] })).toBe('every year in March and September')
  })

  it('FREQ=YEARLY;BYMONTH=1,4,7 -> every year in January, April, and July', () => {
    expect(toText({ freq: 'YEARLY', byMonth: [1, 4, 7] })).toBe(
      'every year in January, April, and July'
    )
  })
})

describe('toText EN: BYSETPOS patterns', () => {
  it('FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1 -> every month on the last Friday', () => {
    expect(
      toText({
        freq: 'MONTHLY',
        byDay: [{ weekday: 'FR', ordinal: undefined }],
        bySetPos: [-1],
      })
    ).toBe('every month on the last Friday')
  })

  it('FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1 -> every month on the 1st Monday', () => {
    expect(
      toText({
        freq: 'MONTHLY',
        byDay: [{ weekday: 'MO', ordinal: undefined }],
        bySetPos: [1],
      })
    ).toBe('every month on the 1st Monday')
  })

  it('FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1 -> every month on the last weekday', () => {
    expect(
      toText({
        freq: 'MONTHLY',
        byDay: [
          { weekday: 'MO', ordinal: undefined },
          { weekday: 'TU', ordinal: undefined },
          { weekday: 'WE', ordinal: undefined },
          { weekday: 'TH', ordinal: undefined },
          { weekday: 'FR', ordinal: undefined },
        ],
        bySetPos: [-1],
      })
    ).toBe('every month on the last weekday')
  })
})

describe('toText EN: COUNT and UNTIL', () => {
  it('FREQ=DAILY;COUNT=5 -> every day, 5 times', () => {
    expect(toText({ freq: 'DAILY', count: 5 })).toBe('every day, 5 times')
  })

  it('FREQ=DAILY;COUNT=1 -> every day, 1 time', () => {
    expect(toText({ freq: 'DAILY', count: 1 })).toBe('every day, 1 time')
  })

  it('FREQ=WEEKLY;UNTIL=PlainDate(2025-01-01) -> every week until January 1, 2025', () => {
    const T = getTemporal()
    const until = T.PlainDate.from({ year: 2025, month: 1, day: 1 })
    expect(toText({ freq: 'WEEKLY', until })).toBe('every week until January 1, 2025')
  })

  it('FREQ=DAILY;COUNT=10 -> every day, 10 times', () => {
    expect(toText({ freq: 'DAILY', count: 10 })).toBe('every day, 10 times')
  })
})

describe('toText EN: BYHOUR and BYMINUTE', () => {
  it('FREQ=DAILY;BYHOUR=9;BYMINUTE=0 -> every day at 9:00', () => {
    expect(toText({ freq: 'DAILY', byHour: [9], byMinute: [0] })).toBe('every day at 9:00')
  })

  it('FREQ=DAILY;BYHOUR=9;BYMINUTE=30 -> every day at 9:30', () => {
    expect(toText({ freq: 'DAILY', byHour: [9], byMinute: [30] })).toBe('every day at 9:30')
  })

  it('FREQ=DAILY;BYHOUR=9 (no BYMINUTE) -> every day at 9:00', () => {
    expect(toText({ freq: 'DAILY', byHour: [9] })).toBe('every day at 9:00')
  })

  it('FREQ=DAILY;BYHOUR=9,17;BYMINUTE=0 -> every day at 9:00 and 17:00', () => {
    expect(toText({ freq: 'DAILY', byHour: [9, 17], byMinute: [0] })).toBe(
      'every day at 9:00 and 17:00'
    )
  })
})

describe('toText EN: complex rule fallback', () => {
  it('FREQ=YEARLY;BYWEEKNO=1;BYDAY=MO -> (complex recurrence rule)', () => {
    expect(
      toText({
        freq: 'YEARLY',
        byWeekNo: [1],
        byDay: [{ weekday: 'MO', ordinal: undefined }],
      })
    ).toBe(COMPLEX_RULE_FALLBACK)
  })

  it('FREQ=YEARLY;BYYEARDAY=1 -> (complex recurrence rule)', () => {
    expect(toText({ freq: 'YEARLY', byYearDay: [1] })).toBe(COMPLEX_RULE_FALLBACK)
  })

  it('BYSETPOS=-1,-2 + BYDAY=MO -> (complex recurrence rule)', () => {
    expect(
      toText({
        freq: 'MONTHLY',
        byDay: [{ weekday: 'MO', ordinal: undefined }],
        bySetPos: [-1, -2],
      })
    ).toBe(COMPLEX_RULE_FALLBACK)
  })
})

describe('toText EN: locale option passthrough', () => {
  it('explicit EN locale produces same result as default', () => {
    const opts = {
      freq: 'WEEKLY' as const,
      byDay: [{ weekday: 'MO' as const, ordinal: undefined }],
    }
    expect(toText(opts, { locale: en })).toBe(toText(opts))
  })
})

describe('toText EN: UNTIL with PlainDateTime', () => {
  it('UNTIL as PlainDateTime renders date + time', () => {
    const T = getTemporal()
    const until = T.PlainDateTime.from({ year: 2025, month: 6, day: 15, hour: 9, minute: 0 })
    expect(toText({ freq: 'DAILY', until })).toBe('every day until June 15, 2025 at 9:00')
  })
})

describe('toText EN: formatOrdinal edge cases', () => {
  it('ordinal 11 uses "th" (not "st")', () => {
    expect(toText({ freq: 'MONTHLY', byMonthDay: [11] })).toBe('every month on the 11th')
  })

  it('ordinal 12 uses "th" (not "nd")', () => {
    expect(toText({ freq: 'MONTHLY', byMonthDay: [12] })).toBe('every month on the 12th')
  })

  it('ordinal 13 uses "th" (not "rd")', () => {
    expect(toText({ freq: 'MONTHLY', byMonthDay: [13] })).toBe('every month on the 13th')
  })

  it('ordinal 21 uses "st"', () => {
    expect(toText({ freq: 'MONTHLY', byMonthDay: [21] })).toBe('every month on the 21st')
  })

  it('ordinal 22 uses "nd"', () => {
    expect(toText({ freq: 'MONTHLY', byMonthDay: [22] })).toBe('every month on the 22nd')
  })

  it('ordinal 23 uses "rd"', () => {
    expect(toText({ freq: 'MONTHLY', byMonthDay: [23] })).toBe('every month on the 23rd')
  })
})

// ---------------------------------------------------------------------------
// DE golden strings
// ---------------------------------------------------------------------------

describe('toText DE: frequency and interval', () => {
  it('FREQ=DAILY -> jeden Tag', () => {
    expect(toText({ freq: 'DAILY' }, { locale: de })).toBe('jeden Tag')
  })

  it('FREQ=DAILY;INTERVAL=2 -> alle 2 Tage', () => {
    expect(toText({ freq: 'DAILY', interval: 2 }, { locale: de })).toBe('alle 2 Tage')
  })

  it('FREQ=WEEKLY -> jede Woche', () => {
    expect(toText({ freq: 'WEEKLY' }, { locale: de })).toBe('jede Woche')
  })

  it('FREQ=MONTHLY -> jeden Monat', () => {
    expect(toText({ freq: 'MONTHLY' }, { locale: de })).toBe('jeden Monat')
  })

  it('FREQ=YEARLY -> jedes Jahr', () => {
    expect(toText({ freq: 'YEARLY' }, { locale: de })).toBe('jedes Jahr')
  })

  it('FREQ=HOURLY -> jede Stunde', () => {
    expect(toText({ freq: 'HOURLY' }, { locale: de })).toBe('jede Stunde')
  })

  it('FREQ=HOURLY;INTERVAL=6 -> alle 6 Stunden', () => {
    expect(toText({ freq: 'HOURLY', interval: 6 }, { locale: de })).toBe('alle 6 Stunden')
  })

  it('FREQ=MINUTELY -> jede Minute', () => {
    expect(toText({ freq: 'MINUTELY' }, { locale: de })).toBe('jede Minute')
  })

  it('FREQ=SECONDLY -> jede Sekunde', () => {
    expect(toText({ freq: 'SECONDLY' }, { locale: de })).toBe('jede Sekunde')
  })

  it('FREQ=WEEKLY;INTERVAL=2 -> alle 2 Wochen', () => {
    expect(toText({ freq: 'WEEKLY', interval: 2 }, { locale: de })).toBe('alle 2 Wochen')
  })
})

describe('toText DE: BYDAY plain weekdays (WEEKLY)', () => {
  it('FREQ=WEEKLY;BYDAY=MO -> jede Woche am Montag', () => {
    expect(
      toText({ freq: 'WEEKLY', byDay: [{ weekday: 'MO', ordinal: undefined }] }, { locale: de })
    ).toBe('jede Woche am Montag')
  })

  it('FREQ=WEEKLY;BYDAY=MO,WE,FR -> jede Woche am Montag, Mittwoch und Freitag', () => {
    expect(
      toText(
        {
          freq: 'WEEKLY',
          byDay: [
            { weekday: 'MO', ordinal: undefined },
            { weekday: 'WE', ordinal: undefined },
            { weekday: 'FR', ordinal: undefined },
          ],
        },
        { locale: de }
      )
    ).toBe('jede Woche am Montag, Mittwoch und Freitag')
  })

  it('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO -> alle 2 Wochen am Montag', () => {
    expect(
      toText(
        { freq: 'WEEKLY', interval: 2, byDay: [{ weekday: 'MO', ordinal: undefined }] },
        { locale: de }
      )
    ).toBe('alle 2 Wochen am Montag')
  })

  it('FREQ=WEEKLY;BYDAY=MO,TU -> jede Woche am Montag und Dienstag', () => {
    expect(
      toText(
        {
          freq: 'WEEKLY',
          byDay: [
            { weekday: 'MO', ordinal: undefined },
            { weekday: 'TU', ordinal: undefined },
          ],
        },
        { locale: de }
      )
    ).toBe('jede Woche am Montag und Dienstag')
  })
})

describe('toText DE: BYDAY ordinal weekdays (MONTHLY)', () => {
  it('FREQ=MONTHLY;BYDAY=1MO -> jeden Monat am 1. Montag', () => {
    expect(
      toText({ freq: 'MONTHLY', byDay: [{ weekday: 'MO', ordinal: 1 }] }, { locale: de })
    ).toBe('jeden Monat am 1. Montag')
  })

  it('FREQ=MONTHLY;BYDAY=-1FR -> jeden Monat am letzten Freitag', () => {
    expect(
      toText({ freq: 'MONTHLY', byDay: [{ weekday: 'FR', ordinal: -1 }] }, { locale: de })
    ).toBe('jeden Monat am letzten Freitag')
  })

  it('FREQ=MONTHLY;BYDAY=2TU -> jeden Monat am 2. Dienstag', () => {
    expect(
      toText({ freq: 'MONTHLY', byDay: [{ weekday: 'TU', ordinal: 2 }] }, { locale: de })
    ).toBe('jeden Monat am 2. Dienstag')
  })
})

describe('toText DE: BYMONTHDAY', () => {
  it('FREQ=MONTHLY;BYMONTHDAY=1 -> jeden Monat am 1.', () => {
    expect(toText({ freq: 'MONTHLY', byMonthDay: [1] }, { locale: de })).toBe('jeden Monat am 1.')
  })

  it('FREQ=MONTHLY;BYMONTHDAY=-1 -> jeden Monat am letzten Tag', () => {
    expect(toText({ freq: 'MONTHLY', byMonthDay: [-1] }, { locale: de })).toBe(
      'jeden Monat am letzten Tag'
    )
  })

  it('FREQ=MONTHLY;BYMONTHDAY=15 -> jeden Monat am 15.', () => {
    expect(toText({ freq: 'MONTHLY', byMonthDay: [15] }, { locale: de })).toBe('jeden Monat am 15.')
  })

  it('FREQ=MONTHLY;BYMONTHDAY=1,15 -> jeden Monat am 1. und 15.', () => {
    expect(toText({ freq: 'MONTHLY', byMonthDay: [1, 15] }, { locale: de })).toBe(
      'jeden Monat am 1. und 15.'
    )
  })

  it('FREQ=MONTHLY;BYMONTHDAY=-2 -> jeden Monat am vorletzten Tag (DE)', () => {
    expect(toText({ freq: 'MONTHLY', byMonthDay: [-2] }, { locale: de })).toBe(
      'jeden Monat am vorletzten Tag'
    )
  })

  it('FREQ=MONTHLY;BYMONTHDAY=-3 -> jeden Monat am 3.-letzten Tag (DE)', () => {
    expect(toText({ freq: 'MONTHLY', byMonthDay: [-3] }, { locale: de })).toBe(
      'jeden Monat am 3.-letzten Tag'
    )
  })
})

describe('toText DE: BYMONTH', () => {
  it('FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1 -> jedes Jahr im Januar am 1.', () => {
    expect(toText({ freq: 'YEARLY', byMonth: [1], byMonthDay: [1] }, { locale: de })).toBe(
      'jedes Jahr im Januar am 1.'
    )
  })

  it('FREQ=YEARLY;BYMONTH=1 -> jedes Jahr im Januar', () => {
    expect(toText({ freq: 'YEARLY', byMonth: [1] }, { locale: de })).toBe('jedes Jahr im Januar')
  })

  it('FREQ=YEARLY;BYMONTH=3,9 -> jedes Jahr in März und September', () => {
    expect(toText({ freq: 'YEARLY', byMonth: [3, 9] }, { locale: de })).toBe(
      'jedes Jahr in März und September'
    )
  })

  it('FREQ=YEARLY;BYMONTH=1,4,7 -> jedes Jahr in Januar, April und Juli', () => {
    expect(toText({ freq: 'YEARLY', byMonth: [1, 4, 7] }, { locale: de })).toBe(
      'jedes Jahr in Januar, April und Juli'
    )
  })
})

describe('toText DE: BYSETPOS patterns', () => {
  it('FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1 -> jeden Monat am letzten Freitag', () => {
    expect(
      toText(
        {
          freq: 'MONTHLY',
          byDay: [{ weekday: 'FR', ordinal: undefined }],
          bySetPos: [-1],
        },
        { locale: de }
      )
    ).toBe('jeden Monat am letzten Freitag')
  })

  it('FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1 -> jeden Monat am 1. Montag', () => {
    expect(
      toText(
        {
          freq: 'MONTHLY',
          byDay: [{ weekday: 'MO', ordinal: undefined }],
          bySetPos: [1],
        },
        { locale: de }
      )
    ).toBe('jeden Monat am 1. Montag')
  })

  it('FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1 -> jeden Monat am letzten Werktag', () => {
    expect(
      toText(
        {
          freq: 'MONTHLY',
          byDay: [
            { weekday: 'MO', ordinal: undefined },
            { weekday: 'TU', ordinal: undefined },
            { weekday: 'WE', ordinal: undefined },
            { weekday: 'TH', ordinal: undefined },
            { weekday: 'FR', ordinal: undefined },
          ],
          bySetPos: [-1],
        },
        { locale: de }
      )
    ).toBe('jeden Monat am letzten Werktag')
  })
})

describe('toText DE: COUNT and UNTIL', () => {
  it('FREQ=DAILY;COUNT=5 -> jeden Tag, 5-mal', () => {
    expect(toText({ freq: 'DAILY', count: 5 }, { locale: de })).toBe('jeden Tag, 5-mal')
  })

  it('FREQ=DAILY;COUNT=1 -> jeden Tag, 1-mal', () => {
    expect(toText({ freq: 'DAILY', count: 1 }, { locale: de })).toBe('jeden Tag, 1-mal')
  })

  it('FREQ=WEEKLY;UNTIL=PlainDate(2025-01-01) -> jede Woche bis 1. Januar 2025', () => {
    const T = getTemporal()
    const until = T.PlainDate.from({ year: 2025, month: 1, day: 1 })
    expect(toText({ freq: 'WEEKLY', until }, { locale: de })).toBe('jede Woche bis 1. Januar 2025')
  })
})

describe('toText DE: time clause (BYHOUR and BYMINUTE)', () => {
  it('FREQ=DAILY;BYHOUR=9;BYMINUTE=0 -> jeden Tag um 9:00', () => {
    expect(toText({ freq: 'DAILY', byHour: [9], byMinute: [0] }, { locale: de })).toBe(
      'jeden Tag um 9:00'
    )
  })

  it('FREQ=DAILY;BYHOUR=9;BYMINUTE=30 -> jeden Tag um 9:30', () => {
    expect(toText({ freq: 'DAILY', byHour: [9], byMinute: [30] }, { locale: de })).toBe(
      'jeden Tag um 9:30'
    )
  })

  it('FREQ=DAILY;BYHOUR=9,17;BYMINUTE=0 -> jeden Tag um 9:00 und 17:00', () => {
    expect(toText({ freq: 'DAILY', byHour: [9, 17], byMinute: [0] }, { locale: de })).toBe(
      'jeden Tag um 9:00 und 17:00'
    )
  })
})

describe('toText DE: formatOrdinal', () => {
  it('positive ordinal appends period: 1 -> 1.', () => {
    expect(toText({ freq: 'MONTHLY', byMonthDay: [1] }, { locale: de })).toBe('jeden Monat am 1.')
  })

  it('positive ordinal appends period: 3 -> 3.', () => {
    expect(toText({ freq: 'MONTHLY', byMonthDay: [3] }, { locale: de })).toBe('jeden Monat am 3.')
  })

  it('negative ordinal -2 renders as vorletzten in BYDAY context', () => {
    expect(
      toText({ freq: 'MONTHLY', byDay: [{ weekday: 'MO', ordinal: -2 }] }, { locale: de })
    ).toBe('jeden Monat am vorletzten Montag')
  })
})

// ---------------------------------------------------------------------------
// Regression tests for adversarial-review issues
// ---------------------------------------------------------------------------

describe('toText regression: BLOCKING negative BYDAY ordinals below -1', () => {
  it('FREQ=MONTHLY;BYDAY=-2MO EN -> every month on the 2nd-to-last Monday', () => {
    expect(toText({ freq: 'MONTHLY', byDay: [{ weekday: 'MO', ordinal: -2 }] })).toBe(
      'every month on the 2nd-to-last Monday'
    )
  })

  it('FREQ=MONTHLY;BYDAY=-3FR EN -> every month on the 3rd-to-last Friday', () => {
    expect(toText({ freq: 'MONTHLY', byDay: [{ weekday: 'FR', ordinal: -3 }] })).toBe(
      'every month on the 3rd-to-last Friday'
    )
  })

  it('FREQ=MONTHLY;BYDAY=-2MO DE -> jeden Monat am vorletzten Montag', () => {
    expect(
      toText({ freq: 'MONTHLY', byDay: [{ weekday: 'MO', ordinal: -2 }] }, { locale: de })
    ).toBe('jeden Monat am vorletzten Montag')
  })

  it('FREQ=MONTHLY;BYDAY=-3FR DE -> jeden Monat am 3.-letzten Freitag', () => {
    expect(
      toText({ freq: 'MONTHLY', byDay: [{ weekday: 'FR', ordinal: -3 }] }, { locale: de })
    ).toBe('jeden Monat am 3.-letzten Freitag')
  })
})

describe('toText regression: MAJOR BYSETPOS non-last with Mon-Fri set -> fallback', () => {
  it('BYSETPOS=2 + Mon-Fri -> (complex recurrence rule)', () => {
    expect(
      toText({
        freq: 'MONTHLY',
        byDay: [
          { weekday: 'MO', ordinal: undefined },
          { weekday: 'TU', ordinal: undefined },
          { weekday: 'WE', ordinal: undefined },
          { weekday: 'TH', ordinal: undefined },
          { weekday: 'FR', ordinal: undefined },
        ],
        bySetPos: [2],
      })
    ).toBe(COMPLEX_RULE_FALLBACK)
  })

  it('BYSETPOS=1 + Mon-Fri -> (complex recurrence rule)', () => {
    expect(
      toText({
        freq: 'MONTHLY',
        byDay: [
          { weekday: 'MO', ordinal: undefined },
          { weekday: 'TU', ordinal: undefined },
          { weekday: 'WE', ordinal: undefined },
          { weekday: 'TH', ordinal: undefined },
          { weekday: 'FR', ordinal: undefined },
        ],
        bySetPos: [1],
      })
    ).toBe(COMPLEX_RULE_FALLBACK)
  })

  it('BYSETPOS=-1 + Mon-Fri still renders "the last weekday"', () => {
    expect(
      toText({
        freq: 'MONTHLY',
        byDay: [
          { weekday: 'MO', ordinal: undefined },
          { weekday: 'TU', ordinal: undefined },
          { weekday: 'WE', ordinal: undefined },
          { weekday: 'TH', ordinal: undefined },
          { weekday: 'FR', ordinal: undefined },
        ],
        bySetPos: [-1],
      })
    ).toBe('every month on the last weekday')
  })
})

describe('toText regression: MAJOR BYDAY + BYMONTHDAY both present -> fallback', () => {
  it('FREQ=MONTHLY;BYDAY=MO;BYMONTHDAY=1 -> (complex recurrence rule)', () => {
    expect(
      toText({
        freq: 'MONTHLY',
        byDay: [{ weekday: 'MO', ordinal: undefined }],
        byMonthDay: [1],
      })
    ).toBe(COMPLEX_RULE_FALLBACK)
  })

  it('FREQ=WEEKLY;BYDAY=MO;BYMONTHDAY=15 -> (complex recurrence rule)', () => {
    expect(
      toText({
        freq: 'WEEKLY',
        byDay: [{ weekday: 'MO', ordinal: undefined }],
        byMonthDay: [15],
      })
    ).toBe(COMPLEX_RULE_FALLBACK)
  })
})

describe('toText regression: MAJOR multiple BYMINUTE values -> fallback', () => {
  it('BYHOUR=9;BYMINUTE=0,30 -> (complex recurrence rule)', () => {
    expect(toText({ freq: 'DAILY', byHour: [9], byMinute: [0, 30] })).toBe(COMPLEX_RULE_FALLBACK)
  })

  it('BYHOUR=9,17;BYMINUTE=0,30 -> (complex recurrence rule)', () => {
    expect(toText({ freq: 'DAILY', byHour: [9, 17], byMinute: [0, 30] })).toBe(
      COMPLEX_RULE_FALLBACK
    )
  })

  it('BYHOUR=9;BYMINUTE=30 (single minute) still renders correctly', () => {
    expect(toText({ freq: 'DAILY', byHour: [9], byMinute: [30] })).toBe('every day at 9:30')
  })
})

describe('toText DE: formatList (no Oxford comma)', () => {
  it('two items joined with "und" only', () => {
    expect(
      toText(
        {
          freq: 'WEEKLY',
          byDay: [
            { weekday: 'MO', ordinal: undefined },
            { weekday: 'FR', ordinal: undefined },
          ],
        },
        { locale: de }
      )
    ).toBe('jede Woche am Montag und Freitag')
  })

  it('three items: comma between first two, then "und" (no Oxford comma)', () => {
    expect(
      toText(
        {
          freq: 'WEEKLY',
          byDay: [
            { weekday: 'MO', ordinal: undefined },
            { weekday: 'WE', ordinal: undefined },
            { weekday: 'FR', ordinal: undefined },
          ],
        },
        { locale: de }
      )
    ).toBe('jede Woche am Montag, Mittwoch und Freitag')
  })
})

describe('toText DE: complex rule fallback (locale-specific)', () => {
  it('BYWEEKNO triggers DE fallback phrase', () => {
    expect(
      toText(
        {
          freq: 'YEARLY',
          byWeekNo: [1],
          byDay: [{ weekday: 'MO', ordinal: undefined }],
        },
        { locale: de }
      )
    ).toBe(DE_FALLBACK)
  })

  it('BYYEARDAY triggers DE fallback phrase', () => {
    expect(toText({ freq: 'YEARLY', byYearDay: [1] }, { locale: de })).toBe(DE_FALLBACK)
  })

  it('DE fallback is different from EN fallback', () => {
    expect(DE_FALLBACK).not.toBe(COMPLEX_RULE_FALLBACK)
  })
})

// ---------------------------------------------------------------------------
// FR golden strings
// ---------------------------------------------------------------------------

describe('toText FR: frequency and interval', () => {
  it('FREQ=DAILY -> tous les jours', () => {
    expect(toText({ freq: 'DAILY' }, { locale: fr })).toBe('tous les jours')
  })

  it('FREQ=DAILY;INTERVAL=2 -> tous les 2 jours', () => {
    expect(toText({ freq: 'DAILY', interval: 2 }, { locale: fr })).toBe('tous les 2 jours')
  })

  it('FREQ=WEEKLY -> toutes les semaines', () => {
    expect(toText({ freq: 'WEEKLY' }, { locale: fr })).toBe('toutes les semaines')
  })

  it('FREQ=MONTHLY -> tous les mois', () => {
    expect(toText({ freq: 'MONTHLY' }, { locale: fr })).toBe('tous les mois')
  })

  it('FREQ=YEARLY -> tous les ans', () => {
    expect(toText({ freq: 'YEARLY' }, { locale: fr })).toBe('tous les ans')
  })

  it('FREQ=HOURLY -> toutes les heures', () => {
    expect(toText({ freq: 'HOURLY' }, { locale: fr })).toBe('toutes les heures')
  })

  it('FREQ=HOURLY;INTERVAL=6 -> toutes les 6 heures', () => {
    expect(toText({ freq: 'HOURLY', interval: 6 }, { locale: fr })).toBe('toutes les 6 heures')
  })

  it('FREQ=MINUTELY -> toutes les minutes', () => {
    expect(toText({ freq: 'MINUTELY' }, { locale: fr })).toBe('toutes les minutes')
  })

  it('FREQ=SECONDLY -> toutes les secondes', () => {
    expect(toText({ freq: 'SECONDLY' }, { locale: fr })).toBe('toutes les secondes')
  })

  it('FREQ=WEEKLY;INTERVAL=2 -> toutes les 2 semaines', () => {
    expect(toText({ freq: 'WEEKLY', interval: 2 }, { locale: fr })).toBe('toutes les 2 semaines')
  })
})

describe('toText FR: BYDAY plain weekdays (WEEKLY)', () => {
  it('FREQ=WEEKLY;BYDAY=MO -> toutes les semaines le lundi', () => {
    expect(
      toText({ freq: 'WEEKLY', byDay: [{ weekday: 'MO', ordinal: undefined }] }, { locale: fr })
    ).toBe('toutes les semaines le lundi')
  })

  it('FREQ=WEEKLY;BYDAY=MO,WE,FR -> toutes les semaines le lundi, mercredi et vendredi', () => {
    expect(
      toText(
        {
          freq: 'WEEKLY',
          byDay: [
            { weekday: 'MO', ordinal: undefined },
            { weekday: 'WE', ordinal: undefined },
            { weekday: 'FR', ordinal: undefined },
          ],
        },
        { locale: fr }
      )
    ).toBe('toutes les semaines le lundi, mercredi et vendredi')
  })

  it('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO -> toutes les 2 semaines le lundi', () => {
    expect(
      toText(
        { freq: 'WEEKLY', interval: 2, byDay: [{ weekday: 'MO', ordinal: undefined }] },
        { locale: fr }
      )
    ).toBe('toutes les 2 semaines le lundi')
  })

  it('FREQ=WEEKLY;BYDAY=MO,TU -> toutes les semaines le lundi et mardi', () => {
    expect(
      toText(
        {
          freq: 'WEEKLY',
          byDay: [
            { weekday: 'MO', ordinal: undefined },
            { weekday: 'TU', ordinal: undefined },
          ],
        },
        { locale: fr }
      )
    ).toBe('toutes les semaines le lundi et mardi')
  })
})

describe('toText FR: BYDAY ordinal weekdays (MONTHLY)', () => {
  it('FREQ=MONTHLY;BYDAY=1MO -> tous les mois le 1er lundi', () => {
    expect(
      toText({ freq: 'MONTHLY', byDay: [{ weekday: 'MO', ordinal: 1 }] }, { locale: fr })
    ).toBe('tous les mois le 1er lundi')
  })

  it('FREQ=MONTHLY;BYDAY=-1FR -> tous les mois le dernier vendredi', () => {
    expect(
      toText({ freq: 'MONTHLY', byDay: [{ weekday: 'FR', ordinal: -1 }] }, { locale: fr })
    ).toBe('tous les mois le dernier vendredi')
  })

  it('FREQ=MONTHLY;BYDAY=2TU -> tous les mois le 2e mardi', () => {
    expect(
      toText({ freq: 'MONTHLY', byDay: [{ weekday: 'TU', ordinal: 2 }] }, { locale: fr })
    ).toBe('tous les mois le 2e mardi')
  })

  it('FREQ=MONTHLY;BYDAY=3WE -> tous les mois le 3e mercredi', () => {
    expect(
      toText({ freq: 'MONTHLY', byDay: [{ weekday: 'WE', ordinal: 3 }] }, { locale: fr })
    ).toBe('tous les mois le 3e mercredi')
  })
})

describe('toText FR: BYMONTHDAY', () => {
  it('FREQ=MONTHLY;BYMONTHDAY=1 -> tous les mois le 1er', () => {
    expect(toText({ freq: 'MONTHLY', byMonthDay: [1] }, { locale: fr })).toBe('tous les mois le 1er')
  })

  it('FREQ=MONTHLY;BYMONTHDAY=-1 -> tous les mois le dernier jour', () => {
    expect(toText({ freq: 'MONTHLY', byMonthDay: [-1] }, { locale: fr })).toBe(
      'tous les mois le dernier jour'
    )
  })

  it('FREQ=MONTHLY;BYMONTHDAY=15 -> tous les mois le 15e', () => {
    expect(toText({ freq: 'MONTHLY', byMonthDay: [15] }, { locale: fr })).toBe('tous les mois le 15e')
  })

  it('FREQ=MONTHLY;BYMONTHDAY=1,15 -> tous les mois le 1er et 15e', () => {
    expect(toText({ freq: 'MONTHLY', byMonthDay: [1, 15] }, { locale: fr })).toBe(
      'tous les mois le 1er et 15e'
    )
  })

  it('FREQ=MONTHLY;BYMONTHDAY=-2 -> tous les mois le avant-dernier jour (FR)', () => {
    expect(toText({ freq: 'MONTHLY', byMonthDay: [-2] }, { locale: fr })).toBe(
      'tous les mois le avant-dernier jour'
    )
  })

  it('FREQ=MONTHLY;BYMONTHDAY=-3 -> tous les mois le 3e-avant-dernier jour (FR)', () => {
    expect(toText({ freq: 'MONTHLY', byMonthDay: [-3] }, { locale: fr })).toBe(
      'tous les mois le 3e-avant-dernier jour'
    )
  })
})

describe('toText FR: BYMONTH', () => {
  it('FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1 -> tous les ans en janvier le 1er', () => {
    expect(toText({ freq: 'YEARLY', byMonth: [1], byMonthDay: [1] }, { locale: fr })).toBe(
      'tous les ans en janvier le 1er'
    )
  })

  it('FREQ=YEARLY;BYMONTH=1 -> tous les ans en janvier', () => {
    expect(toText({ freq: 'YEARLY', byMonth: [1] }, { locale: fr })).toBe('tous les ans en janvier')
  })

  it('FREQ=YEARLY;BYMONTH=3,9 -> tous les ans en mars et septembre', () => {
    expect(toText({ freq: 'YEARLY', byMonth: [3, 9] }, { locale: fr })).toBe(
      'tous les ans en mars et septembre'
    )
  })

  it('FREQ=YEARLY;BYMONTH=1,4,7 -> tous les ans en janvier, avril et juillet', () => {
    expect(toText({ freq: 'YEARLY', byMonth: [1, 4, 7] }, { locale: fr })).toBe(
      'tous les ans en janvier, avril et juillet'
    )
  })
})

describe('toText FR: BYSETPOS patterns', () => {
  it('FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1 -> tous les mois le dernier vendredi', () => {
    expect(
      toText(
        {
          freq: 'MONTHLY',
          byDay: [{ weekday: 'FR', ordinal: undefined }],
          bySetPos: [-1],
        },
        { locale: fr }
      )
    ).toBe('tous les mois le dernier vendredi')
  })

  it('FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1 -> tous les mois le 1er lundi', () => {
    expect(
      toText(
        {
          freq: 'MONTHLY',
          byDay: [{ weekday: 'MO', ordinal: undefined }],
          bySetPos: [1],
        },
        { locale: fr }
      )
    ).toBe('tous les mois le 1er lundi')
  })

  it('FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1 -> tous les mois le dernier jour ouvrable', () => {
    expect(
      toText(
        {
          freq: 'MONTHLY',
          byDay: [
            { weekday: 'MO', ordinal: undefined },
            { weekday: 'TU', ordinal: undefined },
            { weekday: 'WE', ordinal: undefined },
            { weekday: 'TH', ordinal: undefined },
            { weekday: 'FR', ordinal: undefined },
          ],
          bySetPos: [-1],
        },
        { locale: fr }
      )
    ).toBe('tous les mois le dernier jour ouvrable')
  })
})

describe('toText FR: COUNT and UNTIL', () => {
  it('FREQ=DAILY;COUNT=5 -> tous les jours, 5 fois', () => {
    expect(toText({ freq: 'DAILY', count: 5 }, { locale: fr })).toBe('tous les jours, 5 fois')
  })

  it('FREQ=DAILY;COUNT=1 -> tous les jours, 1 fois', () => {
    expect(toText({ freq: 'DAILY', count: 1 }, { locale: fr })).toBe('tous les jours, 1 fois')
  })

  it("FREQ=WEEKLY;UNTIL=PlainDate(2025-01-01) -> toutes les semaines jusqu'au 1er janvier 2025", () => {
    const T = getTemporal()
    const until = T.PlainDate.from({ year: 2025, month: 1, day: 1 })
    expect(toText({ freq: 'WEEKLY', until }, { locale: fr })).toBe(
      "toutes les semaines jusqu'au 1er janvier 2025"
    )
  })
})

describe('toText FR: time clause (BYHOUR and BYMINUTE)', () => {
  it('FREQ=DAILY;BYHOUR=9;BYMINUTE=0 -> tous les jours à 9:00', () => {
    expect(toText({ freq: 'DAILY', byHour: [9], byMinute: [0] }, { locale: fr })).toBe(
      'tous les jours à 9:00'
    )
  })

  it('FREQ=DAILY;BYHOUR=9;BYMINUTE=30 -> tous les jours à 9:30', () => {
    expect(toText({ freq: 'DAILY', byHour: [9], byMinute: [30] }, { locale: fr })).toBe(
      'tous les jours à 9:30'
    )
  })

  it('FREQ=DAILY;BYHOUR=9,17;BYMINUTE=0 -> tous les jours à 9:00 et 17:00', () => {
    expect(toText({ freq: 'DAILY', byHour: [9, 17], byMinute: [0] }, { locale: fr })).toBe(
      'tous les jours à 9:00 et 17:00'
    )
  })
})

describe('toText FR: formatOrdinal', () => {
  it('ordinal 1 -> 1er', () => {
    expect(toText({ freq: 'MONTHLY', byMonthDay: [1] }, { locale: fr })).toBe('tous les mois le 1er')
  })

  it('ordinal 2 -> 2e', () => {
    expect(toText({ freq: 'MONTHLY', byMonthDay: [2] }, { locale: fr })).toBe('tous les mois le 2e')
  })

  it('ordinal 3 -> 3e', () => {
    expect(toText({ freq: 'MONTHLY', byMonthDay: [3] }, { locale: fr })).toBe('tous les mois le 3e')
  })

  it('ordinal 21 -> 21e', () => {
    expect(toText({ freq: 'MONTHLY', byMonthDay: [21] }, { locale: fr })).toBe(
      'tous les mois le 21e'
    )
  })

  it('negative ordinal -2 renders as avant-dernier in BYDAY context', () => {
    expect(
      toText({ freq: 'MONTHLY', byDay: [{ weekday: 'MO', ordinal: -2 }] }, { locale: fr })
    ).toBe('tous les mois le avant-dernier lundi')
  })
})

describe('toText FR: formatList (no Oxford comma)', () => {
  it('two items joined with "et" only', () => {
    expect(
      toText(
        {
          freq: 'WEEKLY',
          byDay: [
            { weekday: 'MO', ordinal: undefined },
            { weekday: 'FR', ordinal: undefined },
          ],
        },
        { locale: fr }
      )
    ).toBe('toutes les semaines le lundi et vendredi')
  })

  it('three items: comma between first two, then "et" (no Oxford comma)', () => {
    expect(
      toText(
        {
          freq: 'WEEKLY',
          byDay: [
            { weekday: 'MO', ordinal: undefined },
            { weekday: 'WE', ordinal: undefined },
            { weekday: 'FR', ordinal: undefined },
          ],
        },
        { locale: fr }
      )
    ).toBe('toutes les semaines le lundi, mercredi et vendredi')
  })
})

describe('toText FR: complex rule fallback (locale-specific)', () => {
  it('BYWEEKNO triggers FR fallback phrase', () => {
    expect(
      toText(
        {
          freq: 'YEARLY',
          byWeekNo: [1],
          byDay: [{ weekday: 'MO', ordinal: undefined }],
        },
        { locale: fr }
      )
    ).toBe(FR_FALLBACK)
  })

  it('BYYEARDAY triggers FR fallback phrase', () => {
    expect(toText({ freq: 'YEARLY', byYearDay: [1] }, { locale: fr })).toBe(FR_FALLBACK)
  })

  it('FR fallback is different from EN fallback', () => {
    expect(FR_FALLBACK).not.toBe(COMPLEX_RULE_FALLBACK)
  })

  it('FR fallback is different from DE fallback', () => {
    expect(FR_FALLBACK).not.toBe(DE_FALLBACK)
  })
})
