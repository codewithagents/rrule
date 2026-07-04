# rrule-ts

[![npm](https://img.shields.io/npm/v/rrule-ts.svg)](https://npmjs.com/package/rrule-ts)
[![CI](https://github.com/codewithagents/rrule/actions/workflows/ci.yml/badge.svg)](https://github.com/codewithagents/rrule/actions/workflows/ci.yml)

**RFC 5545 RRULE parser, validator, stringifier, and expander. Temporal-native, zero runtime dependencies.**

## Installation

```bash
npm install rrule-ts
```

On Node.js < 26, inject a Temporal polyfill before using date-expansion features:

```ts
import { setTemporal } from 'rrule-ts'
import { Temporal } from 'temporal-polyfill'
setTemporal(Temporal)
```

## Usage

```ts
import { parse, validate, stringify } from 'rrule-ts'

const result = parse('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=10')
if (!result.ok) throw new Error(result.error)

const validated = validate(result.value)
if (!validated.ok) {
  for (const e of validated.error) console.error(e.message)
}

console.log(stringify(result.value))
// RRULE:FREQ=WEEKLY;COUNT=10;BYDAY=MO,WE,FR
```

## Subpath exports

| Import | What you get |
|---|---|
| `rrule-ts` | parse, validate, stringify, getTemporal, setTemporal, Result helpers |
| `rrule-ts/text` | toText, fromText (human-readable; planned) |
| `rrule-ts/locales/en` | English locale pack (planned) |
| `rrule-ts/locales/de` | German locale pack (planned) |

## Timezones and DST

### Temporal and polyfill setup

rrule-ts is Temporal-native and has zero runtime dependencies. Temporal is obtained through
`getTemporal()`, which returns `globalThis.Temporal` when it is present (Node.js 26+, modern browsers
with native Temporal) and otherwise returns the implementation injected by the caller via
`setTemporal()`. If neither is available, `getTemporal()` throws a descriptive error.

On Node.js < 26 or older browsers, install a polyfill and inject it once at application startup,
before any RRULE expansion:

```ts
import { setTemporal } from 'rrule-ts'
import { Temporal } from 'temporal-polyfill'

setTemporal(Temporal)
```

### Wall-clock semantics

rrule-ts uses wall-clock semantics throughout. For DAILY and coarser frequencies (WEEKLY, MONTHLY,
YEARLY), the engine advances a `PlainDate` counter by the rule interval and pairs each date with the
same target time components (hour, minute, second) taken from the `DTSTART`. Occurrences are then
resolved to `ZonedDateTime` values by calling `Temporal.ZonedDateTime.from` with those components and
the rule's timezone. As a result, a daily 09:00 event stays at 09:00 local time before and after a
DST transition, even though the UTC offset changes.

Sub-daily frequencies (HOURLY, MINUTELY, SECONDLY) also advance using wall-clock arithmetic on the
time fields. The UTC-elapsed distance between consecutive occurrences can therefore vary across DST
boundaries.

### Fall-back (repeated hour)

When a computed local time falls in a "fall back" ambiguity (the clock is set back and a local hour
occurs twice), rrule-ts resolves the ambiguity with `disambiguation: 'compatible'`. The
`'compatible'` setting selects the earlier of the two possible instants (equivalent to fold=0 in
Python's datetime). This matches python-dateutil's fall-back behavior exactly.

### Spring-forward (skipped hour)

When a computed local time falls in the DST gap created by a spring-forward transition (a local time
that does not exist), rrule-ts again applies `disambiguation: 'compatible'`. For a skipped time,
`'compatible'` shifts the wall-clock time forward to the first valid instant after the gap. For
example, 02:30 in a zone where clocks jump from 02:00 to 03:00 is normalised to 03:30 with the
post-gap offset. Both times correspond to the same epoch milliseconds, but the ISO strings differ.

This is the one deliberate deviation from python-dateutil. When dateutil encounters a nonexistent
local time, it preserves the original wall-clock digits with the pre-gap UTC offset (e.g.
`02:30-08:00` during the Los Angeles spring-forward). The resulting ISO string describes an instant
that does not exist in the timezone. rrule-ts, via Temporal, always emits a valid instant. The
epoch milliseconds are identical between the two representations, so downstream consumers that
compare by timestamp are unaffected.

This deviation is covered by three documented conformance cases in `packages/conformance`:

| Case ID | Timezone | Description |
|---|---|---|
| `dst-la-spring-daily` | `America/Los_Angeles` | 02:30 in spring-forward gap; dateutil: `02:30-08:00`; rrule-ts: `03:30-07:00` |
| `dst-berlin-spring-daily` | `Europe/Berlin` | 02:00 in spring-forward gap; dateutil: `02:00+01:00`; rrule-ts: `03:00+02:00` |
| `dst-lord-howe-spring-daily` | `Australia/Lord_Howe` | 02:00 in 30-min gap; dateutil: `02:00+10:30`; rrule-ts: `02:30+11:00` |

## License

MIT
