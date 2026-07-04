// RFC 5545 §3.8.5.3 canonical example regressions.
//
// Each test encodes one of the worked RRULE examples from the specification
// with the RFC-published expected occurrence dates as ground truth.
//
// The dates below are hand-authored from RFC 5545 §3.8.5.3 (September 1998).
// They are NOT derived from any oracle: the RFC itself is the authority.
//
// Where the RFC uses "US-Eastern" as the timezone, we use floating local time
// (no TZID, no Z suffix) because the occurrence wall-clock values are identical
// regardless of timezone, and floating arithmetic is simpler to verify.
// Where the RFC gives UTC-suffixed DTSTART values we keep the Z suffix.

import { describe, it, expect } from 'vitest'
import { parse, expand } from 'rrule-ts'

// ---------------------------------------------------------------------------
// Helper: convert Temporal occurrence to plain ISO-8601 string, stripping any
// IANA timezone annotation that Temporal.ZonedDateTime.toString() appends.
// ---------------------------------------------------------------------------

function fmt(occ: unknown): string {
  return String((occ as { toString(): string }).toString()).replace(/\[.*\]$/, '')
}

// ---------------------------------------------------------------------------
// Helper: parse a DTSTART + RRULE block and expand to at most `limit` results.
// dtstart must be in iCalendar basic format (e.g. 19970902T090000).
// ---------------------------------------------------------------------------

function run(dtLine: string, rrule: string, limit: number): string[] {
  const parsed = parse(`${dtLine}\nRRULE:${rrule}`)
  if (!parsed.ok) throw new Error(`parse failed: ${parsed.error}`)
  return expand(parsed.value, limit).map(fmt)
}

// ---------------------------------------------------------------------------
// DAILY examples
// ---------------------------------------------------------------------------

describe('RFC 5545 §3.8.5.3: DAILY', () => {
  it('daily for 10 occurrences', () => {
    // RFC: DTSTART;TZID=US-Eastern:19970902T090000 / RRULE:FREQ=DAILY;COUNT=10
    // Expected: September 2-11, 1997
    expect(run('DTSTART:19970902T090000', 'FREQ=DAILY;COUNT=10', 10)).toEqual([
      '1997-09-02T09:00:00',
      '1997-09-03T09:00:00',
      '1997-09-04T09:00:00',
      '1997-09-05T09:00:00',
      '1997-09-06T09:00:00',
      '1997-09-07T09:00:00',
      '1997-09-08T09:00:00',
      '1997-09-09T09:00:00',
      '1997-09-10T09:00:00',
      '1997-09-11T09:00:00',
    ])
  })

  it('daily until December 24, 1997 (first 10 shown)', () => {
    // RFC: DTSTART;TZID=US-Eastern:19970902T090000 / RRULE:FREQ=DAILY;UNTIL=19971224T000000Z
    // RFC lists 113 occurrences Sep 2 through Dec 23, 1997.
    // We assert the first 10 to keep the test readable.
    expect(run('DTSTART:19970902T090000Z', 'FREQ=DAILY;UNTIL=19971224T000000Z', 10)).toEqual([
      '1997-09-02T09:00:00Z',
      '1997-09-03T09:00:00Z',
      '1997-09-04T09:00:00Z',
      '1997-09-05T09:00:00Z',
      '1997-09-06T09:00:00Z',
      '1997-09-07T09:00:00Z',
      '1997-09-08T09:00:00Z',
      '1997-09-09T09:00:00Z',
      '1997-09-10T09:00:00Z',
      '1997-09-11T09:00:00Z',
    ])
  })

  it('every other day (INTERVAL=2), 10 occurrences', () => {
    // RFC: DTSTART;TZID=US-Eastern:19970902T090000 / RRULE:FREQ=DAILY;INTERVAL=2
    // Expected: Sep 2, 4, 6, 8, 10, 12, 14, 16, 18, 20
    expect(run('DTSTART:19970902T090000', 'FREQ=DAILY;INTERVAL=2', 10)).toEqual([
      '1997-09-02T09:00:00',
      '1997-09-04T09:00:00',
      '1997-09-06T09:00:00',
      '1997-09-08T09:00:00',
      '1997-09-10T09:00:00',
      '1997-09-12T09:00:00',
      '1997-09-14T09:00:00',
      '1997-09-16T09:00:00',
      '1997-09-18T09:00:00',
      '1997-09-20T09:00:00',
    ])
  })

  it('every 10 days for 5 occurrences (INTERVAL=10;COUNT=5)', () => {
    // RFC: DTSTART;TZID=US-Eastern:19970902T090000 / RRULE:FREQ=DAILY;INTERVAL=10;COUNT=5
    // Expected: Sep 2, 12, 22, Oct 2, 12
    expect(run('DTSTART:19970902T090000', 'FREQ=DAILY;INTERVAL=10;COUNT=5', 5)).toEqual([
      '1997-09-02T09:00:00',
      '1997-09-12T09:00:00',
      '1997-09-22T09:00:00',
      '1997-10-02T09:00:00',
      '1997-10-12T09:00:00',
    ])
  })
})

