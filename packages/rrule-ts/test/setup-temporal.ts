// Vitest setup file: inject temporal-polyfill on runtimes that do not yet
// ship a native Temporal API (Node < 26). On Node >= 26, globalThis.Temporal
// is already present and this block is a no-op.
//
// This validates both CI matrix legs:
//   - Node 22: polyfill is injected here, tests run via setTemporal()
//   - Node 26: native Temporal is used directly, polyfill is never loaded

import { setTemporal } from '../src/temporal.js'

if (!('Temporal' in globalThis)) {
  const { Temporal } = await import('temporal-polyfill')
  // Cast is safe: temporal-polyfill implements the same TC39 Temporal interface
  // that TypeScript's lib.es2025.temporal.d.ts declares as the global Temporal.
  setTemporal(Temporal as unknown as typeof globalThis.Temporal)
}
