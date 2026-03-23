/**
 * Ink-compatible measureText with caching.
 *
 * Ink's measureText returns cached results (same reference) for repeated calls
 * with identical input. Silvery's measureText doesn't cache at the object level,
 * so we wrap it here to match Ink's behavior.
 */

import { measureText as silveryMeasureText } from "@silvery/term/unicode"

type MeasureResult = { width: number; height: number }

const cache = new Map<string, MeasureResult>()

/**
 * Measure the dimensions of text, returning cached results for repeated calls.
 *
 * Compatible with Ink's `measureText` — returns `{ width, height }` and
 * guarantees reference equality for identical inputs.
 */
export function measureText(text: string): MeasureResult {
  if (text.length === 0) {
    return { width: 0, height: 0 }
  }

  const cached = cache.get(text)
  if (cached) {
    return cached
  }

  const result = silveryMeasureText(text)
  cache.set(text, result)
  return result
}
