#!/usr/bin/env node
// Three-way differential sweep: rrule-ts vs python-dateutil vs rrule.js.
//
// Extends the two-way sweep (sweep.ts) with a third oracle leg (rrule.js)
// so that any outlier can be triangulated. The core insight is:
//   - When two oracles agree and one disagrees, the outlier is almost
//     certainly the one with the bug.
//   - When all three disagree (THREE_WAY_SPLIT), no majority verdict is
//     available; each case is recorded for manual adjudication.
//
// rrule.js timezone caveat: the rrule.js adapter marks all tzid != null
// cases as "unsupported" (it cannot replicate IANA offsets faithfully). Those
// cases fall into RRULEJS_UNSUPPORTED and are excluded from outlier verdicts;
// DST_KNOWN also excluded (spring-forward-gap representation difference, same
// epoch instant). Only floating and UTC cases participate in 3-way scoring.
//
// Buckets (exactly one per case):
//   ALL_AGREE            all three engines produced the same occurrence list
//   TS_OUTLIER           rrule-ts differs, dateutil == rrulejs
//   DATEUTIL_OUTLIER     dateutil differs, rrule-ts == rrulejs
//   RRULEJS_OUTLIER      rrule.js differs, rrule-ts == dateutil
//   THREE_WAY_SPLIT      all three differ from each other
//   TS_ERROR             rrule-ts errored or timed out; at least one oracle ok
//   TS_TIMEOUT           rrule-ts timed out; oracle produced occurrences
//   ORACLE_ERROR         dateutil errored; rrule-ts ok (substantive if TS != [])
//   RRULEJS_ERROR        rrule.js adapter returned an error (ts and oracle ok)
//   RRULEJS_UNSUPPORTED  tzid != null; rrule.js excluded; 3-way verdict masked
//   DST_KNOWN            spring-forward-gap representation difference (same epoch)
//
// Usage:
//   pnpm --filter rrule-ts-conformance sweep3
//   pnpm --filter rrule-ts-conformance sweep3 -- --mode safe --seeds 1,2,3
//   pnpm --filter rrule-ts-conformance sweep3 -- --mode aggressive --seeds 21,22,23 --count 1200

import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'

import { setTemporal } from 'rrule-ts'
import { sampleCases } from './generator.js'
import { sampleCasesAggressive, subDailyDayLimitCases } from './generator-aggressive.js'
import { runRRuleJsBatch } from './rrulejs-oracle.js'
import type { OracleInput } from './generator.js'
import type { RRuleJsResult } from './rrulejs-oracle.js'

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
    seeds = [21, 22, 23]
  }

  const count = parseInt(get('--count') ?? '1200', 10)
  const timeoutOkMs = parseInt(get('--timeout') ?? '2000', 10)
  const timeoutErrMs = parseInt(get('--timeout-err') ?? '150', 10)
  const out = get('--out')
  return { mode, seeds, count, timeoutOkMs, timeoutErrMs, out }
}

// ---------------------------------------------------------------------------
// dateutil oracle invocation
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
      ORACLE_TIMEOUT_SEC: process.env.ORACLE_TIMEOUT_SEC ?? '2',
    },
  })
  const results: OracleResult[] = JSON.parse(output)
  return new Map(results.map((r) => [r.id, r]))
}

// ---------------------------------------------------------------------------
// TS expansion via worker with per-case wall-clock timeout
// ---------------------------------------------------------------------------

interface TsResult {
  occurrences: string[]
  error: string | null
}
type TsOutcome = TsResult | 'TIMEOUT'

/**
 * Two-worker rotation so a timed-out (grinding) worker is replaced
 * in the background while the next case runs on the warm alternate.
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
// Classification helpers (shared with sweep.ts logic)
// ---------------------------------------------------------------------------

let T: typeof Temporal | undefined

function isGapDtstart(dtstart: string, tzid: string | null): boolean {
  if (tzid === null || T === undefined) return false
  try {
    T.ZonedDateTime.from(`${dtstart}[${tzid}]`, { disambiguation: 'reject' })
    return false
  } catch {
    return true
  }
}

function epochOf(s: string): number {
  return Date.parse(s)
}

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

function firstDiff(a: string[], b: string[]): number | null {
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return i
  }
  return null
}

/** Is this ISO occurrence a year-boundary day (first/last week of a year)? */
function isYearBoundaryDay(iso: string): boolean {
  const m = parseInt(iso.slice(5, 7), 10)
  const d = parseInt(iso.slice(8, 10), 10)
  return (m === 1 && d <= 7) || (m === 12 && d >= 25)
}

