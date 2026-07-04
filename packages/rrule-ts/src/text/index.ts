// Human-readable RRULE text rendering (import 'rrule-ts/text').
//
// Public API for toText and fromText. The EN locale pack is bundled here as
// the default so consumers get natural English output without any imports.
// Other locales must be imported explicitly from 'rrule-ts/locales/en' or
// 'rrule-ts/locales/de', which keeps the DE locale fully tree-shakeable.

import type { RRuleOptions } from '../types.js'
import type { Result } from '../result.js'
import { err } from '../result.js'
import type { LocalePack } from '../locales/types.js'
import { toText as buildToText } from './toText.js'

export type { LocalePack, LocaleTokens } from '../locales/types.js'
export { COMPLEX_RULE_FALLBACK } from './toText.js'

/** Options accepted by toText and fromText. */
export interface TextOptions {
  /**
   * Locale pack to use for rendering. Defaults to the built-in English locale
   * when omitted. Pass 'en' or 'de' (imported from rrule-ts/locales/en or
   * rrule-ts/locales/de) to override.
   */
  locale?: LocalePack
}

/**
 * Convert RRuleOptions to a human-readable recurrence description.
 *
 * Never throws. Returns '(complex recurrence rule)' for rules that cannot be
 * naturally phrased in the target locale (e.g. BYWEEKNO, BYYEARDAY, unusual
 * BYSETPOS combinations). This is the only case where the output is not a
 * grammatical sentence.
 *
 * @example
 * toText({ freq: 'DAILY' })
 * // 'every day'
 *
 * @example
 * toText({ freq: 'WEEKLY', byDay: [{ weekday: 'MO', ordinal: undefined }] })
 * // 'every week on Monday'
 *
 * @example
 * import { de } from 'rrule-ts/locales/de'
 * toText({ freq: 'DAILY' }, { locale: de })
 * // 'jeden Tag'
 */
export function toText(options: RRuleOptions, textOptions?: TextOptions): string {
  return buildToText(options, textOptions?.locale)
}

/**
 * Parse a human-readable recurrence description into RRuleOptions.
 *
 * Currently not implemented. Returns an error result. Full implementation
 * with EN round-trip guarantee is planned for Phase 3.
 *
 * @stub Phase 3: recursive-descent parser for canonical EN toText output.
 */
// v8 ignore next 3
export function fromText(_text: string, _textOptions?: TextOptions): Result<RRuleOptions, string> {
  return err('not implemented: fromText (coming in Phase 3)')
}
