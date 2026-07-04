// LocalePack and LocaleTokens interfaces for rrule-ts i18n text rendering.
//
// Locale packs are plain objects with static tables and formatter functions.
// They are imported per-locale (e.g. 'rrule-ts/locales/en') so tree-shaking
// works: unused locales add zero bytes to the consumer bundle.

import type { Frequency, RRuleUntil } from '../types.js'

/**
 * Fixed-string connective tokens used to assemble human-readable RRULE clauses.
 * Each token is a locale-specific word or phrase.
 */
export interface LocaleTokens {
  /** Precedes a BYDAY or BYMONTHDAY clause. EN: 'on', DE: 'am' */
  on: string
  /** Precedes a BYHOUR time clause. EN: 'at', DE: 'um' */
  at: string
  /** Precedes a multi-month BYMONTH clause. EN: 'in', DE: 'in' */
  in: string
  /** Precedes a single-month BYMONTH clause. EN: 'in', DE: 'im' */
  inSingular: string
  /** Precedes the UNTIL date. EN: 'until', DE: 'bis' */
  until: string
  /** Appears between 'on' and an ordinal. EN: 'the', DE: '' (empty, not used in German) */
  the: string
  /** Used for the -1 ordinal in adjectival BYDAY position. EN: 'last', DE: 'letzten' */
  last: string
  /** Rendered for BYMONTHDAY=-1. EN: 'last day', DE: 'letzten Tag' */
  lastDay: string
  /** Used for the BYSETPOS=-1 + Mon-Fri weekday set pattern. EN: 'weekday', DE: 'Werktag' */
  weekday: string
}

/**
 * A locale pack supplies all human-language strings and formatter functions
 * needed by toText. Consumers pass a LocalePack object directly to toText
 * instead of a locale identifier string, which preserves tree-shaking: only
 * imported locale packs are included in the consumer bundle.
 *
 * The frequencies Record is intentionally absent. All interval phrasing is
 * delegated to formatInterval so that each locale can handle grammatical gender
 * and number agreement (e.g. German jeden/jede/jedes vs alle N).
 */
export interface LocalePack {
  /** Locale identifier, e.g. 'en' or 'de'. */
  id: string

  /**
   * Weekday display names in RFC 5545 order.
   * Index 0 = Monday (MO) through index 6 = Sunday (SU).
   */
  weekdays: [string, string, string, string, string, string, string]

  /**
   * Month display names.
   * Index 0 = January through index 11 = December.
   */
  months: [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ]

  /** Fixed-string connective tokens for clause assembly. */
  tokens: LocaleTokens

  /**
   * Render an interval phrase. When n=1 returns singular (e.g. 'every day').
   * When n>1 returns plural with count (e.g. 'every 2 days').
   * Must handle grammatical gender per language.
   */
  formatInterval(n: number, freq: Frequency): string

  /**
   * Render an ordinal for a BYDAY or BYSETPOS position.
   * Positive n: 1->'1st' (EN), '1.' (DE).
   * Negative n: -1->'last' (EN adjectival form), 'letzten' (DE).
   */
  formatOrdinal(n: number): string

  /**
   * Render a COUNT value as a human phrase.
   * EN: 1->'1 time', 5->'5 times'. DE: '5-mal'.
   */
  formatCount(n: number): string

  /**
   * Join a list of strings with locale-appropriate conjunction.
   * EN: Oxford comma ('A, B, and C'). DE: ' und ' with no Oxford comma ('A, B und C').
   */
  formatList(items: string[]): string

  /**
   * Render an UNTIL date as a human-readable string.
   * Temporal.PlainDate -> date only (e.g. 'January 1, 2025').
   * Temporal.PlainDateTime or Temporal.Instant -> date + time.
   */
  formatDate(date: RRuleUntil): string

  /**
   * Render a "Nth-to-last day" phrase for negative BYMONTHDAY values below -1.
   * n is the absolute value (n >= 2). The phrase must be in the target language.
   * EN: n=2 -> '2nd-to-last day'. DE: n=2 -> 'vorletzten Tag', n=3 -> '3.-letzten Tag'.
   */
  formatNthToLastDay(n: number): string

  /**
   * Render just the adjectival "nth-to-last" ordinal for a negative BYDAY ordinal
   * below -1 (e.g. ordinal=-2 for -2MO). n is the absolute value (n >= 2).
   * The returned string is combined with a weekday name by toText.
   * EN: n=2 -> '2nd-to-last'. DE: n=2 -> 'vorletzten', n=3 -> '3.-letzten'.
   */
  formatNthToLastOrdinal(n: number): string

  /**
   * The phrase returned by toText when a rule cannot be expressed naturally.
   * Callers who compare against COMPLEX_RULE_FALLBACK should use the EN locale
   * or compare against locale.complexRuleFallback for the locale they use.
   * EN: '(complex recurrence rule)'. DE: '(komplexe Wiederholungsregel)'.
   */
  complexRuleFallback: string
}
