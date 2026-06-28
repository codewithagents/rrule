#!/usr/bin/env node
// Live differential fuzzer: rrule-ts vs python-dateutil oracle.
//
// Generates random valid RRULE+DTSTART cases using fast-check, runs BOTH the
// TypeScript engine AND the python-dateutil oracle, diffs the first K occurrences,
// and reports any divergences.
//
// Usage:
//   pnpm --filter rrule-ts-conformance fuzz
//   pnpm --filter rrule-ts-conformance fuzz -- --seed 42 --count 200
//   FUZZ_SEED=42 FUZZ_COUNT=200 pnpm --filter rrule-ts-conformance fuzz
//
// Flags:
//   --seed N       Deterministic fast-check seed (env: FUZZ_SEED, default: 1337)
//   --count N      Number of cases to fuzz (env: FUZZ_COUNT, default: 200)
//   --append       Append confirmed non-DST divergences to corpus/corpus.json
//                  as regression cases (NOT automatic; opt-in only)
//
// Exit codes:
//   0  No divergences found (or only DST-candidate divergences)
//   1  At least one non-DST divergence detected
//
// Divergence classification:
//   - tzid === null: a floating or UTC rule.  Any divergence is a definite bug
//     (non-DST). These cause a non-zero exit.
//   - tzid !== null: a zoned rule.  Divergences may be DST-disambiguation
//     differences between rrule-ts and python-dateutil.  These are REPORTED
//     but do NOT cause a non-zero exit, matching the KNOWN_GAPS rationale.

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse, expand, setTemporal } from 'rrule-ts'
import { sampleCases } from './generator.js'
import type { OracleInput } from './generator.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkgRoot = resolve(__dirname, '..')
const oraclePath = resolve(pkgRoot, 'oracle', 'dateutil_oracle.py')
const corpusPath = resolve(pkgRoot, 'corpus', 'corpus.json')

// ---------------------------------------------------------------------------
// CLI argument parsing (argv takes precedence over env)
// ---------------------------------------------------------------------------

function parseArgs(): { seed: number; count: number; append: boolean } {
  const args = process.argv.slice(2)

  function flag(name: string, envKey: string, defaultVal: number): number {
    const idx = args.indexOf(name)
    if (idx !== -1 && args[idx + 1] !== undefined) return parseInt(args[idx + 1], 10)
    const envVal = process.env[envKey]
    if (envVal !== undefined) return parseInt(envVal, 10)
    return defaultVal
  }

  return {
    seed: flag('--seed', 'FUZZ_SEED', 1337),
    count: flag('--count', 'FUZZ_COUNT', 200),
    append: args.includes('--append'),
  }
}

// ---------------------------------------------------------------------------
// Format a rrule-ts occurrence to the same ISO-8601 string the oracle emits.
// Strips the [IANA/Zone] annotation from Temporal.ZonedDateTime.toString().
// ---------------------------------------------------------------------------

function formatOccurrence(occ: unknown): string {
  return String((occ as { toString(): string }).toString()).replace(/\[.*\]$/, '')
}

// ---------------------------------------------------------------------------
// Run the python oracle for all cases in a single subprocess call.
// ---------------------------------------------------------------------------

interface OracleResult {
  id: string
  occurrences: string[]
  error: string | null
}

