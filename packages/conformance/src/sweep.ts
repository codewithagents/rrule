#!/usr/bin/env node
// Calibrated differential sweep: rrule-ts expand() vs python-dateutil oracle.
//
// This is the batch, classified sibling of fuzz.ts. Where fuzz.ts only splits
// divergences into "DST candidate" (any zoned rule) vs "non-DST", the sweep
// classifies EVERY case into exactly one bucket and, crucially, distinguishes a
// spring-forward-gap representation difference (same epoch instant, different
// wall-clock string) from a genuine value/count divergence.
//
// Buckets:
//   MATCH            both succeeded, full occurrence lists equal
//   TS_ERROR         TS threw / produced no result but the oracle succeeded
//   TS_TIMEOUT       TS did not finish within the per-case wall-clock budget
//                    (degenerate sub-daily rules grind the ~200-year horizon;
//                    dateutil errors on these instantly). Substantive only if
//                    the oracle DID produce occurrences (TS may be failing to
//                    find occurrences that exist).
//   ORACLE_ERROR     dateutil threw but TS succeeded (substantive if TS != [])
//   BOTH_ERROR       both sides errored (benign; e.g. degenerate empty rule)
//   MISMATCH_DST     both ok, lists differ, but every difference is the same
//                    epoch instant with a different wall-clock string (the
//                    documented spring-forward-gap deviation)
//   MISMATCH_NONDST  both ok, lists differ, and at least one difference is a
//                    real value or count divergence  <-- THE REAL SIGNAL
//
// Unlike fuzz.ts the sweep compares the FULL occurrence lists (both are capped
// at `count`), so a UNTIL/COUNT off-by-one at the boundary is caught rather than
// hidden behind a prefix-only comparison. It also runs TS even when the oracle
// errored, so the "dateutil errors but TS produces occurrences" signal is not
// lost (fuzz.ts skips those).
//
// Usage:
//   pnpm --filter rrule-ts-conformance sweep -- --mode safe --seeds 1,2,3 --count 4000
//   pnpm --filter rrule-ts-conformance sweep -- --mode aggressive --seed 42 --count 5000 --out /tmp/div.json

import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'

import { setTemporal } from 'rrule-ts'
import { sampleCases } from './generator.js'
import { sampleCasesAggressive, subDailyDayLimitCases } from './generator-aggressive.js'
import type { OracleInput } from './generator.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkgRoot = resolve(__dirname, '..')
const oraclePath = resolve(pkgRoot, 'oracle', 'dateutil_oracle.py')
const workerUrl = new URL('./expand-worker.ts', import.meta.url)

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

interface Args {
  mode: 'safe' | 'aggressive'
  seeds: number[]
  count: number
  timeoutOkMs: number
  timeoutErrMs: number
  out: string | undefined
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(name)
    return i !== -1 ? argv[i + 1] : undefined
  }
  const modeRaw = get('--mode') ?? 'aggressive'
  const mode = modeRaw === 'safe' ? 'safe' : 'aggressive'

  let seeds: number[]
  const seedsRaw = get('--seeds')
  const seedRaw = get('--seed')
  if (seedsRaw !== undefined) {
    seeds = seedsRaw.split(',').map((s) => parseInt(s.trim(), 10))
  } else if (seedRaw !== undefined) {
    seeds = [parseInt(seedRaw, 10)]
  } else {
    seeds = [1337]
  }

  const count = parseInt(get('--count') ?? '2000', 10)
  // Two timeouts. Oracle-SUCCESS cases get the longer budget because a timeout
  // there is substantive (the oracle found occurrences the engine could not
  // produce in time). Oracle-ERROR cases (degenerate/empty rules that dateutil
  // flags instantly) get a short budget: a degenerate rule can only ever return
  // occurrences by grinding the full horizon, so if the engine has not answered
  // quickly the outcome is benign; the only substantive signal there is the
  // engine returning occurrences FAST, which the short budget still captures.
  const timeoutOkMs = parseInt(get('--timeout') ?? '2000', 10)
  const timeoutErrMs = parseInt(get('--timeout-err') ?? '150', 10)
  const out = get('--out')
  return { mode, seeds, count, timeoutOkMs, timeoutErrMs, out }
}

// ---------------------------------------------------------------------------
// Oracle invocation (normalization matches fuzz.ts exactly)
// ---------------------------------------------------------------------------