// ---------------------------------------------------------------------------
// WEEKLY examples
// ---------------------------------------------------------------------------

describe('RFC 5545 §3.8.5.3: WEEKLY', () => {
  it('weekly for 10 occurrences', () => {
    // RFC: DTSTART;TZID=US-Eastern:19970902T090000 / RRULE:FREQ=WEEKLY;COUNT=10
    // Expected: Sep 2, 9, 16, 23, 30, Oct 7, 14, 21, 28, Nov 4
    expect(run('DTSTART:19970902T090000', 'FREQ=WEEKLY;COUNT=10', 10)).toEqual([
      '1997-09-02T09:00:00',
      '1997-09-09T09:00:00',
      '1997-09-16T09:00:00',
      '1997-09-23T09:00:00',
      '1997-09-30T09:00:00',
      '1997-10-07T09:00:00',
      '1997-10-14T09:00:00',
      '1997-10-21T09:00:00',
      '1997-10-28T09:00:00',
      '1997-11-04T09:00:00',
    ])
  })

  it('weekly until December 24, 1997', () => {
    // RFC: DTSTART;TZID=US-Eastern:19970902T090000 / RRULE:FREQ=WEEKLY;UNTIL=19971224T000000Z
    // Expected: Sep 2 through Dec 23 (17 occurrences, all Tuesdays from Tue start... wait
    // Sep 2, 1997 is a Tuesday. Weekly from a Tuesday advances by 7 days each time.
    // RFC lists 17 occurrences through Dec 23.
    expect(run('DTSTART:19970902T090000Z', 'FREQ=WEEKLY;UNTIL=19971224T000000Z', 20)).toEqual([
      '1997-09-02T09:00:00Z',
      '1997-09-09T09:00:00Z',
      '1997-09-16T09:00:00Z',
      '1997-09-23T09:00:00Z',
      '1997-09-30T09:00:00Z',
      '1997-10-07T09:00:00Z',
      '1997-10-14T09:00:00Z',
      '1997-10-21T09:00:00Z',
      '1997-10-28T09:00:00Z',
      '1997-11-04T09:00:00Z',
      '1997-11-11T09:00:00Z',
      '1997-11-18T09:00:00Z',
      '1997-11-25T09:00:00Z',
      '1997-12-02T09:00:00Z',
      '1997-12-09T09:00:00Z',
      '1997-12-16T09:00:00Z',
      '1997-12-23T09:00:00Z',
    ])
  })

  it('every other week (INTERVAL=2;WKST=SU), 10 occurrences', () => {
    // RFC: DTSTART;TZID=US-Eastern:19970902T090000 / RRULE:FREQ=WEEKLY;INTERVAL=2;WKST=SU
    // Sep 2 is Tuesday. Bi-weekly Tuesdays: Sep 2, 16, 30, Oct 14, 28, Nov 11, 25, Dec 9, 23, Jan 6
    expect(run('DTSTART:19970902T090000', 'FREQ=WEEKLY;INTERVAL=2;WKST=SU', 10)).toEqual([
      '1997-09-02T09:00:00',
      '1997-09-16T09:00:00',
      '1997-09-30T09:00:00',
      '1997-10-14T09:00:00',
      '1997-10-28T09:00:00',
      '1997-11-11T09:00:00',
      '1997-11-25T09:00:00',
      '1997-12-09T09:00:00',
      '1997-12-23T09:00:00',
      '1998-01-06T09:00:00',
    ])
  })

  it('weekly on TU and TH until October 7, 1997', () => {
    // RFC: DTSTART;TZID=US-Eastern:19970902T090000
    //      RRULE:FREQ=WEEKLY;UNTIL=19971007T000000Z;WKST=SU;BYDAY=TU,TH
    // Expected: Sep 2(TU), 4(TH), 9(TU), 11(TH), 16(TU), 18(TH), 23(TU), 25(TH), 30(TU), Oct 2(TH)
    // Oct 7 is TU - UNTIL is exclusive at 00:00Z so Oct 7 at 09:00Z does NOT qualify.
    expect(
      run(
        'DTSTART:19970902T090000Z',
        'FREQ=WEEKLY;UNTIL=19971007T000000Z;WKST=SU;BYDAY=TU,TH',
        15,
      ),
    ).toEqual([
      '1997-09-02T09:00:00Z',
      '1997-09-04T09:00:00Z',
      '1997-09-09T09:00:00Z',
      '1997-09-11T09:00:00Z',
      '1997-09-16T09:00:00Z',
      '1997-09-18T09:00:00Z',
      '1997-09-23T09:00:00Z',
      '1997-09-25T09:00:00Z',
      '1997-09-30T09:00:00Z',
      '1997-10-02T09:00:00Z',
    ])
  })

  it('every other week on MO, WE, FR for 8 occurrences (WKST=SU)', () => {
    // RFC: DTSTART;TZID=US-Eastern:19970903T090000
    //      RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=8;WKST=SU;BYDAY=MO,WE,FR
    // DTSTART=Sep 3, 1997 (Wednesday). Week starts Sunday.
    // Week of Aug 31 (SU-start): MO=Sep 1 (before DTSTART), WE=Sep 3, FR=Sep 5
    // Skip week of Sep 8.
    // Week of Sep 15: MO=Sep 15, WE=Sep 17, FR=Sep 19
    // Skip week of Sep 22.
    // Week of Sep 29: MO=Sep 29, WE=Oct 1, FR=Oct 3
    // Result: Sep 3, 5, 15, 17, 19, 29, Oct 1, 3
    expect(
      run(
        'DTSTART:19970903T090000',
        'FREQ=WEEKLY;INTERVAL=2;COUNT=8;WKST=SU;BYDAY=MO,WE,FR',
        8,
      ),
    ).toEqual([
      '1997-09-03T09:00:00',
      '1997-09-05T09:00:00',
      '1997-09-15T09:00:00',
      '1997-09-17T09:00:00',
      '1997-09-19T09:00:00',
      '1997-09-29T09:00:00',
      '1997-10-01T09:00:00',
      '1997-10-03T09:00:00',
    ])
  })
})

