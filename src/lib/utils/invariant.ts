/**
 * Invariant - Fail-fast assertions for development.
 *
 * Use these to validate assumptions that MUST be true.
 * In development, violations throw immediately with a clear message.
 * In production, violations log errors but don't crash (graceful degradation).
 *
 * Example:
 *   invariant(clip.duration > 0, 'Clip duration must be positive')
 *   const recording = invariantDefined(getRecording(id), `Recording ${id} not found`)
 */

const isDev = process.env.NODE_ENV === 'development'

/**
 * Assert a condition is true. Throws in dev, logs in prod.
 */
export function invariant(condition: unknown, message: string): asserts condition {
  if (condition) return

  const error = new Error(`Invariant violation: ${message}`)

  if (isDev) {
    throw error
  } else {
    console.error(error)
  }
}

/**
 * Assert a value is defined (not null/undefined). Returns the value.
 * Throws in dev, returns undefined with warning in prod.
 */
export function invariantDefined<T>(
  value: T | null | undefined,
  message: string
): T {
  if (value !== null && value !== undefined) {
    return value
  }

  const error = new Error(`Invariant violation: ${message}`)

  if (isDev) {
    throw error
  } else {
    console.error(error)
    // In prod, return a fallback to prevent crashes
    // Caller should handle gracefully
    return undefined as unknown as T
  }
}

/**
 * Assert we never reach this code path. Useful for exhaustive switch statements.
 */
export function invariantUnreachable(value: never, message?: string): never {
  throw new Error(message ?? `Unreachable code reached with value: ${value}`)
}

/**
 * Dev-only warning. Does nothing in production.
 */
export function devWarn(message: string, ...args: unknown[]): void {
  if (isDev) {
    console.warn(`[DEV] ${message}`, ...args)
  }
}

/**
 * Dev-only assertion. Does nothing in production.
 * Use for expensive checks that shouldn't run in prod.
 */
export function devAssert(condition: unknown, message: string): void {
  if (isDev && !condition) {
    console.error(`[DEV ASSERT] ${message}`)
  }
}
