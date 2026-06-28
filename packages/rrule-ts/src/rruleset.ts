// RRuleSet: combine multiple RRULEs, EXRULEs, RDATEs, and EXDATEs.
//
// Produces a merged, deduplicated, chronologically sorted stream of occurrences
// by merging the iterators of all added rules and filtering out exclusions.

import { getTemporal } from './temporal.js'
import type { RRuleOptions, RRuleDtstart } from './types.js'
import { iterate } from './expand.js'

/** Millisecond key for instant-like and plain-like temporal values. */
function toKey(v: RRuleDtstart): string {
  if (typeof v === 'object' && v !== null) {
    if ('epochMilliseconds' in v && !('year' in v)) {
      // Instant
      return `I:${(v as Temporal.Instant).epochMilliseconds}`
    }
    if ('timeZoneId' in v) {
      // ZonedDateTime
      return `Z:${(v as Temporal.ZonedDateTime).epochMilliseconds}`
    }
    if ('year' in v && 'hour' in v) {
      // PlainDateTime
      const pdt = v as Temporal.PlainDateTime
      return `P:${pdt.year}-${pdt.month}-${pdt.day}T${pdt.hour}:${pdt.minute}:${pdt.second}`
    }
    if ('year' in v) {
      // PlainDate
      const pd = v as Temporal.PlainDate
      return `D:${pd.year}-${pd.month}-${pd.day}`
    }
  }
  return String(v)
}

function compareKeys(a: RRuleDtstart, b: RRuleDtstart): number {
  const T = getTemporal()
  if ('epochMilliseconds' in (a as object) && 'epochMilliseconds' in (b as object)) {
    const aMs =
      'timeZoneId' in (a as object)
        ? (a as Temporal.ZonedDateTime).epochMilliseconds
        : (a as Temporal.Instant).epochMilliseconds
    const bMs =
      'timeZoneId' in (b as object)
        ? (b as Temporal.ZonedDateTime).epochMilliseconds
        : (b as Temporal.Instant).epochMilliseconds
    return aMs < bMs ? -1 : aMs > bMs ? 1 : 0
  }
  if ('year' in (a as object) && 'hour' in (a as object) && !('timeZoneId' in (a as object))) {
    return T.PlainDateTime.compare(a as Temporal.PlainDateTime, b as Temporal.PlainDateTime)
  }
  if ('year' in (a as object) && !('hour' in (a as object))) {
    return T.PlainDate.compare(a as Temporal.PlainDate, b as Temporal.PlainDate)
  }
  return 0
}

/**
 * Combine multiple RRULEs, EXRULEs, RDATEs, and EXDATEs into one sorted,
 * deduplicated occurrence stream.
 *
 * Usage:
 * ```ts
 * const set = new RRuleSet()
 * set.addRRule({ freq: 'WEEKLY', dtstart: ... })
 * set.addRDate(someInstant)
 * set.addExDate(someOtherInstant)
 * const occurrences = set.expand(20)
 * ```
 */
export class RRuleSet {
  private _rrules: RRuleOptions[] = []
  private _exrules: RRuleOptions[] = []
  private _rdates: RRuleDtstart[] = []
  private _exdates: RRuleDtstart[] = []

  /** Add a recurrence rule. */
  addRRule(options: RRuleOptions): this {
    this._rrules.push(options)
    return this
  }

  /** Add an exclusion rule (occurrences produced by this rule are excluded). */
  addExRule(options: RRuleOptions): this {
    this._exrules.push(options)
    return this
  }

  /** Add an explicit recurrence date. */
  addRDate(date: RRuleDtstart): this {
    this._rdates.push(date)
    return this
  }

  /** Add an explicit exclusion date. */
  addExDate(date: RRuleDtstart): this {
    this._exdates.push(date)
    return this
  }

  /**
   * Lazily iterate over merged occurrences in chronological order.
   * Stops when all iterators are exhausted or `limit` is reached.
   */
  *[Symbol.iterator](): Iterator<RRuleDtstart> {
    yield* this._merge(Infinity)
  }

  /**
   * Materialize up to `limit` occurrences into an array.
   */
  expand(limit?: number): RRuleDtstart[] {
    const result: RRuleDtstart[] = []
    for (const occ of this._merge(limit ?? Infinity)) {
      result.push(occ)
    }
    return result
  }

  private *_merge(limit: number): Generator<RRuleDtstart> {
    // Build exclusion set
    const exKeys = new Set<string>()
    for (const opts of this._exrules) {
      for (const occ of iterate(opts)) {
        exKeys.add(toKey(occ))
      }
    }
    for (const d of this._exdates) {
      exKeys.add(toKey(d))
    }

    // Collect all candidates from RRULE iterators and RDATE list.
    // We use a k-way merge of sorted generators.
    // For simplicity, we collect up to a bounded number and sort.
    // (A true k-way merge with lazy generators would need a priority queue.)
    const INNER_LIMIT = Math.min(limit * 10 + 10000, 50000)
    const allCandidates: RRuleDtstart[] = []

    for (const opts of this._rrules) {
      let n = 0
      for (const occ of iterate(opts)) {
        allCandidates.push(occ)
        n++
        if (n >= INNER_LIMIT) break
      }
    }

    for (const d of this._rdates) {
      allCandidates.push(d)
    }

    // Sort and deduplicate
    allCandidates.sort(compareKeys)
    const seen = new Set<string>()
    let emitted = 0
    for (const occ of allCandidates) {
      const key = toKey(occ)
      if (seen.has(key)) continue
      if (exKeys.has(key)) continue
      seen.add(key)
      yield occ
      emitted++
      if (emitted >= limit) return
    }
  }
}