// ---------------------------------------------------------------------------
// MONTHLY examples
// ---------------------------------------------------------------------------

describe('RFC 5545 §3.8.5.3: MONTHLY', () => {
  it('monthly on 1st Friday for 10 occurrences (1FR)', () => {
    // RFC: DTSTART;TZID=US-Eastern:19970905T090000 / RRULE:FREQ=MONTHLY;COUNT=10;BYDAY=1FR
    // Sep 5/97 is the first Friday of September. Oct 3, Nov 7, Dec 5, Jan 2/98...
    expect(run('DTSTART:19970905T090000', 'FREQ=MONTHLY;COUNT=10;BYDAY=1FR', 10)).toEqual([
      '1997-09-05T09:00:00',
      '1997-10-03T09:00:00',
      '1997-11-07T09:00:00',
      '1997-12-05T09:00:00',
      '1998-01-02T09:00:00',
      '1998-02-06T09:00:00',
      '1998-03-06T09:00:00',
      '1998-04-03T09:00:00',
      '1998-05-01T09:00:00',
      '1998-06-05T09:00:00',
    ])
  })

  it('monthly on 1st and last day of month for 10 occurrences (BYMONTHDAY=1,-1)', () => {
    // RFC: DTSTART;TZID=US-Eastern:19970930T090000
    //      RRULE:FREQ=MONTHLY;COUNT=10;BYMONTHDAY=1,-1
    // Sep 30 (last day of Sep), Oct 1, Oct 31, Nov 1, Nov 30, Dec 1, Dec 31, Jan 1/98, Jan 31, Feb 1
    expect(
      run('DTSTART:19970930T090000Z', 'FREQ=MONTHLY;COUNT=10;BYMONTHDAY=1,-1', 10),
    ).toEqual([
      '1997-09-30T09:00:00Z',
      '1997-10-01T09:00:00Z',
      '1997-10-31T09:00:00Z',
      '1997-11-01T09:00:00Z',
      '1997-11-30T09:00:00Z',
      '1997-12-01T09:00:00Z',
      '1997-12-31T09:00:00Z',
      '1998-01-01T09:00:00Z',
      '1998-01-31T09:00:00Z',
      '1998-02-01T09:00:00Z',
    ])
  })

  it('every 18 months on days 10-15 for 10 occurrences', () => {
    // RFC: DTSTART;TZID=US-Eastern:19970910T090000
    //      RRULE:FREQ=MONTHLY;INTERVAL=18;COUNT=10;BYMONTHDAY=10,11,12,13,14,15
    // Sep 1997: Sep 10-15 (6 occurrences). Next cycle = Mar 1999: Mar 10-15 (4 more = 10 total).
    expect(
      run(
        'DTSTART:19970910T090000Z',
        'FREQ=MONTHLY;INTERVAL=18;COUNT=10;BYMONTHDAY=10,11,12,13,14,15',
        10,
      ),
    ).toEqual([
      '1997-09-10T09:00:00Z',
      '1997-09-11T09:00:00Z',
      '1997-09-12T09:00:00Z',
      '1997-09-13T09:00:00Z',
      '1997-09-14T09:00:00Z',
      '1997-09-15T09:00:00Z',
      '1999-03-10T09:00:00Z',
      '1999-03-11T09:00:00Z',
      '1999-03-12T09:00:00Z',
      '1999-03-13T09:00:00Z',
    ])
  })

  it('every other month on all Tuesdays for 10 occurrences (INTERVAL=2;BYDAY=TU)', () => {
    // RFC: DTSTART;TZID=US-Eastern:19970902T090000
    //      RRULE:FREQ=MONTHLY;INTERVAL=2;COUNT=10;BYDAY=TU
    // Sep 1997 Tuesdays: 2, 9, 16, 23, 30 (5 occ). Nov 1997 Tuesdays: 4, 11, 18, 25 (4 occ).
    // Jan 1998: 6 (1 occ, total=10).
    expect(
      run('DTSTART:19970902T090000Z', 'FREQ=MONTHLY;INTERVAL=2;COUNT=10;BYDAY=TU', 10),
    ).toEqual([
      '1997-09-02T09:00:00Z',
      '1997-09-09T09:00:00Z',
      '1997-09-16T09:00:00Z',
      '1997-09-23T09:00:00Z',
      '1997-09-30T09:00:00Z',
      '1997-11-04T09:00:00Z',
      '1997-11-11T09:00:00Z',
      '1997-11-18T09:00:00Z',
      '1997-11-25T09:00:00Z',
      '1998-01-06T09:00:00Z',
    ])
  })

  it('last Thursday of the month for 10 occurrences (BYSETPOS=-1;BYDAY=TH)', () => {
    // RFC: DTSTART;TZID=US-Eastern:19970929T090000
    //      RRULE:FREQ=MONTHLY;COUNT=10;BYDAY=TH;BYSETPOS=-1
    // DTSTART=Sep 29. The last Thursday of Sep 1997 is Sep 25 (before DTSTART), so
    // expansion starts from Oct 1997. Last Thursday of each month:
    // Oct=30, Nov=27, Dec=25, Jan/98=29, Feb=26, Mar=26, Apr=30, May=28, Jun=25, Jul=30
    expect(
      run('DTSTART:19970929T090000Z', 'FREQ=MONTHLY;COUNT=10;BYDAY=TH;BYSETPOS=-1', 10),
    ).toEqual([
      '1997-10-30T09:00:00Z',
      '1997-11-27T09:00:00Z',
      '1997-12-25T09:00:00Z',
      '1998-01-29T09:00:00Z',
      '1998-02-26T09:00:00Z',
      '1998-03-26T09:00:00Z',
      '1998-04-30T09:00:00Z',
      '1998-05-28T09:00:00Z',
      '1998-06-25T09:00:00Z',
      '1998-07-30T09:00:00Z',
    ])
  })

  it('Friday the 13th for 10 occurrences (BYDAY=FR;BYMONTHDAY=13)', () => {
    // RFC: DTSTART;TZID=US-Eastern:19970902T090000
    //      RRULE:FREQ=MONTHLY;COUNT=10;BYDAY=FR;BYMONTHDAY=13
    // Next Friday 13th after Sep 2, 1997:
    // Feb 13/98, Mar 13, Nov 13, Aug 13/99, Oct 13/00, Apr 13/01, Jul 13, Sep 13/02, Dec 13, Jun 13/03
    expect(
      run('DTSTART:19970902T090000Z', 'FREQ=MONTHLY;COUNT=10;BYDAY=FR;BYMONTHDAY=13', 10),
    ).toEqual([
      '1998-02-13T09:00:00Z',
      '1998-03-13T09:00:00Z',
      '1998-11-13T09:00:00Z',
      '1999-08-13T09:00:00Z',
      '2000-10-13T09:00:00Z',
      '2001-04-13T09:00:00Z',
      '2001-07-13T09:00:00Z',
      '2002-09-13T09:00:00Z',
      '2002-12-13T09:00:00Z',
      '2003-06-13T09:00:00Z',
    ])
  })

  it('first Saturday after first Sunday of month for 10 occurrences (SA;BYMONTHDAY=7-13)', () => {
    // RFC: DTSTART;TZID=US-Eastern:19970913T090000
    //      RRULE:FREQ=MONTHLY;COUNT=10;BYDAY=SA;BYMONTHDAY=7,8,9,10,11,12,13
    // Saturdays falling on days 7-13: Sep 13/97, Oct 11, Nov 8, Dec 13, Jan 10/98,
    // Feb 7, Mar 7, Apr 11, May 9, Jun 13
    expect(
      run(
        'DTSTART:19970913T090000Z',
        'FREQ=MONTHLY;COUNT=10;BYDAY=SA;BYMONTHDAY=7,8,9,10,11,12,13',
        10,
      ),
    ).toEqual([
      '1997-09-13T09:00:00Z',
      '1997-10-11T09:00:00Z',
      '1997-11-08T09:00:00Z',
      '1997-12-13T09:00:00Z',
      '1998-01-10T09:00:00Z',
      '1998-02-07T09:00:00Z',
      '1998-03-07T09:00:00Z',
      '1998-04-11T09:00:00Z',
      '1998-05-09T09:00:00Z',
      '1998-06-13T09:00:00Z',
    ])
  })

  it('second-to-last Monday of month for 6 occurrences (-2MO)', () => {
    // RFC: DTSTART;TZID=US-Eastern:19970922T090000 / RRULE:FREQ=MONTHLY;COUNT=6;BYDAY=-2MO
    // Sep 1997 Mondays: 1, 8, 15, 22, 29 -> 2nd-to-last = 22
    // Oct: 6, 13, 20, 27 -> 20. Nov: 3, 10, 17, 24 -> 17. Dec: 1, 8, 15, 22, 29 -> 22.
    // Jan/98: 5, 12, 19, 26 -> 19. Feb: 2, 9, 16, 23 -> 16.
    expect(run('DTSTART:19970922T090000Z', 'FREQ=MONTHLY;COUNT=6;BYDAY=-2MO', 6)).toEqual([
      '1997-09-22T09:00:00Z',
      '1997-10-20T09:00:00Z',
      '1997-11-17T09:00:00Z',
      '1997-12-22T09:00:00Z',
      '1998-01-19T09:00:00Z',
      '1998-02-16T09:00:00Z',
    ])
  })

  it('third TU/WE/TH in month for 3 months (BYSETPOS=3;BYDAY=TU,WE,TH)', () => {
    // RFC: DTSTART;TZID=US-Eastern:19970904T090000
    //      RRULE:FREQ=MONTHLY;COUNT=3;BYDAY=TU,WE,TH;BYSETPOS=3
    // Sep 1997 TU/WE/TH: 2(TU), 3(WE), 4(TH), 9, 10, 11... 3rd = Sep 4 (TH)
    // Oct 1997: 1(WE), 2(TH), 7(TU)... 3rd = Oct 7 (TU? wait: 1=WE,2=TH,7=TU -> 3rd=TU=7) -> Oct 7
    // Nov 1997: 4(TU), 5(WE), 6(TH)... 3rd = Nov 6 (TH)
    expect(
      run('DTSTART:19970904T090000Z', 'FREQ=MONTHLY;COUNT=3;BYDAY=TU,WE,TH;BYSETPOS=3', 3),
    ).toEqual(['1997-09-04T09:00:00Z', '1997-10-07T09:00:00Z', '1997-11-06T09:00:00Z'])
  })

  it('second-to-last weekday of month for 7 months (BYSETPOS=-2;BYDAY=MO-FR)', () => {
    // RFC: DTSTART;TZID=US-Eastern:19970929T090000
    //      RRULE:FREQ=MONTHLY;COUNT=7;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-2
    // The 2nd-to-last weekday of each month (penultimate business day).
    // Sep 1997: last weekday=Sep 30(TU), 2nd-to-last=Sep 29(MO)
    // Oct: last=Oct 31(FR), 2nd-to-last=Oct 30(TH)
    // Nov: last=Nov 28(FR), 2nd-to-last=Nov 27(TH)
    // Dec: last=Dec 31(WE), 2nd-to-last=Dec 30(TU)
    // Jan/98: last=Jan 30(FR), 2nd-to-last=Jan 29(TH)
    // Feb: last=Feb 27(FR), 2nd-to-last=Feb 26(TH)
    // Mar: last=Mar 31(TU), 2nd-to-last=Mar 30(MO)
    expect(
      run(
        'DTSTART:19970929T090000Z',
        'FREQ=MONTHLY;COUNT=7;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-2',
        7,
      ),
    ).toEqual([
      '1997-09-29T09:00:00Z',
      '1997-10-30T09:00:00Z',
      '1997-11-27T09:00:00Z',
      '1997-12-30T09:00:00Z',
      '1998-01-29T09:00:00Z',
      '1998-02-26T09:00:00Z',
      '1998-03-30T09:00:00Z',
    ])
  })
})