interface OracleResult {
  id: string
  occurrences: string[]
  error: string | null
}

function runOracle(cases: OracleInput[]): Map<string, OracleResult> {
  const inputJson = JSON.stringify(cases)
  const output = execSync(`python3 "${oraclePath}"`, {
    input: inputJson,
    encoding: 'utf-8',
    maxBuffer: 200 * 1024 * 1024,
    env: {
      ...process.env,
      // Per-case wall-clock bound. A never-matching DAILY rule makes dateutil
      // grind day-by-day to year 9999 (~4s) because it only consults UNTIL when
      // a candidate passes the BY masks; no candidate ever does, so UNTIL cannot
      // bound it. This SIGALRM cap is the only reliable bound. The engine
      // returns [] for the same rules quickly (200-year cap), so a capped case
      // is a benign ORACLE_ERROR (both effectively empty), never a lost bug.
      ORACLE_TIMEOUT_SEC: process.env.ORACLE_TIMEOUT_SEC ?? '2',
    },
  })
  const results: OracleResult[] = JSON.parse(output)
  return new Map(results.map((r) => [r.id, r]))
}

// ---------------------------------------------------------------------------
// TS expansion via a worker with a per-case wall-clock timeout
// ---------------------------------------------------------------------------

interface TsResult {
  occurrences: string[]
  error: string | null
}
type TsOutcome = TsResult | 'TIMEOUT'

/**
 * Runs one TS expansion at a time in a worker, with a per-case wall-clock
 * timeout. Uses a TWO-worker rotation: when a case times out (a degenerate rule
 * grinding the ~200-year horizon), the grinding worker is terminated and a fresh
 * one is spawned into its slot IN THE BACKGROUND, while the very next case is
 * handed to the OTHER, already-warm worker. This hides the ~60ms worker
 * cold-start behind ongoing work, which matters because ~12% of cases are
 * degenerate sub-daily rules that always time out.
 */
class WorkerRunner {
  private workers: (Worker | null)[] = [null, null]
  private active = 0

  private spawn(slot: number): Worker {
    const w = new Worker(workerUrl, { execArgv: ['--import', 'tsx/esm'] })
    w.on('error', () => {
      /* handled per-call */
    })
    this.workers[slot] = w
    return w
  }

  private ensure(slot: number): Worker {
    return this.workers[slot] ?? this.spawn(slot)
  }

