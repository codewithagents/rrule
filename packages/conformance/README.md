# rrule-ts-conformance

Differential conformance harness for `rrule-ts`. Compares rrule-ts `expand()`
output against python-dateutil 2.9.0.post0 as the ground-truth oracle.

This is a private, unpublished workspace package. It is not released to npm.

## What is in here

```
oracle/
  dateutil_oracle.py    Python oracle: reads JSON cases, returns expected occurrences
  requirements.txt      Pin: python-dateutil==2.9.0.post0

src/
  generator.ts          fast-check based generator for valid RRULE + DTSTART cases
  seeded-cases.ts       Hardcoded RFC 5545 §3.8.5.3 examples + DST edge cases
  gen-corpus.ts         Script: runs generator + oracle, writes corpus/corpus.json
  diff.test.ts          Vitest suite: sanity checks (active) + diff assertions (todo)

corpus/
  corpus.json           Committed generated corpus (hermetic CI, no Python needed)
```

## Running the tests

The committed corpus makes tests hermetic. No Python required:

```sh
pnpm test   # from repo root, or:
cd packages/conformance && pnpm test
```

Active tests verify the corpus is well-formed. Diff assertions are `it.todo`
or inside `describe.skip` until `expand()` is implemented (expansion phase).

## Regenerating the corpus

Regenerate when you change the seed cases, the generator, or want a fresh
random sample. Python and dateutil must be available:

```sh
# One-time setup (from packages/conformance):
python3 -m venv .venv
source .venv/bin/activate      # on macOS/Linux
pip install -r oracle/requirements.txt

# Regenerate:
pnpm gen:corpus

# Or from repo root:
pnpm --filter rrule-ts-conformance gen:corpus
```

The script accepts `--count N` to control the number of randomly generated
cases (default 150):

```sh
pnpm gen:corpus --count 300
```

Always commit the resulting `corpus/corpus.json`. CI relies on the committed
file and never runs the Python oracle itself.

## Enabling diff assertions in the expansion phase

When `expand()` is implemented:

1. Open `src/diff.test.ts`.
2. Change `describe.skip(...)` to `describe(...)` on the diff block.
3. Replace the placeholder assertion inside each `it` body with the real
   parse/expand/format logic described in the TODO comment.
4. Remove the three `it.todo(...)` entries at the bottom of the file.
5. Run `pnpm test` and confirm all corpus cases pass.

## Corpus structure

`corpus/corpus.json` contains:

```json
{
  "version": "1",
  "oracleVersion": "python-dateutil 2.9.0.post0",
  "generatedAt": "...",
  "totalCases": 200,
  "cases": [
    {
      "id": "rfc-daily-count-10",
      "label": "RFC §3.8.5.3: daily for 10 occurrences",
      "rrule": "FREQ=DAILY;COUNT=10",
      "dtstart": "1997-09-02T09:00:00",
      "tzid": null,
      "count": 10,
      "expectedOccurrences": ["1997-09-02T09:00:00", ...]
    }
  ]
}
```

`expectedOccurrences` are ISO-8601 strings. Floating datetimes have no
timezone suffix; UTC datetimes end in `Z`; zoned datetimes include the UTC
offset. The expansion phase must match this format exactly.

## Seed case categories

- **RFC 5545 §3.8.5.3** (30 cases): every worked example from the specification,
  including all FREQ types, BYSETPOS, ordinal BYDAY (e.g. `-1FR`, `20MO`),
  negative BYMONTHDAY, BYYEARDAY, BYWEEKNO, and sub-day frequencies.
- **DST edge cases** (16 cases): spring-forward and fall-back transitions in:
  - `America/Los_Angeles` (1-hour standard DST)
  - `Europe/Berlin` (1-hour standard DST)
  - `Australia/Lord_Howe` (30-minute DST, unusual offset)
  - `Pacific/Apia` (date-line zone, UTC+13/+14)
- **Generated** (~150 cases): fast-check random sample covering all 7 FREQ
  values with diverse BY* combinations, validated through rrule-ts `validate()`.
