// Temporal accessor and injector.
//
// The library has zero runtime dependencies: it reads globalThis.Temporal when
// present (Node >= 26, modern browsers that ship the TC39 Temporal proposal)
// and falls back to an instance injected by the caller via setTemporal().
//
// Test setup (test/setup-temporal.ts) injects temporal-polyfill on Node 22.

// We store the injected implementation separately so it can be swapped in
// tests without mutating globalThis.
let _injected: typeof Temporal | undefined

/**
 * Inject a Temporal implementation. Used by application code on Node < 26 and
 * by test setup (test/setup-temporal.ts) on the Node 22 CI matrix leg.
 *
 * Example:
 * ```ts
 * import { setTemporal } from 'rrule-ts'
 * import { Temporal } from 'temporal-polyfill'
 * setTemporal(Temporal)
 * ```
 */
export function setTemporal(impl: typeof Temporal): void {
  _injected = impl
}

/**
 * Return the available Temporal namespace.
 * Prefers the native global (`globalThis.Temporal`, present on Node >= 26 and
 * modern browsers); falls back to the implementation injected via setTemporal().
 *
 * Throws a descriptive error if neither is available so callers get a clear
 * message instead of a cryptic TypeError.
 */
export function getTemporal(): typeof Temporal {
  const native = (globalThis as Record<string, unknown>).Temporal
  if (native !== undefined) {
    return native as typeof Temporal
  }
  if (_injected !== undefined) {
    return _injected
  }
  throw new Error(
    'Temporal is not available. On Node.js < 26, inject a polyfill with setTemporal() ' +
      'before using date-aware RRULE features (DTSTART, UNTIL). ' +
      'See https://github.com/codewithagents/rrule#readme for the setup pattern.'
  )
}