// ---------------------------------------------------------------------------
// YEARLY examples
// ---------------------------------------------------------------------------

describe('RFC 5545 §3.8.5.3: YEARLY', () => {
  it('every June and July for 10 occurrences (BYMONTH=6,7)', () => {
    // RFC: DTSTART;TZID=US-Eastern:19970610T090000
    //      RRULE:FREQ=YEARLY;COUNT=10;BYMONTH=6,7
    // Jun 10 and Jul 10 each year, 5 years: 1997-2001
    expect(run('DTSTART:19970610T090000Z', 'FREQ=YEARLY;COUNT=10;BYMONTH=6,7', 10)).toEqual([
      '1997-06-10T09:00:00Z',
      '1997-07-10T09:00:00Z',
      '1998-06-10T09:00:00Z',
      '1998-07-10T09:00:00Z',
      '1999-06-10T09:00:00Z',
      '1999-07-10T09:00:00Z',
      '2000-06-10T09:00:00Z',
      '2000-07-10T09:00:00Z',
      '2001-06-10T09:00:00Z',
      '2001-07-10T09:00:00Z',
    ])
  })

  it('every other year in Jan, Feb, Mar for 10 occurrences (INTERVAL=2;BYMONTH=1,2,3)', () => {
    // RFC: DTSTART;TZID=US-Eastern:19970310T090000
    //      RRULE:FREQ=YEARLY;INTERVAL=2;COUNT=10;BYMONTH=1,2,3
    // 1997: Mar 10 (1). Skip 1998. 1999: Jan 10, Feb 10, Mar 10 (4). 2001: Jan, Feb, Mar (7).
    // 2003: Jan, Feb, Mar (10).
    expect(
      run('DTSTART:19970310T090000Z', 'FREQ=YEARLY;INTERVAL=2;COUNT=10;BYMONTH=1,2,3', 10),
    ).toEqual([
      '1997-03-10T09:00:00Z',
      '1999-01-10T09:00:00Z',
      '1999-02-10T09:00:00Z',
      '1999-03-10T09:00:00Z',
      '2001-01-10T09:00:00Z',
      '2001-02-10T09:00:00Z',
      '2001-03-10T09:00:00Z',
      '2003-01-10T09:00:00Z',
      '2003-02-10T09:00:00Z',
      '2003-03-10T09:00:00Z',
    ])
  })

  it('every 3rd year on days 1, 100, and 200 for 10 occurrences (BYYEARDAY)', () => {
    // RFC: DTSTART;TZID=US-Eastern:19970101T090000
    //      RRULE:FREQ=YEARLY;INTERVAL=3;COUNT=10;BYYEARDAY=1,100,200
    // 1997: Jan 1, Apr 10 (day 100), Jul 19 (day 200). 2000: Jan 1, Apr 9 (leap: day 100),
    // Jul 18 (day 200). 2003: Jan 1, Apr 10, Jul 19. 2006: Jan 1 (10th).
    expect(
      run('DTSTART:19970101T090000Z', 'FREQ=YEARLY;INTERVAL=3;COUNT=10;BYYEARDAY=1,100,200', 10),
    ).toEqual([
      '1997-01-01T09:00:00Z',
      '1997-04-10T09:00:00Z',
      '1997-07-19T09:00:00Z',
      '2000-01-01T09:00:00Z',
      '2000-04-09T09:00:00Z',
      '2000-07-18T09:00:00Z',
      '2003-01-01T09:00:00Z',
      '2003-04-10T09:00:00Z',
      '2003-07-19T09:00:00Z',
      '2006-01-01T09:00:00Z',
    ])
  })

  it('every 20th Monday of the year for 10 occurrences (BYDAY=20MO)', () => {
    // RFC: DTSTART;TZID=US-Eastern:19970519T090000 / RRULE:FREQ=YEARLY;COUNT=10;BYDAY=20MO
    // The 20th Monday of each year. 1997: May 19. 1998: May 18. 1999: May 17.
    // 2000: May 15. 2001: May 14. 2002: May 20. 2003: May 19. 2004: May 17.
    // 2005: May 16. 2006: May 15.
    expect(run('DTSTART:19970519T090000Z', 'FREQ=YEARLY;COUNT=10;BYDAY=20MO', 10)).toEqual([
      '1997-05-19T09:00:00Z',
      '1998-05-18T09:00:00Z',
      '1999-05-17T09:00:00Z',
      '2000-05-15T09:00:00Z',
      '2001-05-14T09:00:00Z',
      '2002-05-20T09:00:00Z',
      '2003-05-19T09:00:00Z',
      '2004-05-17T09:00:00Z',
      '2005-05-16T09:00:00Z',
      '2006-05-15T09:00:00Z',
    ])
  })

  it('Monday of ISO week 20 each year for 10 occurrences (BYWEEKNO=20;BYDAY=MO)', () => {
    // RFC: DTSTART;TZID=US-Eastern:19970512T090000
    //      RRULE:FREQ=YEARLY;COUNT=10;BYWEEKNO=20;BYDAY=MO
    // ISO week 20 Monday of each year:
    // 1997: May 12. 1998: May 11. 1999: May 17. 2000: May 15. 2001: May 14.
    // 2002: May 13. 2003: May 12. 2004: May 10. 2005: May 16. 2006: May 15.
    expect(
      run('DTSTART:19970512T090000Z', 'FREQ=YEARLY;COUNT=10;BYWEEKNO=20;BYDAY=MO', 10),
    ).toEqual([
      '1997-05-12T09:00:00Z',
      '1998-05-11T09:00:00Z',
      '1999-05-17T09:00:00Z',
      '2000-05-15T09:00:00Z',
      '2001-05-14T09:00:00Z',
      '2002-05-13T09:00:00Z',
      '2003-05-12T09:00:00Z',
      '2004-05-10T09:00:00Z',
      '2005-05-16T09:00:00Z',
      '2006-05-15T09:00:00Z',
    ])
  })

  it('every Thursday in March for 10 occurrences (BYMONTH=3;BYDAY=TH)', () => {
    // RFC: DTSTART;TZID=US-Eastern:19970313T090000
    //      RRULE:FREQ=YEARLY;COUNT=10;BYMONTH=3;BYDAY=TH
    // Mar 1997 Thursdays: 13, 20, 27 (3). Mar 1998: 5, 12, 19, 26 (4). Mar 1999: 4, 11, 18 (3 = 10).
    expect(run('DTSTART:19970313T090000Z', 'FREQ=YEARLY;COUNT=10;BYMONTH=3;BYDAY=TH', 10)).toEqual(
      [
        '1997-03-13T09:00:00Z',
        '1997-03-20T09:00:00Z',
        '1997-03-27T09:00:00Z',
        '1998-03-05T09:00:00Z',
        '1998-03-12T09:00:00Z',
        '1998-03-19T09:00:00Z',
        '1998-03-26T09:00:00Z',
        '1999-03-04T09:00:00Z',
        '1999-03-11T09:00:00Z',
        '1999-03-18T09:00:00Z',
      ],
    )
  })

  it('US presidential election day (every 4 years, first Tue in Nov after Nov 1) for 10', () => {
    // RFC: DTSTART;TZID=US-Eastern:19961105T090000
    //      RRULE:FREQ=YEARLY;INTERVAL=4;COUNT=10;BYMONTH=11;BYDAY=TU;BYMONTHDAY=2,3,4,5,6,7,8
    // Elections: Nov 5/1996, Nov 7/2000, Nov 2/2004, Nov 4/2008, Nov 6/2012,
    //            Nov 8/2016, Nov 3/2020, Nov 5/2024, Nov 7/2028, Nov 2/2032
    expect(
      run(
        'DTSTART:19961105T090000Z',
        'FREQ=YEARLY;INTERVAL=4;COUNT=10;BYMONTH=11;BYDAY=TU;BYMONTHDAY=2,3,4,5,6,7,8',
        10,
      ),
    ).toEqual([
      '1996-11-05T09:00:00Z',
      '2000-11-07T09:00:00Z',
      '2004-11-02T09:00:00Z',
      '2008-11-04T09:00:00Z',
      '2012-11-06T09:00:00Z',
      '2016-11-08T09:00:00Z',
      '2020-11-03T09:00:00Z',
      '2024-11-05T09:00:00Z',
      '2028-11-07T09:00:00Z',
      '2032-11-02T09:00:00Z',
    ])
  })

  it('every day in January until Jan 31 2000 (UNTIL;BYMONTH=1;BYDAY=all), first 10 shown', () => {
    // RFC: DTSTART;TZID=US-Eastern:19980101T090000
    //      RRULE:FREQ=YEARLY;UNTIL=20000131T140000Z;BYMONTH=1;BYDAY=SU,MO,TU,WE,TH,FR,SA
    // Jan 1998 = all 31 days, Jan 1999 = all 31 days, Jan 2000 = all 31 days (total 93).
    // We assert the first 10 (Jan 1-10, 1998).
    expect(
      run(
        'DTSTART:19980101T090000Z',
        'FREQ=YEARLY;UNTIL=20000131T140000Z;BYMONTH=1;BYDAY=SU,MO,TU,WE,TH,FR,SA',
        10,
      ),
    ).toEqual([
      '1998-01-01T09:00:00Z',
      '1998-01-02T09:00:00Z',
      '1998-01-03T09:00:00Z',
      '1998-01-04T09:00:00Z',
      '1998-01-05T09:00:00Z',
      '1998-01-06T09:00:00Z',
      '1998-01-07T09:00:00Z',
      '1998-01-08T09:00:00Z',
      '1998-01-09T09:00:00Z',
      '1998-01-10T09:00:00Z',
    ])
  })
})

