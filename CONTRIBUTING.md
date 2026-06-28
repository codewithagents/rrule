# Contributing

Thank you for your interest in contributing! This is a pnpm workspace monorepo. Here is everything you need to get started.

---

## Prerequisites

- **Node.js 22** (minimum) or **Node.js 26** (recommended for native Temporal). CI tests both.
- **pnpm 10.30.3** is pinned via the `packageManager` field. Run `corepack enable` so the pinned
  pnpm is used automatically, or install with `npm install -g pnpm@10.30.3`. Never use npm or
  yarn at the root.
- **TypeScript 6**, installed automatically as a devDependency.

---

## Getting started

```bash
git clone https://github.com/codewithagents/rrule.git
cd rrule
pnpm install
```

### Repository structure

```
packages/
  rrule-ts/    # Core library: parse, validate, stringify, expand, iterate, RRuleSet
.github/
  workflows/   # ci, mutation, release
```

---

## Development workflow

All of these run from the repo root.

### Run everything

```bash
pnpm -r run build      # compile all packages
pnpm -r run test       # run all unit tests
pnpm -r run lint       # type-check all packages (tsc --noEmit)
```

### Work on a single package

```bash
pnpm --filter rrule-ts test
pnpm --filter rrule-ts build
pnpm --filter rrule-ts lint
```

### Coverage

```bash
pnpm --filter rrule-ts test:coverage
```

Coverage thresholds are mandatory. Thresholds are declared in `vitest.config.ts` and gate CI.

### Format

```bash
pnpm format         # prettier --write .
pnpm format:check   # prettier --check . (as CI does)
```

---

## Commit message convention

We use [Conventional Commits](https://www.conventionalcommits.org/) with **package scopes**.

| Type | When to use |
|---|---|
| `feat(rrule-ts): ...` | New feature in rrule-ts |
| `fix(rrule-ts): ...` | Bug fix in rrule-ts |
| `chore(rrule-ts): ...` | Maintenance (deps, config, CI) |
| `docs(rrule-ts): ...` | Documentation only |
| `test(rrule-ts): ...` | Adding or fixing tests |

**Why scopes matter:** an unscoped commit (`feat: ...`) is treated as a change to ALL packages
and bumps every package version. Always scope to the package you changed.

### Breaking changes

Add `BREAKING CHANGE:` in the commit footer or `!` after the type:

```
feat(rrule-ts)!: change parse return type

BREAKING CHANGE: parse() now returns Result<RRuleOptions, string[]>.
```

---

## Pull request guidelines

- **Small and focused.** One concern per PR.
- **Tests required.** New behaviour must have tests; bug fixes must have regression tests.
- **TypeScript strict.** All code must pass `strict: true`.
- **Squash merge.** PRs are squash-merged. Write a Conventional Commit PR title.

All checks must pass before merge: CI (build, lint, test on Node 22 + 26), coverage, and mutation.

---

## Questions?

Open a [Discussion](https://github.com/codewithagents/rrule/discussions) or file an issue.
