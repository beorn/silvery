/**
 * Keypress performance instrumentation.
 *
 * Zero-overhead when TRACE is not set — all logging uses optional chaining.
 * When TRACE=silvery:perf is set, emits span timing for each keypress cycle
 * and a summary on exit.
 *
 * @example
 * ```bash
 * TRACE=silvery:perf bun km view ~/vault
 * # → SPAN silvery:perf:keypress (5ms) {key: "j"}
 * # → on exit: keypress summary: 42 presses, mean=4.2ms, p95=12.1ms, max=18.3ms, overruns=2
 * ```
 */

import { createLogger } from "loggily"

/** Exported for ?.  chaining in hot paths: `perfLog.span?.("keypress", { key })` */
export const perfLog = createLogger("silvery:perf")

// ============================================================================
// Budget tracking (only active when spans are created)
// ============================================================================

let samples: Array<{ key: string; durationMs: number }> | null = null
let budgetOverruns = 0

/**
 * Record a completed keypress and check budget.
 * Only records when tracing is active (samples array initialized by startTracking).
 * Call after the keypress cycle completes (render done).
 */
export function checkBudget(key: string, durationMs: number, budgetMs = 16) {
  if (samples) {
    samples.push({ key, durationMs })
  }
  if (durationMs > budgetMs) {
    budgetOverruns++
    perfLog.warn?.(
      `keypress over budget: ${key} took ${durationMs.toFixed(1)}ms (budget: ${budgetMs}ms)`,
    )
  }
}

/** Call once when first span is created to start accumulating samples. */
export function startTracking() {
  if (!samples) samples = []
}

// ============================================================================
// Exit summary
// ============================================================================

/**
 * Log a summary of all recorded keypress spans.
 *
 * Call when the app unmounts/exits. Only produces output when TRACE is
 * enabled and at least one span was recorded.
 */
export function logExitSummary() {
  if (!samples || samples.length === 0) return

  const durations = samples.map((s) => s.durationMs).sort((a, b) => a - b)
  const total = samples.length
  const mean = durations.reduce((sum, d) => sum + d, 0) / total
  const p95Index = Math.min(Math.floor(total * 0.95), total - 1)
  const p95 = durations[p95Index]!
  const max = durations[total - 1]!

  perfLog.info?.(
    `keypress summary: ${total} presses, mean=${mean.toFixed(1)}ms, p95=${p95.toFixed(1)}ms, max=${max.toFixed(1)}ms, overruns=${budgetOverruns}`,
  )

  // Reset for potential reuse (tests)
  samples = null
  budgetOverruns = 0
}

/**
 * Reset internal state. Useful for tests to ensure clean state between runs.
 */
export function resetPerfState() {
  samples = null
  budgetOverruns = 0
}

/**
 * Get current sample count. Useful for tests.
 */
export function getSampleCount(): number {
  return samples?.length ?? 0
}