// ---------------------------------------------------------------------------
// Sub-daily examples (HOURLY / MINUTELY)
// ---------------------------------------------------------------------------

describe('RFC 5545 §3.8.5.3: sub-daily (HOURLY / MINUTELY)', () => {
  it('every 3 hours for 3 occurrences', () => {
    // RFC: DTSTART;TZID=US-Eastern:19970902T090000 / RRULE:FREQ=HOURLY;INTERVAL=3;COUNT=3
    // 09:00, 12:00, 15:00 on Sep 2, 1997
    expect(run('DTSTART:19970902T090000Z', 'FREQ=HOURLY;INTERVAL=3;COUNT=3', 3)).toEqual([
      '1997-09-02T09:00:00Z',
      '1997-09-02T12:00:00Z',
      '1997-09-02T15:00:00Z',
    ])
  })

  it('every 15 minutes for 6 occurrences', () => {
    // RFC: DTSTART;TZID=US-Eastern:19970902T090000 / RRULE:FREQ=MINUTELY;INTERVAL=15;COUNT=6
    // 09:00, 09:15, 09:30, 09:45, 10:00, 10:15 on Sep 2, 1997
    expect(run('DTSTART:19970902T090000Z', 'FREQ=MINUTELY;INTERVAL=15;COUNT=6', 6)).toEqual([
      '1997-09-02T09:00:00Z',
      '1997-09-02T09:15:00Z',
      '1997-09-02T09:30:00Z',
      '1997-09-02T09:45:00Z',
      '1997-09-02T10:00:00Z',
      '1997-09-02T10:15:00Z',
    ])
  })

  it('every 90 minutes for 4 occurrences', () => {
    // RFC: DTSTART;TZID=US-Eastern:19970902T090000 / RRULE:FREQ=MINUTELY;INTERVAL=90;COUNT=4
    // 09:00, 10:30, 12:00, 13:30 on Sep 2, 1997
    expect(run('DTSTART:19970902T090000Z', 'FREQ=MINUTELY;INTERVAL=90;COUNT=4', 4)).toEqual([
      '1997-09-02T09:00:00Z',
      '1997-09-02T10:30:00Z',
      '1997-09-02T12:00:00Z',
      '1997-09-02T13:30:00Z',
    ])
  })

  it('daily at :00, :20, :40 past hours 9-16, first 10 occurrences (BYHOUR;BYMINUTE)', () => {
    // RFC: DTSTART;TZID=US-Eastern:19970902T090000
    //      RRULE:FREQ=DAILY;BYHOUR=9,10,11,12,13,14,15,16;BYMINUTE=0,20,40
    // Sep 2, 1997: 09:00, 09:20, 09:40, 10:00, 10:20, 10:40, 11:00, 11:20, 11:40, 12:00
    expect(
      run(
        'DTSTART:19970902T090000Z',
        'FREQ=DAILY;BYHOUR=9,10,11,12,13,14,15,16;BYMINUTE=0,20,40',
        10,
      ),
    ).toEqual([
      '1997-09-02T09:00:00Z',
      '1997-09-02T09:20:00Z',
      '1997-09-02T09:40:00Z',
      '1997-09-02T10:00:00Z',
      '1997-09-02T10:20:00Z',
      '1997-09-02T10:40:00Z',
      '1997-09-02T11:00:00Z',
      '1997-09-02T11:20:00Z',
      '1997-09-02T11:40:00Z',
      '1997-09-02T12:00:00Z',
    ])
  })
})
