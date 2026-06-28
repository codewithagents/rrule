// Discriminated Result type. Never throws on user input: callers get back a
// typed success or failure value and can decide how to handle it.

export type Result<T, E> = Ok<T> | Err<E>

export interface Ok<T> {
  readonly ok: true
  readonly value: T
}

export interface Err<E> {
  readonly ok: false
  readonly error: E
}

/** Wrap a success value in a Result. */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value }
}

/** Wrap an error value in a Result. */
export function err<E>(error: E): Err<E> {
  return { ok: false, error }
}