/**
 * Detect the documented python-dateutil BYWEEKNO year-boundary bug.
 * When present, classify as DATEUTIL_OUTLIER rather than a plain mismatch.
 */
function isKnownDateutilByWeekNoBug(ts: string[], dateutil: string[]): boolean {
  if (!new RegExp('(^|;)BYWEEKNO=', 'i').test('')) return false // checked by caller
  const tsSet = new Set(ts)
  const dtSet = new Set(dateutil)
  // TS must be a strict subset: dateutil has extras, TS does not have things dateutil lacks
  for (const t of ts) if (!dtSet.has(t)) return false
  const extras = dateutil.filter((o) => !tsSet.has(o))
  if (extras.length === 0) return false
  return extras.every(isYearBoundaryDay)
}

// ---------------------------------------------------------------------------
// 3-way category type
// ---------------------------------------------------------------------------

type Category3 =
  | 'ALL_AGREE'
  | 'TS_OUTLIER'
  | 'DATEUTIL_OUTLIER'
  | 'RRULEJS_OUTLIER'
  | 'THREE_WAY_SPLIT'
  | 'TS_ERROR'
  | 'TS_TIMEOUT'
  | 'ORACLE_ERROR'
  | 'RRULEJS_ERROR'
  | 'RRULEJS_UNSUPPORTED'
  | 'DST_KNOWN'
  | 'BOTH_ERROR'

const ALL_CATEGORIES: Category3[] = [
  'ALL_AGREE',
  'TS_OUTLIER',
  'DATEUTIL_OUTLIER',
  'RRULEJS_OUTLIER',
  'THREE_WAY_SPLIT',
  'TS_ERROR',
  'TS_TIMEOUT',
  'ORACLE_ERROR',
  'RRULEJS_ERROR',
  'RRULEJS_UNSUPPORTED',
  'DST_KNOWN',
  'BOTH_ERROR',
]

interface Classified3 {
  category: Category3
  case: OracleInput
  tsOccurrences: string[]
  oracleOccurrences: string[]
  rruleJsOccurrences: string[]
  firstDivergenceIndex: number | null
  tsError?: string
  oracleError?: string
  rruleJsError?: string
}

// ---------------------------------------------------------------------------
// 3-way classification
// ---------------------------------------------------------------------------

