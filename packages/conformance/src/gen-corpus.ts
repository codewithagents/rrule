#!/usr/bin/env node
// Corpus generation tool for rrule-ts conformance harness.
//
// Usage: pnpm gen:corpus [--count N]
//
// What it does:
//   1. Samples N random valid RRULE cases from the fast-check generator
//   2. Combines them with the hardcoded RFC §3.8.5.3 + DST seed cases
//   3. Sends all cases to the Python dateutil oracle
//   4. Writes the result to corpus/corpus.json
//
// The Python oracle must be installed beforehand:
//   pip install -r oracle/requirements.txt
//
// The generated corpus is committed to the repo so CI is hermetic (no Python
// needed to run the diff tests — only needed to regenerate the corpus).

import { execSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { sampleCases } from './generator.js'
import { seededCases } from './seeded-cases.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkgRoot = resolve(__dirname, '..')

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const countIdx = args.indexOf('--count')
const generatedCount = countIdx !== -1 ? parseInt(args[countIdx + 1], 10) : 150

// ---------------------------------------------------------------------------
// Step 1: generate random cases
// ---------------------------------------------------------------------------

console.log(`Sampling ${generatedCount} random RRULE cases (seed=1337)...`)
const generatedCases = sampleCases(generatedCount, 1337)
console.log(`  Got ${generatedCases.length} valid cases after validate() filtering.`)

// ---------------------------------------------------------------------------
// Step 2: combine with seeded cases and de-duplicate ids
// ---------------------------------------------------------------------------

const allCases = [...seededCases, ...generatedCases]
console.log(`Total cases to send to oracle: ${allCases.length}`)

// ---------------------------------------------------------------------------
// Step 3: run the Python oracle
// ---------------------------------------------------------------------------

const oraclePath = resolve(pkgRoot, 'oracle', 'dateutil_oracle.py')
const inputJson = JSON.stringify(allCases)

console.log('Running dateutil oracle...')

function runOracle(oraclePath: string, inputJson: string): string {
  try {
    return execSync(`python3 "${oraclePath}"`, {
      input: inputJson,
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024, // 50 MB
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Oracle failed:', msg)
    process.exit(1)
  }
}

const oracleOutput = runOracle(oraclePath, inputJson)

const oracleResults: Array<{
  id: string
  occurrences: string[]
  error: string | null
}> = JSON.parse(oracleOutput)

// ---------------------------------------------------------------------------
// Step 4: merge oracle results back into corpus entries
// ---------------------------------------------------------------------------

const resultById = new Map(oracleResults.map((r) => [r.id, r]))

interface CorpusCase {
  id: string
  label: string
  rrule: string
  dtstart: string
  tzid: string | null
  count: number
  expectedOccurrences: string[]
}

const corpusCases: CorpusCase[] = []
let errorCount = 0

for (const input of allCases) {
  const result = resultById.get(input.id)
  if (!result) {
    console.warn(`  Warning: no oracle result for case "${input.id}"`)
    continue
  }
  if (result.error !== null) {
    console.warn(`  Oracle error for "${input.id}": ${result.error}`)
    errorCount++
    continue
  }
  if (result.occurrences.length === 0) {
    console.warn(`  Skipping "${input.id}": oracle returned 0 occurrences`)
    continue
  }
  corpusCases.push({
    id: input.id,
    label: input.label,
    rrule: input.rrule,
    dtstart: input.dtstart,
    tzid: input.tzid,
    count: input.count,
    expectedOccurrences: result.occurrences,
  })
}

console.log(`Oracle results: ${corpusCases.length} ok, ${errorCount} errors (errors are skipped).`)

if (corpusCases.length === 0) {
  console.error('No corpus cases produced — something went wrong.')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Step 5: write corpus file
// ---------------------------------------------------------------------------

const corpusDir = resolve(pkgRoot, 'corpus')
mkdirSync(corpusDir, { recursive: true })

const corpus = {
  version: '1',
  oracleVersion: 'python-dateutil 2.9.0.post0',
  generatedAt: new Date().toISOString(),
  totalCases: corpusCases.length,
  cases: corpusCases,
}

const corpusPath = resolve(corpusDir, 'corpus.json')
writeFileSync(corpusPath, JSON.stringify(corpus, null, 2) + '\n', 'utf-8')

console.log(`\nCorpus written to corpus/corpus.json`)
console.log(`  Total cases: ${corpusCases.length}`)
console.log(`    RFC §3.8.5.3 seed cases: ${seededCases.length}`)
console.log(`    Generated cases:         ${generatedCases.length}`)
console.log()
console.log('Done. Commit corpus/corpus.json to make CI hermetic.')
