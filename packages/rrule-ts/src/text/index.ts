// Human-readable RRULE text rendering (import 'rrule-ts/text').
//
// Public API for toText and fromText. The EN locale pack is bundled here as
// the default so consumers get natural English output without any imports.
// Other locales must be imported explicitly from 'rrule-ts/locales/en' or
// 'rrule-ts/locales/de', which keeps the DE locale fully tree-shakeable.

import type { RRuleOptions } from '../types.js'
import type { Result } from '../result.js'
import type { LocalePack } from '../locales/types.js'
import { toText as buildToText } from './toText.js'
import { fromText as parseFromText } from './fromText.js'

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
 * Parse a human-readable English recurrence description into RRuleOptions.
 *
 * Accepts only canonical output produced by toText with the EN locale.
 * Not a general natural-language parser.
 *
 * fromText is EN-only. There is no locale parameter because DE (and other
 * locales) parsing is not supported: the parser grammar is tied to the
 * English strings produced by toText. Passing non-English text returns Err.
 *
 * Round-trip guarantee: for all RRuleOptions x where toText(x, {locale: en})
 * does not return the complex-rule fallback string,
 * fromText(toText(x, {locale: en})).value deep-equals x
 * (excluding dtstart, tzid, wkst, bySecond which are absent from text output,
 * and excluding byMinute=[0] which is indistinguishable from byMinute=undefined).
 *
 * Returns Err if the text cannot be parsed as EN toText output.
 *
 * Out of scope: BYWEEKNO, BYYEARDAY, BYSECOND, WKST,
 * multi-value BYSETPOS, free-form prose not produced by toText.
 *
 * @example
 * fromText('every day')
 * // { ok: true, value: { freq: 'DAILY' } }
 *
 * @example
 * fromText('every week on Monday')
 * // { ok: true, value: { freq: 'WEEKLY', byDay: [{ weekday: 'MO', ordinal: undefined }] } }
 */
export function fromText(text: string): Result<RRuleOptions, string> {
  return parseFromText(text)
}
