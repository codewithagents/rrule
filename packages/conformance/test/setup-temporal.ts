import { setTemporal } from 'rrule-ts'

if (!('Temporal' in globalThis)) {
  const { Temporal } = await import('temporal-polyfill')
  setTemporal(Temporal as unknown as typeof globalThis.Temporal)
}
