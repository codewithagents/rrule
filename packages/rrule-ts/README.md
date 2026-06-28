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

## License

MIT
