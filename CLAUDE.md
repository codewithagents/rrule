# rrule-ts

A modern, RFC 5545 recurrence-rule (RRULE) library for TypeScript. Temporal-native, zero runtime dependencies, fully typed, tree-shakeable. Part of the @codewithagents OSS portfolio (sibling to openapi-zod-ts), built to the same strict-lib bar.

- npm: `rrule-ts` (unscoped). GitHub repo: `codewithagents/rrule`. Local folder: `rrule-ts`.
- Headline differentiator: a public **differential conformance suite** that diffs every release against python-`dateutil`.

> Style rule: never use em dashes in code, comments, or content. Use commas, colons, or full stops.

## Development workflow (IMPORTANT)

**While `< 1.0.0`: commit STRAIGHT TO `main` and push to `origin`. No feature branches, no feature PRs.** Single-maintainer repo, velocity over ceremony until the API stabilizes. The only PR that is allowed is Release Please's automated release PR. Revisit (consider branch protection + PR review) at 1.0.0.

- Conventional Commits drive Release Please. Scope commits to the package, e.g. `feat(rrule-ts): ...`, `fix(rrule-ts): ...`. Use `test(...)`/`chore(...)`/`docs(...)` for non-releasing changes.
- Keep every commit green: `pnpm install && pnpm build && pnpm -r run lint && pnpm test && pnpm format:check`.

## Layout

- `packages/rrule-ts/` — the published library. Single package, subpath exports: `.` (core: parse/validate/stringify/expand/RRuleSet), `./text` (toText/fromText), `./locales/*` (i18n packs). Zero runtime deps: Temporal via `getTemporal()` (`globalThis.Temporal` or an injected polyfill); `temporal-polyfill` is a devDependency only.
- `packages/conformance/` — PRIVATE (unpublished) differential test harness. python-`dateutil` oracle (`oracle/`), a `fast-check` generator, and a committed hermetic JSON corpus (`corpus/corpus.json`, RFC 5545 §3.8.5.3 + DST torture cases). Diff tests are `it.todo`/`skip` until `expand()` is implemented, then flipped on.

## Toolchain

Mirrors openapi-zod-ts: pnpm workspace + `catalog:`, TS6 (`tsc` build, no bundler for the lib), Vitest v8 (coverage 85/90/90/90), Stryker (50/60/80), ESLint flat + Prettier, Release Please + npm OIDC Trusted Publishing, Dependabot, Codecov. CI matrix: Node 22 (polyfill path) + Node 26 (native Temporal).

## Releases

- 0.1.0 was a one-time MANUAL bootstrap publish (npm has no pending Trusted Publisher for a brand-new name). It has no provenance.
- After Trusted Publishing is configured (repo `rrule`, workflow `release.yml`, Publish permission), every release is automatic: merge the Release Please PR → CI publishes via OIDC with provenance. No tokens, no 2FA.
- `release-please-config.json` `bootstrap-sha` must be the FULL 40-char SHA of the last released commit (release-please does exact string equality; an abbreviated SHA silently fails to match). It is auto-ignored once the first release-please PR merges.

## Build order toward 1.0.0

0. ✅ Foundation: scaffold + parse/validate/stringify (round-trip, property-tested), Temporal accessor.
1. ✅ Differential conformance harness (this is the trust artifact; built before expansion on purpose).
2. ⬜ Core expansion: full expand-vs-limit matrix, all 7 FREQ, BYSETPOS-last, ordinal BYDAY, ISO BYWEEKNO. Flip the conformance diff tests from `todo` to real assertions.
3. ⬜ Temporal-correct DST/timezone expansion.
4. ⬜ RRuleSet (RRULE + RDATE + EXRULE + EXDATE + RECURRENCE-ID).
5. ⬜ `toText`/`fromText` + i18n locale packs.
6. ⬜ RFC 7529 RSCALE (non-Gregorian calendars).
