# rrule-ts

[![npm](https://img.shields.io/npm/v/rrule-ts.svg)](https://npmjs.com/package/rrule-ts)
[![CI](https://github.com/codewithagents/rrule/actions/workflows/ci.yml/badge.svg)](https://github.com/codewithagents/rrule/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/codewithagents/rrule/graph/badge.svg?flag=rrule-ts)](https://codecov.io/gh/codewithagents/rrule)

**RFC 5545 RRULE parser, validator, stringifier, and expander. Temporal-native, zero runtime dependencies.**

---

## Why another RRULE library?

Existing libraries like `rrule` and `rrule-temporal` share a common limitation: they rely on
`Date`, moment.js, or custom date math, which means daylight-saving-time transitions, leap
seconds, and non-Gregorian calendars require workarounds. `rrule-ts` is built from scratch on
the TC39 Temporal proposal, the modern, correct datetime API now shipping in Node.js 26 and
modern browsers.

Key differentiators vs the alternatives:

| | `rrule-ts` | `rrule` | `rrule-temporal` |
|---|---|---|---|
| Temporal-native | Yes | No | Partial |
| Zero runtime dependencies | Yes | No | No |
| TypeScript-first | Yes | Types via @types | Yes |
| Differential conformance suite | Yes (planned) | No | No |
| Strict RFC 5545 validation | Yes | Partial | Partial |
| Subpath tree-shaking | Yes | No | No |

---

## Packages

| Package | Description |
|---|---|
| [`rrule-ts`](./packages/rrule-ts) | Core: parse, validate, stringify, expand, iterate, RRuleSet |

---

## Philosophy

- **Zero runtime dependencies.** The library reads `globalThis.Temporal` when available
  (Node >= 26, modern browsers) and falls back to any Temporal implementation injected
  via `setTemporal()`. No polyfill is bundled, keeping library size near zero.
- **Strict by default.** Parse returns a typed `Result`, never throws on user input.
  Validation reports all errors with stable rule IDs, not just the first.
- **Tree-shakeable subpaths.** Human-readable text rendering and locale packs live in
  separate subpaths (`rrule-ts/text`, `rrule-ts/locales/en`) so bundles only pay for
  what they import.
- **Differential conformance.** A conformance test harness comparing this library against
  a reference Python `dateutil.rrule` implementation is planned for the expansion phase.

---

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

On Node.js >= 26, `globalThis.Temporal` is used automatically.

---

## Quick start

```ts
import { parse, validate, stringify } from 'rrule-ts'

const result = parse('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=10')
if (!result.ok) {
  console.error(result.error)
  process.exit(1)
}

const validation = validate(result.value)
if (!validation.ok) {
  for (const e of validation.error) {
    console.error(`${e.ruleId}: ${e.message}`)
  }
  process.exit(1)
}

console.log(stringify(validation.value))
// RRULE:FREQ=WEEKLY;COUNT=10;BYDAY=MO,WE,FR
```

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Security

See [SECURITY.md](./SECURITY.md).

## Sponsors

Development is supported through [GitHub Sponsors](https://github.com/sponsors/codewithagents).

## License

MIT. See [LICENSE](./LICENSE).
