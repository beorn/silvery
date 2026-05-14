/**
 * In-process heap poll monitor — backs the `SILVERY_STRICT=mem` slug
 * (Layer 2 of the memory-observability stack).
 *
 * Samples `process.memoryUsage()` every 30 s on a fixed interval, logs the
 * full breakdown via the `silvery:mem` loggily namespace, and trips a
 * one-shot WARN line if RSS or `external + arrayBuffers` doubles within a
 * 60 s window.
 *
 * Where this fits: L1 (`bytes_out`) watches data leaving the process via the
 * render pipeline. L2 (`mem`, this file) watches data still inside the
 * process. L4 (`bun memwatch <pid>`) is the external view. Together they
 * cover the bytes-out / bytes-in / RSS-outside triad for a pty-attached
 * TUI. See `docs/lessons/cmux-pty-buffer-firehose.md` (in km root) for the
 * motivating incident.
 *
 * Convention: tier-1 default, opt-out via `SILVERY_STRICT=1,!mem`. No env
 * knobs — fixed sample cadence + threshold in code. Per the user-direction
 * documented in `vendor/silvery/docs/guide/debugging.md`:
 * "diagnostics that require remembering ad-hoc env vars don't get used."
 */
import { createLogger, type ConditionalLogger } from "loggily"

/** Minimal logger surface — tests can pass a partial mock. */
export interface MemMonitorLogger {
  info?: (msg: string | (() => string), data?: unknown) => void
  warn?: (msg: string | (() => string), data?: unknown) => void
  error?: (msg: string | (() => string), data?: unknown) => void
}

const NS = "silvery:mem"

const SAMPLE_INTERVAL_MS = 30_000
const DOUBLE_WINDOW_MS = 60_000
const SAMPLE_HISTORY = 8 // 8 × 30s = 240s of history (covers the 60s window comfortably)

interface MemSample {
  ts: number
  rss: number
  heapUsed: number
  heapTotal: number
  external: number
  arrayBuffers: number
}

export interface MemMonitorOptions {
  /** TEST: logger override (minimal info/warn/error surface). */
  logger?: MemMonitorLogger | ConditionalLogger
  /** TEST: clock override. */
  now?: () => number
  /** TEST: memoryUsage override. */
  memoryUsage?: () => NodeJS.MemoryUsage
  /** TEST: drive ticks manually instead of via setInterval (use `tick()`). */
  manual?: boolean
}

export interface MemMonitor {
  /** Force one sample now (also fired by the internal interval). */
  tick(): void
  /** Most recent sample (test introspection). */
  readonly lastSample: MemSample | null
  /** Last WARN trip (test introspection). */
  readonly lastWarn: { ts: number; reason: string } | null
  dispose(): void
}

export function createMemMonitor(options: MemMonitorOptions = {}): MemMonitor {
  const log = options.logger ?? createLogger(NS)
  const now = options.now ?? Date.now
  const memoryUsage = options.memoryUsage ?? process.memoryUsage
  const manual = options.manual ?? false

  const samples: MemSample[] = []
  let lastWarn: { ts: number; reason: string } | null = null
  let lastWarnReason: string | null = null
  let disposed = false
  let interval: ReturnType<typeof setInterval> | null = null

  function evictOld(cutoff: number): void {
    while (samples.length > 0 && samples[0]!.ts < cutoff) samples.shift()
    while (samples.length > SAMPLE_HISTORY) samples.shift()
  }

  function snapshotMin(field: keyof Omit<MemSample, "ts">, windowMs: number, t: number): number {
    const horizon = t - windowMs
    let min = Number.POSITIVE_INFINITY
    for (const s of samples) {
      if (s.ts < horizon) continue
      const v = s[field]
      if (v < min) min = v
    }
    return min
  }

  function tick(): void {
    if (disposed) return
    const t = now()
    const m = memoryUsage()
    const sample: MemSample = {
      ts: t,
      rss: m.rss,
      heapUsed: m.heapUsed,
      heapTotal: m.heapTotal,
      external: m.external,
      arrayBuffers: m.arrayBuffers,
    }
    samples.push(sample)
    evictOld(t - DOUBLE_WINDOW_MS * 2) // keep at least one full window of history

    log.info?.("mem sample", {
      rss_mb: Math.round(sample.rss / 1_000_000),
      heap_used_mb: Math.round(sample.heapUsed / 1_000_000),
      heap_total_mb: Math.round(sample.heapTotal / 1_000_000),
      external_mb: Math.round(sample.external / 1_000_000),
      array_buffers_mb: Math.round(sample.arrayBuffers / 1_000_000),
    })

    // Doubling check — RSS or external+arrayBuffers vs the floor within window.
    const rssMin = snapshotMin("rss", DOUBLE_WINDOW_MS, t)
    if (Number.isFinite(rssMin) && rssMin > 0 && sample.rss >= rssMin * 2) {
      const reason = `RSS doubled in ${DOUBLE_WINDOW_MS / 1000}s: ${Math.round(rssMin / 1_000_000)} → ${Math.round(sample.rss / 1_000_000)} MB`
      if (reason !== lastWarnReason) {
        log.warn?.(`WARN ${reason}`)
        lastWarn = { ts: t, reason }
        lastWarnReason = reason
      }
      return
    }
    const offHeapNow = sample.external + sample.arrayBuffers
    // Compute synthetic min for off-heap = min(external + arrayBuffers) within window.
    const horizon = t - DOUBLE_WINDOW_MS
    let offHeapMin = Number.POSITIVE_INFINITY
    for (const s of samples) {
      if (s.ts < horizon) continue
      const sum = s.external + s.arrayBuffers
      if (sum < offHeapMin) offHeapMin = sum
    }
    if (Number.isFinite(offHeapMin) && offHeapMin > 0 && offHeapNow >= offHeapMin * 2) {
      const reason = `external+arrayBuffers doubled in ${DOUBLE_WINDOW_MS / 1000}s: ${Math.round(offHeapMin / 1_000_000)} → ${Math.round(offHeapNow / 1_000_000)} MB`
      if (reason !== lastWarnReason) {
        log.warn?.(`WARN ${reason}`)
        lastWarn = { ts: t, reason }
        lastWarnReason = reason
      }
    }
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    if (interval !== null) {
      clearInterval(interval)
      interval = null
    }
    samples.length = 0
  }

  if (!manual) {
    interval = setInterval(tick, SAMPLE_INTERVAL_MS)
    // Don't keep the process alive just for memory sampling.
    const maybeUnref = interval as unknown as { unref?: () => unknown }
    if (typeof maybeUnref.unref === "function") {
      maybeUnref.unref()
    }
  }

  return {
    tick,
    get lastSample() {
      return samples.length > 0 ? samples[samples.length - 1]! : null
    },
    get lastWarn() {
      return lastWarn
    },
    dispose,
  }
}