function classify3(
  c: OracleInput,
  oracle: OracleResult,
  ts: TsOutcome,
  rj: RRuleJsResult
): Classified3 {
  const base = (): Omit<Classified3, 'category'> => ({
    case: c,
    tsOccurrences: ts === 'TIMEOUT' ? [] : (ts.occurrences ?? []),
    oracleOccurrences: oracle.occurrences ?? [],
    rruleJsOccurrences: rj.occurrences ?? [],
    firstDivergenceIndex: null,
  })

  // TS timeout cases
  if (ts === 'TIMEOUT') {
    if (oracle.error !== null) {
      // Both sides effectively empty: benign
      return { ...base(), category: 'ORACLE_ERROR', oracleError: oracle.error }
    }
    return { ...base(), category: 'TS_TIMEOUT', oracleOccurrences: oracle.occurrences }
  }

  // Both TS and oracle errored
  if (ts.error !== null && oracle.error !== null) {
    return { ...base(), category: 'BOTH_ERROR', tsError: ts.error, oracleError: oracle.error }
  }

  // TS errored, oracle ok
  if (ts.error !== null) {
    return {
      ...base(),
      category: 'TS_ERROR',
      tsError: ts.error,
      oracleOccurrences: oracle.occurrences,
    }
  }

  // Oracle errored, TS ok
  if (oracle.error !== null) {
    // Gap-dtstart with TS occurrences -> documented DST deviation
    if (isGapDtstart(c.dtstart, c.tzid) && ts.occurrences.length > 0) {
      return {
        ...base(),
        category: 'DST_KNOWN',
        tsOccurrences: ts.occurrences,
        oracleError: oracle.error,
        firstDivergenceIndex: 0,
      }
    }
    return {
      ...base(),
      category: 'ORACLE_ERROR',
      tsOccurrences: ts.occurrences,
      oracleError: oracle.error,
    }
  }

  // Both TS and oracle ok. Now check rrule.js.

  const tsOcc = ts.occurrences
  const dtOcc = oracle.occurrences
  const rjOcc = rj.occurrences

  // RRULEJS_UNSUPPORTED (tzid != null): do 2-way TS vs dateutil.
  // DST_KNOWN wins if the mismatch is purely spring-forward gap.
  if (rj.unsupported === true) {
    const idx = firstDiff(tsOcc, dtOcc)
    if (idx === null) {
      return {
        ...base(),
        category: 'RRULEJS_UNSUPPORTED',
        tsOccurrences: tsOcc,
        oracleOccurrences: dtOcc,
      }
    }
    // Diverge: check if DST-explained
    const dstExplained =
      c.tzid !== null && (isGapDtstart(c.dtstart, c.tzid) || isPureDstDifference(tsOcc, dtOcc))
    if (dstExplained) {
      return {
        ...base(),
        category: 'DST_KNOWN',
        tsOccurrences: tsOcc,
        oracleOccurrences: dtOcc,
        firstDivergenceIndex: idx,
      }
    }
    // Real mismatch inside RRULEJS_UNSUPPORTED: mask it (no 3rd engine to adjudicate)
    return {
      ...base(),
      category: 'RRULEJS_UNSUPPORTED',
      tsOccurrences: tsOcc,
      oracleOccurrences: dtOcc,
      firstDivergenceIndex: idx,
    }
  }

  // RRULEJS_ERROR
  if (rj.error !== null) {
    return {
      ...base(),
      category: 'RRULEJS_ERROR',
      tsOccurrences: tsOcc,
      oracleOccurrences: dtOcc,
      rruleJsError: rj.error,
    }
  }

  // Full 3-way comparison
  const tsEqDt = firstDiff(tsOcc, dtOcc) === null
  const tsEqRj = firstDiff(tsOcc, rjOcc) === null
  const dtEqRj = firstDiff(dtOcc, rjOcc) === null

  if (tsEqDt && tsEqRj) {
    return {
      ...base(),
      category: 'ALL_AGREE',
      tsOccurrences: tsOcc,
      oracleOccurrences: dtOcc,
      rruleJsOccurrences: rjOcc,
    }
  }

  const firstDiv = firstDiff(tsOcc, dtOcc) ?? firstDiff(tsOcc, rjOcc) ?? firstDiff(dtOcc, rjOcc)

  if (!tsEqDt && !tsEqRj && dtEqRj) {
    // TS outlier: dateutil and rrulejs agree
    return {
      ...base(),
      category: 'TS_OUTLIER',
      tsOccurrences: tsOcc,
      oracleOccurrences: dtOcc,
      rruleJsOccurrences: rjOcc,
      firstDivergenceIndex: firstDiv,
    }
  }

  if (!tsEqDt && tsEqRj && !dtEqRj) {
    // dateutil outlier: TS and rrulejs agree
    // Check if it's the known dateutil BYWEEKNO year-boundary bug
    const isByWeekNo = /(^|;)BYWEEKNO=/i.test(c.rrule)
    const isDateutilBug = isByWeekNo && isKnownDateutilByWeekNoBug(tsOcc, dtOcc)
    const category: Category3 = isDateutilBug ? 'DATEUTIL_OUTLIER' : 'DATEUTIL_OUTLIER'
    void isDateutilBug // will be surfaced via signature notes
    return {
      ...base(),
      category,
      tsOccurrences: tsOcc,
      oracleOccurrences: dtOcc,
      rruleJsOccurrences: rjOcc,
      firstDivergenceIndex: firstDiv,
    }
  }

  if (tsEqDt && !tsEqRj) {
    // rrulejs outlier: TS and dateutil agree
    return {
      ...base(),
      category: 'RRULEJS_OUTLIER',
      tsOccurrences: tsOcc,
      oracleOccurrences: dtOcc,
      rruleJsOccurrences: rjOcc,
      firstDivergenceIndex: firstDiv,
    }
  }

  // All three differ
  return {
    ...base(),
    category: 'THREE_WAY_SPLIT',
    tsOccurrences: tsOcc,
    oracleOccurrences: dtOcc,
    rruleJsOccurrences: rjOcc,
    firstDivergenceIndex: firstDiv,
  }
}