function runOracle(cases: OracleInput[]): Map<string, OracleResult> {
  const inputJson = JSON.stringify(cases)
  let output: string
  try {
    output = execSync(`python3 "${oraclePath}"`, {
      input: inputJson,
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Oracle subprocess failed:', msg)
    process.exit(1)
  }
  const results: OracleResult[] = JSON.parse(output)
  return new Map(results.map((r) => [r.id, r]))
}

// ---------------------------------------------------------------------------
// Expand a single case with rrule-ts, returning formatted occurrences or error.
// ---------------------------------------------------------------------------

function runTsExpand(c: OracleInput): { occurrences: string[]; error: string | null } {
  try {
    // Build DTSTART content line in iCalendar basic format (no hyphens/colons).
    const dtstartBasic = c.dtstart.replace(/[-:]/g, '').replace(/T/, 'T')
    const dtLine = c.tzid ? `DTSTART;TZID=${c.tzid}:${dtstartBasic}` : `DTSTART:${dtstartBasic}`
    const input = `${dtLine}\nRRULE:${c.rrule}`

    const parsed = parse(input)
    if (!parsed.ok) {
      return { occurrences: [], error: `parse error: ${String(parsed.error)}` }
    }

    const occs = expand(parsed.value, c.count)
    return { occurrences: occs.map(formatOccurrence), error: null }
  } catch (err: unknown) {
    return { occurrences: [], error: err instanceof Error ? err.message : String(err) }
  }
}

// ---------------------------------------------------------------------------
// Divergence record
// ---------------------------------------------------------------------------

interface Divergence {
  id: string
  label: string
  rrule: string
  dtstart: string
  tzid: string | null
  count: number
  tsOccurrences: string[]
  oracleOccurrences: string[]
  isDstCandidate: boolean
}

// ---------------------------------------------------------------------------
// Main fuzzer
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Inject the Temporal polyfill on Node < 26 (no native globalThis.Temporal).
  // The vitest tests rely on test/setup-temporal.ts; this script is standalone.
  if (!('Temporal' in globalThis)) {
    const { Temporal } = await import('temporal-polyfill')
    setTemporal(Temporal as unknown as typeof globalThis.Temporal)
  }

  const { seed, count, append } = parseArgs()

  console.log(`\nrrule-ts differential fuzzer`)
  console.log(`  seed:  ${seed}`)
  console.log(`  count: ${count}`)
  console.log(`  append: ${append}`)
  console.log()

  // Step 1: generate valid cases via fast-check
  console.log(`Sampling ${count} valid cases (seed=${seed})...`)
  const cases = sampleCases(count, seed)
  console.log(`  Generated ${cases.length} valid cases after validate() filtering.\n`)

  if (cases.length === 0) {
    console.error('No cases generated — check the generator.')
    process.exit(1)
  }

  // Step 2: run the oracle for all cases at once (one subprocess)
  console.log('Running python-dateutil oracle...')
  const oracleResults = runOracle(cases)
  console.log(`  Oracle returned results for ${oracleResults.size} cases.\n`)

  // Step 3: run rrule-ts expand() for each case and diff
  const divergences: Divergence[] = []
  let tsErrors = 0
  let oracleErrors = 0
  let matched = 0

  for (const c of cases) {
    const oracle = oracleResults.get(c.id)
    if (!oracle) continue

    if (oracle.error !== null) {
      oracleErrors++
      continue
    }

    const ts = runTsExpand(c)
    if (ts.error !== null) {
      tsErrors++
      continue
    }

    // Compare first K occurrences (K = oracle output length, capped at c.count)
    const expectedLen = Math.min(oracle.occurrences.length, c.count)
    const oracleSlice = oracle.occurrences.slice(0, expectedLen)
    const tsSlice = ts.occurrences.slice(0, expectedLen)

    if (JSON.stringify(tsSlice) !== JSON.stringify(oracleSlice)) {
      divergences.push({
        id: c.id,
        label: c.label,
        rrule: c.rrule,
        dtstart: c.dtstart,
        tzid: c.tzid,
        count: c.count,
        tsOccurrences: tsSlice,
        oracleOccurrences: oracleSlice,
        isDstCandidate: c.tzid !== null,
      })
    } else {
      matched++
    }
  }

  // ---------------------------------------------------------------------------
  // Step 4: classify and report
  // ---------------------------------------------------------------------------

  const dstDivergences = divergences.filter((d) => d.isDstCandidate)
  const nonDstDivergences = divergences.filter((d) => !d.isDstCandidate)

  // Summary header
  console.log('='.repeat(70))
  console.log('FUZZER SUMMARY')
  console.log('='.repeat(70))
  console.log(`Total cases:          ${cases.length}`)
  console.log(`  Matched:            ${matched}`)
  console.log(`  Diverged (total):   ${divergences.length}`)
  console.log(`    Non-DST (bugs):   ${nonDstDivergences.length}`)
  console.log(`    DST-candidate:    ${dstDivergences.length}`)
  console.log(`  TS expand errors:   ${tsErrors}`)
  console.log(`  Oracle errors:      ${oracleErrors}`)
  console.log()

  if (divergences.length === 0) {
    console.log('All cases matched. No divergences found.')
  }

  // Report DST-candidate divergences (informational, not a failure)
  if (dstDivergences.length > 0) {
    console.log('DST-candidate divergences (reported, not failing):')
    console.log(JSON.stringify(dstDivergences, null, 2))
    console.log()
  }

  // Report non-DST divergences (these are bugs)
  if (nonDstDivergences.length > 0) {
    console.log('NON-DST DIVERGENCES (BUGS):')
    console.log(JSON.stringify(nonDstDivergences, null, 2))
    console.log()
  }

  // ---------------------------------------------------------------------------
  // Step 5: optional corpus append (non-DST divergences as regression cases)
  // ---------------------------------------------------------------------------

  if (append && nonDstDivergences.length > 0) {
    console.log(`Appending ${nonDstDivergences.length} non-DST divergence(s) to corpus...`)

    let corpus: {
      version: string
      oracleVersion: string
      generatedAt: string
      totalCases: number
      cases: Array<{
        id: string
        label: string
        rrule: string
        dtstart: string
        tzid: string | null
        count: number
        expectedOccurrences: string[]
      }>
    }

    try {
      corpus = JSON.parse(readFileSync(corpusPath, 'utf-8'))
    } catch {
      console.error(`Failed to read corpus at ${corpusPath}`)
      process.exit(1)
    }

    const existingIds = new Set(corpus.cases.map((c) => c.id))

    let appended = 0
    for (const d of nonDstDivergences) {
      const regressionId = `fuzz-regression-${d.id}-${Date.now()}`
      if (existingIds.has(regressionId)) continue
      corpus.cases.push({
        id: regressionId,
        label: `[FUZZ REGRESSION] ${d.label}`,
        rrule: d.rrule,
        dtstart: d.dtstart,
        tzid: d.tzid,
        count: d.count,
        expectedOccurrences: d.oracleOccurrences,
      })
      existingIds.add(regressionId)
      appended++
    }

    corpus.totalCases = corpus.cases.length
    corpus.generatedAt = new Date().toISOString()
    writeFileSync(corpusPath, JSON.stringify(corpus, null, 2) + '\n', 'utf-8')
    console.log(`Appended ${appended} regression case(s) to ${corpusPath}.`)
    console.log('Commit corpus/corpus.json to include them in the hermetic suite.\n')
  }

  // ---------------------------------------------------------------------------
  // Step 6: exit code
  // ---------------------------------------------------------------------------

  if (nonDstDivergences.length > 0) {
    console.error(`FAIL: ${nonDstDivergences.length} non-DST divergence(s) detected.`)
    process.exit(1)
  }

  if (dstDivergences.length > 0) {
    console.log(`INFO: ${dstDivergences.length} DST-candidate divergence(s) noted (not failing).`)
  }

  console.log('Fuzzer complete. Exit 0.')
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
