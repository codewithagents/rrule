# rrule-ts

Published as `rrule-ts` (unscoped, v0.1.0). RFC 5545 RRULE library: parse, validate,
stringify, and (planned) expand/iterate/RRuleSet. Temporal-native, zero runtime dependencies.

## What it does
- Parses RFC 5545 RRULE strings (including optional DTSTART/TZID content lines) into
  typed `RRuleOptions`
- Validates cross-field RFC rules (COUNT xor UNTIL, BYDAY ordinals, BY* ranges, etc.)
- Stringifies `RRuleOptions` back to canonical RRULE form with round-trip guarantee
- Exposes `getTemporal()` / `setTemporal()` for zero-dep Temporal injection

## Subpath exports
- `.` (core): parse, validate, stringify, getTemporal, setTemporal, ok/err Result helpers
- `./text`: toText/fromText (STUB, expansion phase)
- `./locales/en`, `./locales/de`: locale packs (STUB, expansion phase)

## Key decisions
- **Zero runtime deps:** library never imports a polyfill. Reads `globalThis.Temporal` if
  present (Node >= 26), else falls back to an instance injected via `setTemporal()`.
- **Stubs excluded from coverage:** `src/text/` and `src/locales/` are excluded from
  vitest coverage `include` and stryker `mutate` until the expansion phase.
- **Module resolution:** overrides base tsconfig to `NodeNext` so plain `tsc` emits
  valid Node.js ESM with explicit `.js` import extensions.
- **Round-trip guarantee:** `parse(stringify(x))` deep-equals `x` for all valid x.
  DTSTART/TZID are included in stringify output when present.
- **Result type:** `{ ok: true, value }` or `{ ok: false, error }`. Never throws on user input.

## Test / build
```
pnpm test           # vitest run
pnpm test:coverage  # vitest run --coverage (thresholds gate in vitest.config.ts)
pnpm build          # tsc -p tsconfig.build.json
pnpm lint           # tsc --noEmit
```

## Expansion phase (NOT this PR)
- `expand(options, limit?)`: generate occurrence list
- `iterate(options)`: async iterator over occurrences
- `RRuleSet`: combine multiple RRULEs, EXRULEs, RDATEs, EXDATEs
- `toText` / `fromText`: human-readable representation
- Locale packs (en, de)
- Python conformance harness