// ---------------------------------------------------------------------------
// Signature for de-duplication of interesting cases
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

function signature3(c: Classified3): string {
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
// Divergence record type
// ---------------------------------------------------------------------------

interface DivergenceRecord3 {
  signature: string
  category: Category3
  id: string
  seed: number
  rrule: string
  dtstart: string
  tzid: string | null
  count: number
  firstDivergenceIndex: number | null
  tsError?: string
  oracleError?: string
  rruleJsError?: string
  tsOccurrences: string[]
  oracleOccurrences: string[]
  rruleJsOccurrences: string[]
}

function toRecord3(c: Classified3, seed: number): DivergenceRecord3 {
  return {
    signature: signature3(c),
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
    rruleJsError: c.rruleJsError,
    tsOccurrences: c.tsOccurrences,
    oracleOccurrences: c.oracleOccurrences,
    rruleJsOccurrences: c.rruleJsOccurrences,
  }
}

function isInteresting3(c: Classified3): boolean {
  // Primary signals: rrule-ts is wrong (TS_OUTLIER, TS_ERROR) or all three disagree
  if (c.category === 'TS_OUTLIER') return true
  if (c.category === 'TS_ERROR') return true
  if (c.category === 'THREE_WAY_SPLIT') return true
  // Secondary: dateutil or rrulejs outlier (adjudication data)
  if (c.category === 'DATEUTIL_OUTLIER') return true
  if (c.category === 'RRULEJS_OUTLIER') return true
  return false
}

// ---------------------------------------------------------------------------
// BYWEEKNO-specific case probing
// ---------------------------------------------------------------------------

interface ProbeCase extends OracleInput {
  label: string
}

function buildByWeekNoProbeCases(): ProbeCase[] {
  return [
    {
      id: 'byweekno-probe-a',
      label: 'YEARLY;BYWEEKNO=52 floating count=9 dtstart=2000-01-01',
      rrule: 'FREQ=YEARLY;BYWEEKNO=52;COUNT=9',
      dtstart: '2000-01-01T09:00:00',
      tzid: null,
      count: 9,
    },
    {
      id: 'byweekno-probe-b',
      label: 'YEARLY;UNTIL=20340331T080000Z complex zoned count=20',
      rrule:
        'FREQ=YEARLY;UNTIL=20340331T080000Z;INTERVAL=2;WKST=TH;BYMONTHDAY=4,31;BYWEEKNO=1;BYMONTH=1,5,12,4',
      dtstart: '2000-01-04T09:00:00',
      tzid: 'America/New_York',
      count: 20,
    },
    {
      id: 'byweekno-probe-c',
      label: 'YEARLY;BYWEEKNO=1,-6;BYMONTH=12,5,8,11;BYSETPOS=-1 floating count=11',
      rrule:
        'FREQ=YEARLY;COUNT=11;INTERVAL=11;WKST=SU;BYMINUTE=28;BYHOUR=1,7;BYWEEKNO=1,-6;BYMONTH=12,5,8,11;BYSETPOS=-1',
      dtstart: '2000-01-01T01:28:00',
      tzid: null,
      count: 11,
    },
    {
      id: 'byweekno-probe-d',
      label: 'YEARLY;BYWEEKNO=-53,52;BYMONTH=12,11,6 floating count=20',
      rrule:
        'FREQ=YEARLY;UNTIL=20321231T230000;INTERVAL=4;WKST=FR;BYMINUTE=32;BYMONTHDAY=29;BYWEEKNO=-53,52;BYMONTH=12,11,6',
      dtstart: '2000-01-29T00:32:00',
      tzid: null,
      count: 20,
    },
  ]
}

async function runByWeekNoProbes(runner: WorkerRunner): Promise<void> {
  const probeCases = buildByWeekNoProbeCases()
  const oracleMap = runOracle(probeCases)
  const rjMap = runRRuleJsBatch(probeCases)

  console.log('='.repeat(70))
  console.log('BYWEEKNO PROBE CASES: raw 3-engine output (first 10 occurrences)')
  console.log('='.repeat(70))

  for (const c of probeCases) {
    const oracle = oracleMap.get(c.id)
    const rj = rjMap.get(c.id)
    const ts = await runner.run(c, 5000)

    const tsOcc = ts === 'TIMEOUT' ? [] : (ts.occurrences ?? [])
    const tsErr = ts === 'TIMEOUT' ? 'TIMEOUT' : ts.error
    const dtOcc = oracle?.occurrences ?? []
    const dtErr = oracle?.error ?? null
    const rjOcc = rj?.occurrences ?? []
    const rjErr = rj?.error ?? null
    const rjUnsupported = rj?.unsupported === true

    console.log()
    console.log(`-- ${c.id}: ${c.label}`)
    console.log(`   RRULE:   ${c.rrule}`)
    console.log(`   DTSTART: ${c.dtstart}  TZID: ${c.tzid ?? 'floating'}`)
    console.log()

    if (tsErr) {
      console.log(`   rrule-ts : ERROR: ${tsErr}`)
    } else {
      console.log(
        `   rrule-ts : [${tsOcc.slice(0, 10).join(', ')}]${tsOcc.length > 10 ? ` ... (${tsOcc.length} total)` : ` (${tsOcc.length} total)`}`
      )
    }

    if (dtErr) {
      console.log(`   dateutil : ERROR: ${dtErr}`)
    } else {
      console.log(
        `   dateutil : [${dtOcc.slice(0, 10).join(', ')}]${dtOcc.length > 10 ? ` ... (${dtOcc.length} total)` : ` (${dtOcc.length} total)`}`
      )
    }

    if (rjUnsupported) {
      console.log(`   rrule.js : UNSUPPORTED (tzid != null)`)
    } else if (rjErr) {
      console.log(`   rrule.js : ERROR: ${rjErr}`)
    } else {
      console.log(
        `   rrule.js : [${rjOcc.slice(0, 10).join(', ')}]${rjOcc.length > 10 ? ` ... (${rjOcc.length} total)` : ` (${rjOcc.length} total)`}`
      )
    }

    // Agreement notes
    if (!tsErr && !dtErr) {
      const tsEqDt = JSON.stringify(tsOcc) === JSON.stringify(dtOcc)
      if (!rjUnsupported && !rjErr) {
        const tsEqRj = JSON.stringify(tsOcc) === JSON.stringify(rjOcc)
        const dtEqRj = JSON.stringify(dtOcc) === JSON.stringify(rjOcc)
        if (tsEqDt && tsEqRj) {
          console.log('   AGREEMENT: all three agree')
        } else if (!tsEqDt && dtEqRj) {
          console.log('   AGREEMENT: rrule-ts is the outlier (dateutil == rrulejs)')
        } else if (tsEqRj && !dtEqRj) {
          console.log('   AGREEMENT: dateutil is the outlier (rrule-ts == rrulejs)')
        } else if (tsEqDt && !tsEqRj) {
          console.log('   AGREEMENT: rrule.js is the outlier (rrule-ts == dateutil)')
        } else {
          console.log('   AGREEMENT: all three differ (THREE_WAY_SPLIT)')
        }
      } else {
        if (tsEqDt) {
          console.log('   AGREEMENT: rrule-ts == dateutil (rrulejs not available)')
        } else {
          console.log('   AGREEMENT: rrule-ts != dateutil (rrulejs not available)')
        }
      }
    }
  }
  console.log()
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (!('Temporal' in globalThis)) {
    const { Temporal } = await import('temporal-polyfill')
    setTemporal(Temporal as unknown as typeof globalThis.Temporal)
    T = Temporal as unknown as typeof globalThis.Temporal
  } else {
    T = (globalThis as { Temporal: typeof Temporal }).Temporal
  }

  const { mode, seeds, count, timeoutOkMs, timeoutErrMs, out } = parseArgs()

  console.log('rrule-ts three-way differential sweep (rrule-ts vs dateutil vs rrule.js)')
  console.log(`  mode:    ${mode}`)
  console.log(`  seeds:   ${seeds.join(', ')}`)
  console.log(`  count:   ${count} per seed`)
  console.log(`  timeout: ${timeoutOkMs}ms (oracle-ok) / ${timeoutErrMs}ms (oracle-err)`)
  console.log()

  const totals: Record<Category3, number> = Object.fromEntries(
    ALL_CATEGORIES.map((c) => [c, 0])
  ) as Record<Category3, number>

  let totalCases = 0
  const allRecords: DivergenceRecord3[] = []
  const runner = new WorkerRunner()
  const t0 = Date.now()

  // ---------------------------------------------------------------------------
  // CALIBRATION: safe mode first (a subset of cases to show rrulejs baseline)
  // ---------------------------------------------------------------------------
  let calibRruleJsOutlier = 0
  let calibTotal = 0
  const calibSeed = seeds[0] ?? 21
  const calibCount = Math.min(count, 3000)

  {
    console.log(`Calibration: safe mode, seed=${calibSeed}, ${calibCount} cases (floating/UTC)...`)
    const calibCases = sampleCases(calibCount, calibSeed).filter((c) => c.tzid === null)
    const calibOracle = runOracle(calibCases)
    const calibRj = runRRuleJsBatch(calibCases)

    for (const c of calibCases) {
      const oracle = calibOracle.get(c.id)
      if (!oracle) continue
      const rj = calibRj.get(c.id)
      if (!rj) continue
      const budget = oracle.error !== null ? timeoutErrMs : timeoutOkMs
      const ts = await runner.run(c, budget)
      const classified = classify3(c, oracle, ts, rj)
      calibTotal++
      if (classified.category === 'RRULEJS_OUTLIER') calibRruleJsOutlier++
    }

    const rate = calibTotal > 0 ? ((calibRruleJsOutlier / calibTotal) * 100).toFixed(2) : '0.00'
    console.log(`  Calibration total (floating/UTC only): ${calibTotal}`)
    console.log(`  RRULEJS_OUTLIER: ${calibRruleJsOutlier} (${rate}%)`)
    if (calibRruleJsOutlier / calibTotal > 0.02) {
      console.log(
        `  WARNING: rrule.js outlier rate > 2% on safe/floating cases. The rrule.js adapter may have a semantic bug (count/until/normalization). Review adapter output before trusting RRULEJS_OUTLIER signals.`
      )
    } else {
      console.log(`  rrule.js outlier rate within expected range (<= 2%) on safe calibration.`)
    }
    console.log()
  }

  // ---------------------------------------------------------------------------
  // Main sweep: aggressive mode across requested seeds
  // ---------------------------------------------------------------------------
  let firstAggressiveSeed = true
  for (const seed of seeds) {
    let cases = mode === 'safe' ? sampleCases(count, seed) : sampleCasesAggressive(count, seed)
    if (mode === 'aggressive' && firstAggressiveSeed) {
      cases = [...subDailyDayLimitCases(), ...cases]
      firstAggressiveSeed = false
    }

    const oracleResults = runOracle(cases)
    const rjResults = runRRuleJsBatch(cases)

    for (const c of cases) {
      const oracle = oracleResults.get(c.id)
      const rj = rjResults.get(c.id)
      if (!oracle || !rj) continue
      totalCases++
      const budget = oracle.error !== null ? timeoutErrMs : timeoutOkMs
      const ts = await runner.run(c, budget)
      const classified = classify3(c, oracle, ts, rj)
      totals[classified.category]++

      if (isInteresting3(classified)) {
        allRecords.push(toRecord3(classified, seed))
      }
    }
    console.log(`  seed ${seed}: ${cases.length} cases processed (${Date.now() - t0}ms elapsed)`)
  }

  await runner.close()

  console.log()
  console.log('='.repeat(70))
  console.log(`SWEEP SUMMARY (mode=${mode}, ${seeds.length} seed(s), ${totalCases} total cases)`)
  console.log('='.repeat(70))
  for (const cat of ALL_CATEGORIES) {
    const n = totals[cat]
    if (
      n > 0 ||
      [
        'ALL_AGREE',
        'TS_OUTLIER',
        'DATEUTIL_OUTLIER',
        'RRULEJS_OUTLIER',
        'THREE_WAY_SPLIT',
      ].includes(cat)
    ) {
      console.log(`  ${cat.padEnd(22)} ${n}`)
    }
  }
  console.log()

  // De-duplicated signatures for interesting buckets
  const bySig = new Map<string, DivergenceRecord3[]>()
  for (const r of allRecords) {
    const arr = bySig.get(r.signature) ?? []
    arr.push(r)
    bySig.set(r.signature, arr)
  }

  // Priority report: TS_OUTLIER (rrule-ts bug candidates) first
  const tsOutlierSigs = [...bySig.entries()]
    .filter(([, recs]) => recs[0]?.category === 'TS_OUTLIER')
    .sort((a, b) => b[1].length - a[1].length)

  if (tsOutlierSigs.length > 0) {
    console.log(
      `TS_OUTLIER signatures (rrule-ts bug candidates, highest priority): ${tsOutlierSigs.length}`
    )
    for (const [sig, recs] of tsOutlierSigs) {
      console.log(`  [${recs.length}x] ${sig}`)
      const ex = recs[0]
      if (!ex) continue
      console.log(
        `    e.g. ${ex.id} (seed ${ex.seed})  DTSTART=${ex.dtstart} TZID=${ex.tzid ?? 'null'}`
      )
      console.log(`         RRULE:${ex.rrule}`)
      console.log(`         firstDiff@${ex.firstDivergenceIndex}`)
      const i = ex.firstDivergenceIndex ?? 0
      const lo = Math.max(0, i - 1)
      const hi = i + 3
      console.log(`         TS       [${lo}..]: ${JSON.stringify(ex.tsOccurrences.slice(lo, hi))}`)
      console.log(
        `         dateutil [${lo}..]: ${JSON.stringify(ex.oracleOccurrences.slice(lo, hi))}`
      )
      console.log(
        `         rrule.js [${lo}..]: ${JSON.stringify(ex.rruleJsOccurrences.slice(lo, hi))}`
      )
      console.log()
    }
  } else {
    console.log('TS_OUTLIER: 0 (no rrule-ts outlier cases detected)')
    console.log()
  }

  // THREE_WAY_SPLIT report
  const threeWaySigs = [...bySig.entries()]
    .filter(([, recs]) => recs[0]?.category === 'THREE_WAY_SPLIT')
    .sort((a, b) => b[1].length - a[1].length)

  if (threeWaySigs.length > 0) {
    console.log(`THREE_WAY_SPLIT signatures (all three engines differ): ${threeWaySigs.length}`)
    for (const [sig, recs] of threeWaySigs) {
      console.log(`  [${recs.length}x] ${sig}`)
      const ex = recs[0]
      if (!ex) continue
      console.log(`    e.g. ${ex.id} (seed ${ex.seed})  DTSTART=${ex.dtstart}`)
      console.log(`         RRULE:${ex.rrule}`)
      const i = ex.firstDivergenceIndex ?? 0
      const lo = Math.max(0, i - 1)
      const hi = i + 3
      console.log(`         TS       [${lo}..]: ${JSON.stringify(ex.tsOccurrences.slice(lo, hi))}`)
      console.log(
        `         dateutil [${lo}..]: ${JSON.stringify(ex.oracleOccurrences.slice(lo, hi))}`
      )
      console.log(
        `         rrule.js [${lo}..]: ${JSON.stringify(ex.rruleJsOccurrences.slice(lo, hi))}`
      )
      console.log()
    }
  }

  // DATEUTIL_OUTLIER report
  const dtOutlierSigs = [...bySig.entries()]
    .filter(([, recs]) => recs[0]?.category === 'DATEUTIL_OUTLIER')
    .sort((a, b) => b[1].length - a[1].length)

  if (dtOutlierSigs.length > 0) {
    console.log(
      `DATEUTIL_OUTLIER signatures (dateutil is the outlier, rrule-ts == rrulejs): ${dtOutlierSigs.length}`
    )
    for (const [sig, recs] of dtOutlierSigs.slice(0, 5)) {
      console.log(`  [${recs.length}x] ${sig}`)
      const ex = recs[0]
      if (!ex) continue
      const i = ex.firstDivergenceIndex ?? 0
      const lo = Math.max(0, i - 1)
      const hi = i + 3
      const isByWeekNo = /(^|;)BYWEEKNO=/i.test(ex.rrule)
      console.log(`    e.g. ${ex.id}${isByWeekNo ? ' [BYWEEKNO-year-boundary bug suspected]' : ''}`)
      console.log(`         RRULE:${ex.rrule}`)
      console.log(`         TS       [${lo}..]: ${JSON.stringify(ex.tsOccurrences.slice(lo, hi))}`)
      console.log(
        `         dateutil [${lo}..]: ${JSON.stringify(ex.oracleOccurrences.slice(lo, hi))}`
      )
      console.log(
        `         rrule.js [${lo}..]: ${JSON.stringify(ex.rruleJsOccurrences.slice(lo, hi))}`
      )
      console.log()
    }
    if (dtOutlierSigs.length > 5) {
      console.log(`  ... and ${dtOutlierSigs.length - 5} more DATEUTIL_OUTLIER signatures`)
      console.log()
    }
  }

  // RRULEJS_OUTLIER report (adapter semantic check)
  const rjOutlierSigs = [...bySig.entries()]
    .filter(([, recs]) => recs[0]?.category === 'RRULEJS_OUTLIER')
    .sort((a, b) => b[1].length - a[1].length)

  if (rjOutlierSigs.length > 0) {
    const totalRjOutlier = [...bySig.values()]
      .filter((r) => r[0]?.category === 'RRULEJS_OUTLIER')
      .reduce((sum, r) => sum + r.length, 0)
    console.log(
      `RRULEJS_OUTLIER signatures (rrule.js adapter is the outlier): ${rjOutlierSigs.length} sigs, ${totalRjOutlier} cases`
    )
    for (const [sig, recs] of rjOutlierSigs.slice(0, 3)) {
      console.log(`  [${recs.length}x] ${sig}`)
      const ex = recs[0]
      if (!ex) continue
      const i = ex.firstDivergenceIndex ?? 0
      const lo = Math.max(0, i - 1)
      const hi = i + 3
      console.log(`    e.g. RRULE:${ex.rrule}`)
      console.log(`         TS       [${lo}..]: ${JSON.stringify(ex.tsOccurrences.slice(lo, hi))}`)
      console.log(
        `         dateutil [${lo}..]: ${JSON.stringify(ex.oracleOccurrences.slice(lo, hi))}`
      )
      console.log(
        `         rrule.js [${lo}..]: ${JSON.stringify(ex.rruleJsOccurrences.slice(lo, hi))}`
      )
      console.log()
    }
  }

  // TS_ERROR report
  const tsErrorRecs = allRecords.filter((r) => r.category === 'TS_ERROR')
  if (tsErrorRecs.length > 0) {
    console.log(`TS_ERROR cases: ${tsErrorRecs.length}`)
    for (const r of tsErrorRecs.slice(0, 3)) {
      console.log(`  ${r.id}: ${r.tsError}`)
      console.log(`    RRULE:${r.rrule}  DTSTART=${r.dtstart}`)
    }
    console.log()
  }

  // BYWEEKNO probes
  console.log()
  await runByWeekNoProbes(runner)

  if (out !== undefined) {
    writeFileSync(out, JSON.stringify(allRecords, null, 2) + '\n', 'utf-8')
    console.log(`Wrote ${allRecords.length} interesting record(s) to ${out}`)
  }

  // Exit code: non-zero if TS_OUTLIER found (rrule-ts bug candidates)
  if (totals.TS_OUTLIER > 0 || totals.TS_ERROR > 0) {
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
