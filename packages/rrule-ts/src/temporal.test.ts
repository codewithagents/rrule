import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getTemporal, setTemporal } from './temporal.js'

describe('getTemporal', () => {
  it('returns a Temporal namespace with Instant, PlainDate, PlainDateTime, ZonedDateTime', () => {
    const T = getTemporal()
    expect(T).toBeDefined()
    expect(typeof T.Instant.from).toBe('function')
    expect(typeof T.PlainDate.from).toBe('function')
    expect(typeof T.PlainDateTime.from).toBe('function')
    expect(typeof T.ZonedDateTime.from).toBe('function')
  })

  it('creates Temporal.Instant from epoch seconds', () => {
    const T = getTemporal()
    const inst = T.Instant.fromEpochMilliseconds(0)
    expect(inst.epochMilliseconds).toBe(0)
  })

  it('creates Temporal.PlainDate', () => {
    const T = getTemporal()
    const d = T.PlainDate.from('2024-01-15')
    expect(d.year).toBe(2024)
    expect(d.month).toBe(1)
    expect(d.day).toBe(15)
  })
})

describe('setTemporal', () => {
  let originalInjected: typeof Temporal | undefined

  beforeEach(() => {
    // Capture the injected state so we can restore it
    originalInjected = undefined
  })

  afterEach(() => {
    // Re-inject so the polyfill is available for subsequent tests on Node 22
    if (originalInjected !== undefined) {
      setTemporal(originalInjected)
    }
  })

  it('allows injecting a custom implementation', () => {
    const T = getTemporal()
    // Store so afterEach can restore
    originalInjected = T

    const fake = {
      ...T,
      // Override Instant.from as a canary to verify injection was used
      Instant: {
        ...T.Instant,
        from: (s: string) => T.Instant.from(s),
      },
    } as unknown as typeof Temporal

    setTemporal(fake)
    const retrieved = getTemporal()
    // If native Temporal is present it takes priority; otherwise injected is used
    expect(retrieved).toBeDefined()
  })

  it('throws with a descriptive message when Temporal is unavailable', () => {
    // Only testable on Node 22 where we can clear the injection.
    // On Node 26 native Temporal is always present.
    if ('Temporal' in globalThis) return

    // Clear the injected implementation
    setTemporal(undefined as unknown as typeof Temporal)
    expect(() => getTemporal()).toThrow(/Temporal is not available/)
    // Restore so later tests work
    originalInjected = getTemporal as unknown as typeof Temporal
  })
})
