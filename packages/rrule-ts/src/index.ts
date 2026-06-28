// Public API surface for the rrule-ts core subpath (import 'rrule-ts').
//
// This phase implements: parse, stringify, validate, Temporal accessor, and
// the Result type helpers.
//
// expand(), iterate(), and RRuleSet are stubs that throw 'not implemented'.
// They are excluded from coverage thresholds (see vitest.config.ts include list
// and the /* v8 ignore */ annotations below) so thresholds reflect only the
// code that is genuinely exercised in this phase.
// TODO(expansion-phase): remove stubs and wire the real implementations.

export { parse } from './parse.js'
export { stringify } from './stringify.js'
export { validate } from './validate.js'
export { getTemporal, setTemporal } from './temporal.js'
export { ok, err } from './result.js'
export type { Ok, Err, Result } from './result.js'
export type {
  Frequency,
  Weekday,
  WeekdayNum,
  RRuleOptions,
  RRuleDtstart,
  RRuleUntil,
  ValidationError,
} from './types.js'

// ---------------------------------------------------------------------------
// Stubs for the expansion phase
// TODO(expansion-phase): implement these in a follow-up PR.
// ---------------------------------------------------------------------------

/**
 * Expand an RRULE into a bounded list of occurrence instants.
 *
 * @stub Not yet implemented. Throws at runtime.
 * TODO(expansion-phase): implement RRULE occurrence expansion.
 */
// v8 ignore next 3
export function expand(_options: import('./types.js').RRuleOptions, _limit?: number): never {
  throw new Error('not implemented: expand (coming in expansion phase)')
}

/**
 * Iterate over RRULE occurrences lazily.
 *
 * @stub Not yet implemented. Throws at runtime.
 * TODO(expansion-phase): implement RRULE async iterator.
 */
// v8 ignore next 3
export function iterate(_options: import('./types.js').RRuleOptions): never {
  throw new Error('not implemented: iterate (coming in expansion phase)')
}

/**
 * Combine multiple RRULEs, EXRULEs, RDATEs, and EXDATEs.
 *
 * @stub Not yet implemented. Throws at construction time.
 * TODO(expansion-phase): implement RRuleSet.
 */
// v8 ignore next 3
export class RRuleSet {
  constructor() {
    throw new Error('not implemented: RRuleSet (coming in expansion phase)')
  }
}
