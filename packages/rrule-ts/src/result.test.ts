import { describe, it, expect } from 'vitest'
import { ok, err } from './result.js'
import type { Result } from './result.js'

describe('ok', () => {
  it('creates an Ok result with ok: true', () => {
    const r = ok(42)
    expect(r.ok).toBe(true)
    expect(r.value).toBe(42)
  })

  it('works with string values', () => {
    const r = ok('hello')
    expect(r.ok).toBe(true)
    expect(r.value).toBe('hello')
  })

  it('works with null values', () => {
    const r = ok(null)
    expect(r.ok).toBe(true)
    expect(r.value).toBeNull()
  })

  it('works with object values', () => {
    const r = ok({ freq: 'WEEKLY' })
    expect(r.ok).toBe(true)
    expect(r.value).toEqual({ freq: 'WEEKLY' })
  })

  it('narrows type correctly in if branch', () => {
    const r: Result<number, string> = ok(10)
    if (r.ok) {
      // TypeScript should know r.value is number here
      const v: number = r.value
      expect(v).toBe(10)
    }
  })
})

describe('err', () => {
  it('creates an Err result with ok: false', () => {
    const r = err('something failed')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('something failed')
  })

  it('works with array errors', () => {
    const errors = [{ field: 'COUNT', ruleId: 'X', message: 'bad' }]
    const r = err(errors)
    expect(r.ok).toBe(false)
    expect(r.error).toEqual(errors)
  })

  it('narrows type correctly in else branch', () => {
    const r: Result<number, string> = err('bad')
    if (!r.ok) {
      const e: string = r.error
      expect(e).toBe('bad')
    }
  })
})
