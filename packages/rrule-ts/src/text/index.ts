// Human-readable RRULE text rendering (import 'rrule-ts/text').
//
// Stubs for the expansion phase.
// TODO(expansion-phase): implement toText and fromText with i18n locale packs.

import type { RRuleOptions } from '../types.js'

/** Options accepted by toText. */
export interface TextOptions {
  /** Locale identifier, e.g. 'en' or 'de'. Defaults to 'en'. */
  locale?: string
}

/**
 * Convert `RRuleOptions` to a human-readable recurrence description.
 *
 * @example toText({ freq: 'WEEKLY', byDay: [{ weekday: 'MO', ordinal: undefined }] })
 *   // 'every week on Monday' (expansion phase)
 *
 * @stub Not yet implemented.
 * TODO(expansion-phase): implement locale-aware text rendering.
 */
// v8 ignore next 3
export function toText(_options: RRuleOptions, _textOptions?: TextOptions): never {
  throw new Error('not implemented: toText (coming in expansion phase)')
}

/**
 * Parse a human-readable recurrence description into `RRuleOptions`.
 *
 * @stub Not yet implemented.
 * TODO(expansion-phase): implement natural-language RRULE parser.
 */
// v8 ignore next 3
export function fromText(_text: string, _locale?: string): never {
  throw new Error('not implemented: fromText (coming in expansion phase)')
}
