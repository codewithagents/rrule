// Hardcoded seed cases for the conformance corpus.
//
// Two categories:
//
//   1. RFC 5545 §3.8.5.3 worked examples — the canonical RRULE test vectors
//      from the specification itself. These are the ones every RRULE library
//      must agree on; any divergence from the oracle is a real bug.
//
//   2. DST edge cases — rules that cross a DST boundary in several IANA zones,
//      including zones with unusual offsets (Australia/Lord_Howe 30-min DST,
//      Pacific/Apia date-line flip). The oracle (python-dateutil) is the source
//      of truth for expected behaviour; rrule-ts expand() must match exactly.

import type { OracleInput } from './generator.js'

export const seededCases: OracleInput[] = [
  // =========================================================================
  // RFC 5545 §3.8.5.3 worked examples
  //
  // dtstart uses the examples from the RFC. Where the RFC uses "US-Eastern"
  // we use floating local time (no tzid) since the occurrence *values* in the
  // RFC are timezone-independent at that level. For UTC examples we keep the Z.
  // =========================================================================

  // --- DAILY ----------------------------------------------------------------

  {
    id: 'rfc-daily-count-10',
    label: 'RFC §3.8.5.3: daily for 10 occurrences',
    rrule: 'FREQ=DAILY;COUNT=10',
    dtstart: '1997-09-02T09:00:00',
    tzid: null,
    count: 10,
  },
  {
    id: 'rfc-daily-until-19971224',
    label: 'RFC §3.8.5.3: daily until December 24, 1997',
    rrule: 'FREQ=DAILY;UNTIL=19971224T000000Z',
    dtstart: '1997-09-02T09:00:00Z',
    tzid: null,
    count: 30, // RFC has 113 total; we verify the first 30
  },
  {
    id: 'rfc-daily-interval-2',
    label: 'RFC §3.8.5.3: every other day (first 10)',
    rrule: 'FREQ=DAILY;INTERVAL=2',
    dtstart: '1997-09-02T09:00:00',
    tzid: null,
    count: 10,
  },
  {
    id: 'rfc-daily-interval-10-count-5',
    label: 'RFC §3.8.5.3: every 10 days, 5 occurrences',
    rrule: 'FREQ=DAILY;INTERVAL=10;COUNT=5',
    dtstart: '1997-09-02T09:00:00',
    tzid: null,
    count: 5,
  },

  // --- WEEKLY ---------------------------------------------------------------

  {
    id: 'rfc-weekly-count-10',
    label: 'RFC §3.8.5.3: weekly for 10 occurrences',
    rrule: 'FREQ=WEEKLY;COUNT=10',
    dtstart: '1997-09-02T09:00:00',
    tzid: null,
    count: 10,
  },
  {
    id: 'rfc-weekly-until-19971224',
    label: 'RFC §3.8.5.3: weekly until December 24, 1997',
    rrule: 'FREQ=WEEKLY;UNTIL=19971224T000000Z',
    dtstart: '1997-09-02T09:00:00Z',
    tzid: null,
    count: 20,
  },
  {
    id: 'rfc-weekly-interval-2',
    label: 'RFC §3.8.5.3: every other week (first 10)',
    rrule: 'FREQ=WEEKLY;INTERVAL=2;WKST=SU',
    dtstart: '1997-09-02T09:00:00',
    tzid: null,
    count: 10,
  },
  {
    id: 'rfc-weekly-tu-th-until',
    label: 'RFC §3.8.5.3: weekly TU+TH until Oct 7, 1997',
    rrule: 'FREQ=WEEKLY;UNTIL=19971007T000000Z;WKST=SU;BYDAY=TU,TH',
    dtstart: '1997-09-02T09:00:00Z',
    tzid: null,
    count: 10,
  },
  {
    id: 'rfc-weekly-interval-2-mo-we-fr',
    label: 'RFC §3.8.5.3: every other week MO+WE+FR, 8 occurrences',
    rrule: 'FREQ=WEEKLY;INTERVAL=2;COUNT=8;WKST=SU;BYDAY=MO,WE,FR',
    dtstart: '1997-09-03T09:00:00',
    tzid: null,
    count: 8,
  },

  // --- MONTHLY --------------------------------------------------------------

  {
    id: 'rfc-monthly-1fr-count-10',
    label: 'RFC §3.8.5.3: monthly on 1st Friday, 10 occurrences',
    rrule: 'FREQ=MONTHLY;COUNT=10;BYDAY=1FR',
    dtstart: '1997-09-05T09:00:00',
    tzid: null,
    count: 10,
  },
  {
    id: 'rfc-monthly-bymonthday-1-neg1',
    label: 'RFC §3.8.5.3: monthly on 1st and last day, 10 occurrences',
    rrule: 'FREQ=MONTHLY;COUNT=10;BYMONTHDAY=1,-1',
    dtstart: '1997-09-30T09:00:00Z',
    tzid: null,
    count: 10,
  },
  {
    id: 'rfc-monthly-interval-18-bymonthday',
    label: 'RFC §3.8.5.3: every 18 months, days 10-15, 10 occurrences',
    rrule: 'FREQ=MONTHLY;INTERVAL=18;COUNT=10;BYMONTHDAY=10,11,12,13,14,15',
    dtstart: '1997-09-10T09:00:00Z',
    tzid: null,
    count: 10,
  },
  {
    id: 'rfc-monthly-interval-2-byday-tu',
    label: 'RFC §3.8.5.3: every other month on Tuesdays, 10 occurrences',
    rrule: 'FREQ=MONTHLY;INTERVAL=2;COUNT=10;BYDAY=TU',
    dtstart: '1997-09-02T09:00:00Z',
    tzid: null,
    count: 10,
  },
  {
    id: 'rfc-monthly-bysetpos-neg1-th',
    label: 'RFC §3.8.5.3: last Thursday of month, 10 occurrences',
    rrule: 'FREQ=MONTHLY;COUNT=10;BYDAY=TH;BYSETPOS=-1',
    dtstart: '1997-09-29T09:00:00Z',
    tzid: null,
    count: 10,
  },
  {
    id: 'rfc-monthly-fr-bymonthday-13',
    label: 'RFC §3.8.5.3: Friday the 13th, 10 occurrences',
    rrule: 'FREQ=MONTHLY;COUNT=10;BYDAY=FR;BYMONTHDAY=13',
    dtstart: '1997-09-02T09:00:00Z',
    tzid: null,
    count: 10,
  },
  {
    id: 'rfc-monthly-sa-after-first-su',
    label: 'RFC §3.8.5.3: first Saturday following first Sunday, 10 occurrences',
    rrule: 'FREQ=MONTHLY;COUNT=10;BYDAY=SA;BYMONTHDAY=7,8,9,10,11,12,13',
    dtstart: '1997-09-13T09:00:00Z',
    tzid: null,
    count: 10,
  },
  {
    id: 'rfc-monthly-neg2-mo',
    label: 'RFC §3.8.5.3: second-to-last Monday of month, 6 occurrences',
    rrule: 'FREQ=MONTHLY;COUNT=6;BYDAY=-2MO',
    dtstart: '1997-09-22T09:00:00Z',
    tzid: null,
    count: 6,
  },
  {
    id: 'rfc-monthly-bysetpos-3-tu-we-th',
    label: 'RFC §3.8.5.3: 3rd TU/WE/TH in month, 3 months',
    rrule: 'FREQ=MONTHLY;COUNT=3;BYDAY=TU,WE,TH;BYSETPOS=3',
    dtstart: '1997-09-04T09:00:00Z',
    tzid: null,
    count: 3,
  },
  {
    id: 'rfc-monthly-bysetpos-neg2-weekdays',
    label: 'RFC §3.8.5.3: second-to-last weekday, 7 months',
    rrule: 'FREQ=MONTHLY;COUNT=7;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-2',
    dtstart: '1997-09-29T09:00:00Z',
    tzid: null,
    count: 7,
  },

  // --- YEARLY ---------------------------------------------------------------

  {
    id: 'rfc-yearly-bymonth-6-7',
    label: 'RFC §3.8.5.3: yearly June+July, 10 occurrences',
    rrule: 'FREQ=YEARLY;COUNT=10;BYMONTH=6,7',
    dtstart: '1997-06-10T09:00:00Z',
    tzid: null,
    count: 10,
  },
  {
    id: 'rfc-yearly-interval-2-bymonth-1-2-3',
    label: 'RFC §3.8.5.3: every other year Jan+Feb+Mar, 10 occurrences',
    rrule: 'FREQ=YEARLY;INTERVAL=2;COUNT=10;BYMONTH=1,2,3',
    dtstart: '1997-03-10T09:00:00Z',
    tzid: null,
    count: 10,
  },
  {
    id: 'rfc-yearly-interval-3-byyearday',
    label: 'RFC §3.8.5.3: every 3rd year days 1,100,200 — 10 occurrences',
    rrule: 'FREQ=YEARLY;INTERVAL=3;COUNT=10;BYYEARDAY=1,100,200',
    dtstart: '1997-01-01T09:00:00Z',
    tzid: null,
    count: 10,
  },
  {
    id: 'rfc-yearly-20mo',
    label: 'RFC §3.8.5.3: every 20th Monday of the year, 10 occurrences',
    rrule: 'FREQ=YEARLY;COUNT=10;BYDAY=20MO',
    dtstart: '1997-05-19T09:00:00Z',
    tzid: null,
    count: 10,
  },
  {
    id: 'rfc-yearly-byweekno-20-mo',
    label: 'RFC §3.8.5.3: Monday of week 20, 10 occurrences',
    rrule: 'FREQ=YEARLY;COUNT=10;BYWEEKNO=20;BYDAY=MO',
    dtstart: '1997-05-12T09:00:00Z',
    tzid: null,
    count: 10,
  },
  {
    id: 'rfc-yearly-bymonth-3-byday-th',
    label: 'RFC §3.8.5.3: every Thursday in March, 10 occurrences',
    rrule: 'FREQ=YEARLY;COUNT=10;BYMONTH=3;BYDAY=TH',
    dtstart: '1997-03-13T09:00:00Z',
    tzid: null,
    count: 10,
  },
  {
    id: 'rfc-yearly-election-day',
    label: 'RFC §3.8.5.3: US presidential election day, 10 occurrences',
    rrule: 'FREQ=YEARLY;INTERVAL=4;COUNT=10;BYMONTH=11;BYDAY=TU;BYMONTHDAY=2,3,4,5,6,7,8',
    dtstart: '1996-11-05T09:00:00Z',
    tzid: null,
    count: 10,
  },
  {
    id: 'rfc-yearly-every-day-january',
    label: 'RFC §3.8.5.3: every day in January (3 years)',
    rrule: 'FREQ=YEARLY;UNTIL=20000131T140000Z;BYMONTH=1;BYDAY=SU,MO,TU,WE,TH,FR,SA',
    dtstart: '1998-01-01T09:00:00Z',
    tzid: null,
    count: 30,
  },

  // --- SUB-DAY --------------------------------------------------------------

  {
    id: 'rfc-hourly-interval-3-count-3',
    label: 'RFC §3.8.5.3: every 3 hours, 3 occurrences',
    rrule: 'FREQ=HOURLY;INTERVAL=3;COUNT=3',
    dtstart: '1997-09-02T09:00:00Z',
    tzid: null,
    count: 3,
  },
  {
    id: 'rfc-minutely-interval-15-count-6',
    label: 'RFC §3.8.5.3: every 15 minutes, 6 occurrences',
    rrule: 'FREQ=MINUTELY;INTERVAL=15;COUNT=6',
    dtstart: '1997-09-02T09:00:00Z',
    tzid: null,
    count: 6,
  },
  {
    id: 'rfc-minutely-interval-90-count-4',
    label: 'RFC §3.8.5.3: every 90 minutes, 4 occurrences',
    rrule: 'FREQ=MINUTELY;INTERVAL=90;COUNT=4',
    dtstart: '1997-09-02T09:00:00Z',
    tzid: null,
    count: 4,
  },
  {
    id: 'rfc-daily-byhour-byminute',
    label: 'RFC §3.8.5.3: daily at :00,:20,:40 past hours 9-16 (first 10)',
    rrule: 'FREQ=DAILY;BYHOUR=9,10,11,12,13,14,15,16;BYMINUTE=0,20,40',
    dtstart: '1997-09-02T09:00:00Z',
    tzid: null,
    count: 10,
  },

  // =========================================================================
  // Additional targeted cases for hard parts
  // =========================================================================

  {
    id: 'extra-byweekno-53',
    label: 'BYWEEKNO=53 (years that have a week 53)',
    rrule: 'FREQ=YEARLY;COUNT=5;BYWEEKNO=53;BYDAY=MO',
    dtstart: '1998-12-28T09:00:00Z',
    tzid: null,
    count: 5,
  },
  {
    id: 'extra-bysetpos-neg1-bymonthday',
    label: 'BYSETPOS=-1 with BYMONTHDAY selects last listed day',
    rrule: 'FREQ=MONTHLY;COUNT=6;BYMONTHDAY=1,2,3;BYSETPOS=-1',
    dtstart: '1997-09-01T09:00:00Z',
    tzid: null,
    count: 6,
  },
  {
    id: 'extra-byyearday-negative',
    label: 'BYYEARDAY with negative values (-1 = last day of year)',
    rrule: 'FREQ=YEARLY;COUNT=5;BYYEARDAY=-1',
    dtstart: '1997-12-31T09:00:00Z',
    tzid: null,
    count: 5,
  },
  {
    id: 'extra-monthly-neg1-fr',
    label: 'Last Friday of month (-1FR), 12 occurrences',
    rrule: 'FREQ=MONTHLY;COUNT=12;BYDAY=-1FR',
    dtstart: '1997-09-26T09:00:00Z',
    tzid: null,
    count: 12,
  },

  // =========================================================================
  // DST edge cases
  // =========================================================================

  // --- America/Los_Angeles --------------------------------------------------
  // Spring forward 2024: March 10 (02:00 -> 03:00)
  {
    id: 'dst-la-spring-daily',
    label: 'DST: America/Los_Angeles spring-forward 2024, daily at 02:30',
    rrule: 'FREQ=DAILY;COUNT=7',
    dtstart: '2024-03-08T02:30:00',
    tzid: 'America/Los_Angeles',
    count: 7,
  },
  {
    id: 'dst-la-spring-weekly',
    label: 'DST: America/Los_Angeles spring-forward 2024, weekly at 10:00',
    rrule: 'FREQ=WEEKLY;COUNT=5',
    dtstart: '2024-03-07T10:00:00',
    tzid: 'America/Los_Angeles',
    count: 5,
  },
  // Fall back 2024: November 3 (02:00 -> 01:00)
  {
    id: 'dst-la-fall-daily',
    label: 'DST: America/Los_Angeles fall-back 2024, daily at 01:30',
    rrule: 'FREQ=DAILY;COUNT=7',
    dtstart: '2024-11-01T01:30:00',
    tzid: 'America/Los_Angeles',
    count: 7,
  },
  {
    id: 'dst-la-fall-hourly',
    label: 'DST: America/Los_Angeles fall-back 2024, hourly crossing fold',
    rrule: 'FREQ=HOURLY;COUNT=6',
    dtstart: '2024-11-03T00:00:00',
    tzid: 'America/Los_Angeles',
    count: 6,
  },

  // --- Europe/Berlin --------------------------------------------------------
  // Spring forward 2024: March 31 (02:00 -> 03:00)
  {
    id: 'dst-berlin-spring-daily',
    label: 'DST: Europe/Berlin spring-forward 2024, daily at 02:00',
    rrule: 'FREQ=DAILY;COUNT=5',
    dtstart: '2024-03-29T02:00:00',
    tzid: 'Europe/Berlin',
    count: 5,
  },
  {
    id: 'dst-berlin-spring-weekly',
    label: 'DST: Europe/Berlin spring-forward 2024, weekly',
    rrule: 'FREQ=WEEKLY;COUNT=5',
    dtstart: '2024-03-28T09:00:00',
    tzid: 'Europe/Berlin',
    count: 5,
  },
  // Fall back 2024: October 27 (03:00 -> 02:00)
  {
    id: 'dst-berlin-fall-daily',
    label: 'DST: Europe/Berlin fall-back 2024, daily at 02:30',
    rrule: 'FREQ=DAILY;COUNT=5',
    dtstart: '2024-10-25T02:30:00',
    tzid: 'Europe/Berlin',
    count: 5,
  },
  {
    id: 'dst-berlin-fall-hourly',
    label: 'DST: Europe/Berlin fall-back 2024, hourly crossing fold',
    rrule: 'FREQ=HOURLY;COUNT=6',
    dtstart: '2024-10-27T00:00:00',
    tzid: 'Europe/Berlin',
    count: 6,
  },

  // --- Australia/Lord_Howe (30-minute DST) ---------------------------------
  // Spring: first Sunday in October (+10:30 -> +11:00)
  // 2024: October 6
  {
    id: 'dst-lord-howe-spring-daily',
    label: 'DST: Australia/Lord_Howe spring 2024 (30-min shift), daily',
    rrule: 'FREQ=DAILY;COUNT=5',
    dtstart: '2024-10-04T02:00:00',
    tzid: 'Australia/Lord_Howe',
    count: 5,
  },
  // Fall: first Sunday in April (+11:00 -> +10:30)
  // 2024: April 7
  {
    id: 'dst-lord-howe-fall-daily',
    label: 'DST: Australia/Lord_Howe fall 2024 (30-min shift), daily',
    rrule: 'FREQ=DAILY;COUNT=5',
    dtstart: '2024-04-05T02:00:00',
    tzid: 'Australia/Lord_Howe',
    count: 5,
  },

  // --- Pacific/Apia (date-line, UTC+13/+14) --------------------------------
  // Samoa skipped Dec 29-31, 2011 (date-line crossing event); 2024 DST:
  // Spring: last Sunday of September (Oct side of new year: ~Sep 29, 2024)
  {
    id: 'dst-apia-spring-daily',
    label: 'DST: Pacific/Apia spring 2024, daily crossing fold',
    rrule: 'FREQ=DAILY;COUNT=7',
    dtstart: '2024-09-27T02:00:00',
    tzid: 'Pacific/Apia',
    count: 7,
  },
  {
    id: 'dst-apia-weekly',
    label: 'DST: Pacific/Apia weekly, 5 occurrences',
    rrule: 'FREQ=WEEKLY;COUNT=5',
    dtstart: '2024-09-20T10:00:00',
    tzid: 'Pacific/Apia',
    count: 5,
  },
]
