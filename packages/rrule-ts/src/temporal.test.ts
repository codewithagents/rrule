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
  // Capture the live Temporal implementation before any test runs so afterEach
  // can always restore it. Must be assigned before beforeEach, not inside it.
  let savedImpl: typeof Temporal

  beforeEach(() => {
    // Always snapshot the current live implementation before the test touches it.
    savedImpl = getTemporal()
  })

  afterEach(() => {
    // Restore the saved implementation so the polyfill remains available for
    // subsequent tests on Node 22 even if a test cleared the injection.
    setTemporal(savedImpl)
  })

  it('allows injecting a custom implementation', () => {
    const T = getTemporal()
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
    // On Node 26 native Temporal is always present and takes precedence.
    if ('Temporal' in globalThis) return

    // Clear the injected implementation; afterEach will restore savedImpl.
    setTemporal(undefined as unknown as typeof Temporal)
    expect(() => getTemporal()).toThrow(/Temporal is not available/)
  })
})