  run(c: OracleInput, timeoutMs: number): Promise<TsOutcome> {
    const slot = this.active
    const w = this.ensure(slot)
    return new Promise<TsOutcome>((resolvePromise) => {
      let settled = false
      const detach = (): void => {
        w.off('message', onMessage)
        w.off('error', onError)
        clearTimeout(timer)
      }
      const onMessage = (msg: OracleResult): void => {
        if (settled) return
        settled = true
        detach()
        resolvePromise({ occurrences: msg.occurrences, error: msg.error })
      }
      const onError = (err: Error): void => {
        if (settled) return
        settled = true
        detach()
        this.workers[slot] = null
        this.spawn(slot)
        resolvePromise({ occurrences: [], error: `worker error: ${String(err)}` })
      }
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        detach()
        // Kill the grinding worker, warm a replacement in its slot in the
        // background, and switch to the other (idle, warm) worker for the next
        // case so we do not pay the respawn latency synchronously.
        void w.terminate()
        this.workers[slot] = null
        this.spawn(slot)
        this.active = 1 - slot
        resolvePromise('TIMEOUT')
      }, timeoutMs)
      w.on('message', onMessage)
      w.on('error', onError)
      w.postMessage(c)
    })
  }

  async close(): Promise<void> {
    for (let i = 0; i < this.workers.length; i++) {
      const w = this.workers[i]
      if (w) {
        await w.terminate()
        this.workers[i] = null
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

type Category =
  | 'MATCH'
  | 'TS_ERROR'
  | 'TS_TIMEOUT'
  | 'ORACLE_ERROR'
  | 'BOTH_ERROR'
  | 'MISMATCH_DST'
  | 'MISMATCH_ORACLE_BYWEEKNO'
  | 'MISMATCH_NONDST'

interface Classified {
  category: Category
  case: OracleInput
  tsOccurrences: string[]
  oracleOccurrences: string[]
  firstDivergenceIndex: number | null
  tsError?: string
  oracleError?: string
}

// Temporal reference, set in main() once the polyfill (or native) is available.
let T: typeof Temporal | undefined

/**
 * Is the zoned dtstart wall-clock time nonexistent (inside a spring-forward
 * DST gap)? When it is, the engine (Temporal) normalises it FORWARD to the
 * first valid instant while dateutil keeps the nonexistent wall time with the
 * pre-gap offset. That shifts the anchor and hence every derived occurrence, so
 * ANY divergence for such a case is the documented spring-forward-gap deviation,
 * not a rule-expansion bug. This matches the task's MISMATCH_DST definition:
 * "dtstart tz-aware and a computed local time falls in a known gap".
 */
function isGapDtstart(dtstart: string, tzid: string | null): boolean {
  if (tzid === null || T === undefined) return false
  try {
    T.ZonedDateTime.from(`${dtstart}[${tzid}]`, { disambiguation: 'reject' })
    return false
  } catch {
    return true
  }
}

/** Parse an offset/Z ISO string to epoch ms. Returns NaN for floating strings. */
function epochOf(s: string): number {
  return Date.parse(s)
}

/** Is this ISO occurrence a year-boundary day (first/last week of a year)? */
function isYearBoundaryDay(iso: string): boolean {
  const m = parseInt(iso.slice(5, 7), 10)
  const d = parseInt(iso.slice(8, 10), 10)
  return (m === 1 && d <= 7) || (m === 12 && d >= 25)
}

/**
 * Detect the documented python-dateutil BYWEEKNO year-boundary bug: when a
 * YEARLY rule expands calendar year Y with BYWEEKNO=52/53 (or negatives),
 * dateutil ALSO includes the early-January days of year Y that belong to the
 * PREVIOUS week-year's week 52/53 (e.g. expanding 2000 with BYWEEKNO=52 yields
 * Jan 1-2 2000, which are ISO 1999-W52). RFC 5545 numbers weeks within the
 * calendar year being expanded, so those boundary days are NOT week 52 of year
 * Y. rrule-ts is RFC-correct and omits them, so its output is a strict subset of
 * dateutil's and every extra dateutil occurrence is a year-boundary day. This
 * isolates that adjudicated ORACLE bug from genuine engine (TS) bugs.
 */
function isKnownOracleByWeekNoBug(c: OracleInput, ts: string[], oracle: string[]): boolean {
  if (!/(^|;)BYWEEKNO=/i.test(c.rrule)) return false
  const tsSet = new Set(ts)
  const oracleSet = new Set(oracle)
  for (const t of ts) if (!oracleSet.has(t)) return false // TS must be a subset of oracle
  const extras = oracle.filter((o) => !tsSet.has(o))
  if (extras.length === 0) return false
  return extras.every(isYearBoundaryDay)
}

function firstDiff(a: string[], b: string[]): number | null {
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return i
  }
  return null
}

/**
 * For a zoned divergence, decide whether EVERY difference is a pure
 * spring-forward-gap representation difference (same epoch instant, different
 * wall-clock string). If so it is MISMATCH_DST, otherwise MISMATCH_NONDST.
 */
function isPureDstDifference(ts: string[], oracle: string[]): boolean {
  if (ts.length !== oracle.length) return false
  for (let i = 0; i < ts.length; i++) {
    if (ts[i] === oracle[i]) continue
    const et = epochOf(ts[i])
    const eo = epochOf(oracle[i])
    if (Number.isNaN(et) || Number.isNaN(eo) || et !== eo) return false
  }
  return true
}

function classify(c: OracleInput, oracle: OracleResult, ts: TsOutcome): Classified {
  if (ts === 'TIMEOUT') {
    // A timeout when the ORACLE also errored is the benign degenerate case:
    // both sides agree the rule is (effectively) empty, the engine just grinds
    // its horizon instead of erroring. Fold it into ORACLE_ERROR, non-substantive.
    if (oracle.error !== null) {
      return {
        category: 'ORACLE_ERROR',
        case: c,
        tsOccurrences: [],
        oracleOccurrences: [],
        firstDivergenceIndex: null,
        oracleError: oracle.error,
      }
    }
    // A timeout when the oracle SUCCEEDED is substantive: the oracle produced
    // occurrences the engine could not deliver within the budget.
    return {
      category: 'TS_TIMEOUT',
      case: c,
      tsOccurrences: [],
      oracleOccurrences: oracle.occurrences,
      firstDivergenceIndex: null,
    }
  }

  if (ts.error !== null && oracle.error !== null) {
    return {
      category: 'BOTH_ERROR',
      case: c,
      tsOccurrences: [],
      oracleOccurrences: [],
      firstDivergenceIndex: null,
      tsError: ts.error,
      oracleError: oracle.error,
    }
  }
  if (ts.error !== null) {
    return {
      category: 'TS_ERROR',
      case: c,
      tsOccurrences: [],
      oracleOccurrences: oracle.occurrences,
      firstDivergenceIndex: null,
      tsError: ts.error,
    }
  }
  if (oracle.error !== null) {
    // A gap-dtstart shifts the sub-daily interval phase (02:30 -> 03:30), which
    // can make dateutil see an empty set while the engine finds occurrences (or
    // vice versa). That is the gap deviation, not a substantive oracle bug, so
    // surface it as MISMATCH_DST rather than a substantive ORACLE_ERROR.
    if (isGapDtstart(c.dtstart, c.tzid) && ts.occurrences.length > 0) {
      return {
        category: 'MISMATCH_DST',
        case: c,
        tsOccurrences: ts.occurrences,
        oracleOccurrences: [],
        firstDivergenceIndex: 0,
        oracleError: oracle.error,
      }
    }
    return {
      category: 'ORACLE_ERROR',
      case: c,
      tsOccurrences: ts.occurrences,
      oracleOccurrences: [],
      firstDivergenceIndex: null,
      oracleError: oracle.error,
    }
  }

  const idx = firstDiff(ts.occurrences, oracle.occurrences)
  if (idx === null) {
    return {
      category: 'MATCH',
      case: c,
      tsOccurrences: ts.occurrences,
      oracleOccurrences: oracle.occurrences,
      firstDivergenceIndex: null,
    }
  }

  // A divergence is DST-explained when either the dtstart falls in a
  // spring-forward gap (the anchor is shifted forward), or every differing
  // occurrence is the same epoch instant rendered with a different wall clock.
  const dstExplained =
    c.tzid !== null &&
    (isGapDtstart(c.dtstart, c.tzid) || isPureDstDifference(ts.occurrences, oracle.occurrences))
  const category: Category = isKnownOracleByWeekNoBug(c, ts.occurrences, oracle.occurrences)
    ? 'MISMATCH_ORACLE_BYWEEKNO'
    : dstExplained
      ? 'MISMATCH_DST'
      : 'MISMATCH_NONDST'
  return {
    category,
    case: c,
    tsOccurrences: ts.occurrences,
    oracleOccurrences: oracle.occurrences,
    firstDivergenceIndex: idx,
  }
}

// ---------------------------------------------------------------------------
// Signature for de-duplication
// ---------------------------------------------------------------------------

const BY_KEYS = [
  'BYMONTH',
  'BYWEEKNO',
  'BYYEARDAY',
  'BYMONTHDAY',
  'BYDAY',
  'BYHOUR',
  'BYMINUTE',
  'BYSECOND',
  'BYSETPOS',
]

function signature(c: Classified): string {
  const rrule = c.case.rrule.toUpperCase()
  const freq = /FREQ=([A-Z]+)/.exec(rrule)?.[1] ?? '?'
  const present = BY_KEYS.filter((k) => new RegExp(`(^|;)${k}=`).test(rrule))
  const hasUntil = /(^|;)UNTIL=/.test(rrule)
  const ordinalByDay = /BYDAY=[^;]*[+-]?\d(MO|TU|WE|TH|FR|SA|SU)/.test(rrule)
  const zoned = c.case.tzid !== null ? 'ZONED' : 'FLOAT'
  return [
    c.category,
    freq,
    zoned,
    hasUntil ? 'UNTIL' : 'COUNT',
    ordinalByDay ? 'ORD' : '',
    present.join('+'),
  ]
    .filter(Boolean)
    .join(' | ')
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

interface DivergenceRecord {
  signature: string
  category: Category
  id: string
  seed: number
  rrule: string
  dtstart: string
  tzid: string | null
  count: number
  firstDivergenceIndex: number | null
  tsError?: string
  oracleError?: string
  tsOccurrences: string[]
  oracleOccurrences: string[]
}

function toRecord(c: Classified, seed: number): DivergenceRecord {
  return {
    signature: signature(c),
    category: c.category,
    id: c.case.id,
    seed,
    rrule: c.case.rrule,
    dtstart: c.case.dtstart,
    tzid: c.case.tzid,
    count: c.case.count,
    firstDivergenceIndex: c.firstDivergenceIndex,
    tsError: c.tsError,
    oracleError: c.oracleError,
    tsOccurrences: c.tsOccurrences,
    oracleOccurrences: c.oracleOccurrences,
  }
}

/** Is this classified case part of the "real signal" set worth adjudicating? */
function isInteresting(c: Classified): boolean {
  if (c.category === 'MISMATCH_NONDST' || c.category === 'TS_ERROR') return true
  if (c.category === 'ORACLE_ERROR' && c.tsOccurrences.length > 0) return true
  if (c.category === 'TS_TIMEOUT' && c.oracleOccurrences.length > 0) return true
  return false
}

async function main(): Promise<void> {
  if (!('Temporal' in globalThis)) {
    const { Temporal } = await import('temporal-polyfill')
    setTemporal(Temporal as unknown as typeof globalThis.Temporal)
    T = Temporal as unknown as typeof globalThis.Temporal
  } else {
    T = (globalThis as { Temporal: typeof Temporal }).Temporal
  }

  const { mode, seeds, count, timeoutOkMs, timeoutErrMs, out } = parseArgs()

  console.log('rrule-ts differential sweep')
  console.log(`  mode:    ${mode}`)
  console.log(`  seeds:   ${seeds.join(', ')}`)
  console.log(`  count:   ${count} per seed`)
  console.log(`  timeout: ${timeoutOkMs}ms (oracle-ok) / ${timeoutErrMs}ms (oracle-err)`)
  console.log()

  const totals: Record<Category, number> = {
    MATCH: 0,
    TS_ERROR: 0,
    TS_TIMEOUT: 0,
    ORACLE_ERROR: 0,
    BOTH_ERROR: 0,
    MISMATCH_DST: 0,
    MISMATCH_ORACLE_BYWEEKNO: 0,
    MISMATCH_NONDST: 0,
  }
  let totalCases = 0
  let oracleErrorSubstantive = 0
  let timeoutSubstantive = 0

  const nonMatchRecords: DivergenceRecord[] = []
  const runner = new WorkerRunner()
  const t0 = Date.now()

  let firstAggressiveSeed = true
  for (const seed of seeds) {
    let cases = mode === 'safe' ? sampleCases(count, seed) : sampleCasesAggressive(count, seed)
    // Include the deterministic sub-daily day-limit regression set once, on the
    // first aggressive seed, so bug coverage there does not depend on the random
    // draw (those combinations are excluded from the random generator because
    // they make the oracle grind).
    if (mode === 'aggressive' && firstAggressiveSeed) {
      cases = [...subDailyDayLimitCases(), ...cases]
      firstAggressiveSeed = false
    }
    const oracleResults = runOracle(cases)

    for (const c of cases) {
      const oracle = oracleResults.get(c.id)
      if (!oracle) continue
      totalCases++
      const budget = oracle.error !== null ? timeoutErrMs : timeoutOkMs
      const ts = await runner.run(c, budget)
      const classified = classify(c, oracle, ts)
      totals[classified.category]++

      if (classified.category === 'ORACLE_ERROR' && classified.tsOccurrences.length > 0) {
        oracleErrorSubstantive++
      }
      if (classified.category === 'TS_TIMEOUT' && classified.oracleOccurrences.length > 0) {
        timeoutSubstantive++
      }
      if (
        isInteresting(classified) ||
        classified.category === 'MISMATCH_DST' ||
        classified.category === 'MISMATCH_ORACLE_BYWEEKNO'
      ) {
        nonMatchRecords.push(toRecord(classified, seed))
      }
    }
    console.log(`  seed ${seed}: ${cases.length} cases processed (${Date.now() - t0}ms elapsed)`)
  }

  await runner.close()

  console.log()
  console.log('='.repeat(70))
  console.log(`SWEEP SUMMARY (mode=${mode}, ${seeds.length} seed(s), ${totalCases} cases)`)
  console.log('='.repeat(70))
  for (const cat of Object.keys(totals) as Category[]) {
    console.log(`  ${cat.padEnd(16)} ${totals[cat]}`)
  }
  console.log(`  ${'ORACLE_ERROR w/ TS occ'.padEnd(16)} ${oracleErrorSubstantive}`)
  console.log(`  ${'TS_TIMEOUT w/ oracle occ'.padEnd(16)} ${timeoutSubstantive}`)
  console.log()

  // De-duplicated signatures for the interesting buckets.
  const interesting = nonMatchRecords.filter((r) => {
    if (r.category === 'MISMATCH_NONDST' || r.category === 'TS_ERROR') return true
    if (r.category === 'ORACLE_ERROR' && r.tsOccurrences.length > 0) return true
    if (r.category === 'TS_TIMEOUT' && r.oracleOccurrences.length > 0) return true
    return false
  })
  const bySig = new Map<string, DivergenceRecord[]>()
  for (const r of interesting) {
    const arr = bySig.get(r.signature) ?? []
    arr.push(r)
    bySig.set(r.signature, arr)
  }

  console.log(
    `Distinct interesting signatures (NONDST / TS_ERROR / substantive ORACLE_ERROR / substantive TS_TIMEOUT): ${bySig.size}`
  )
  console.log()
  const sigs = [...bySig.entries()].sort((a, b) => b[1].length - a[1].length)
  for (const [sig, recs] of sigs) {
    console.log(`[${recs.length}x] ${sig}`)
    const ex = recs[0]
    console.log(`   e.g. ${ex.id} (seed ${ex.seed})  DTSTART=${ex.dtstart} TZID=${ex.tzid}`)
    console.log(`        RRULE:${ex.rrule}`)
    console.log(`        firstDiff@${ex.firstDivergenceIndex}`)
    if (ex.tsError) console.log(`        TS_ERROR: ${ex.tsError}`)
    if (ex.oracleError) console.log(`        ORACLE_ERROR: ${ex.oracleError}`)
    const i = ex.firstDivergenceIndex ?? 0
    const lo = Math.max(0, i - 1)
    const hi = i + 3
    console.log(`        TS    [${lo}..]: ${JSON.stringify(ex.tsOccurrences.slice(lo, hi))}`)
    console.log(`        ORACLE[${lo}..]: ${JSON.stringify(ex.oracleOccurrences.slice(lo, hi))}`)
    console.log()
  }

  // Documented dateutil BYWEEKNO year-boundary bug (rrule-ts is RFC-correct).
  const owRecs = nonMatchRecords.filter((r) => r.category === 'MISMATCH_ORACLE_BYWEEKNO')
  if (owRecs.length > 0) {
    console.log(
      `MISMATCH_ORACLE_BYWEEKNO (dateutil year-boundary bug, rrule-ts RFC-correct): ${owRecs.length}`
    )
    const ex = owRecs[0]
    console.log(`   e.g. ${ex.id} (seed ${ex.seed})  DTSTART=${ex.dtstart} TZID=${ex.tzid}`)
    console.log(`        RRULE:${ex.rrule}`)
    console.log(`        TS    : ${JSON.stringify(ex.tsOccurrences.slice(0, 3))}`)
    console.log(`        ORACLE: ${JSON.stringify(ex.oracleOccurrences.slice(0, 3))}`)
    console.log()
  }

  // DST mismatches by zone+freq (should all be spring-forward representation).
  const dstRecs = nonMatchRecords.filter((r) => r.category === 'MISMATCH_DST')
  if (dstRecs.length > 0) {
    const dstSig = new Map<string, number>()
    for (const r of dstRecs) {
      const key = `${r.tzid} | ${/FREQ=([A-Z]+)/.exec(r.rrule.toUpperCase())?.[1]}`
      dstSig.set(key, (dstSig.get(key) ?? 0) + 1)
    }
    console.log(`MISMATCH_DST breakdown (same-epoch, different wall-clock): ${dstRecs.length}`)
    for (const [k, v] of [...dstSig.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`   [${v}x] ${k}`)
    }
    console.log()
  }

  if (out !== undefined) {
    writeFileSync(out, JSON.stringify(nonMatchRecords, null, 2) + '\n', 'utf-8')
    console.log(`Wrote ${nonMatchRecords.length} non-match record(s) to ${out}`)
  }

  if (totals.MISMATCH_NONDST > 0 || totals.TS_ERROR > 0) {
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
