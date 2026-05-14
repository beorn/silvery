/**
 * Render-output throughput monitor — backs the `SILVERY_STRICT=bytes_out`
 * slug. Watches the bytes silvery's render pipeline writes to stdout and
 * trips at fixed thresholds.
 *
 * Why this exists: silvery emits ANSI bytes to stdout; those bytes leave the
 * process and land in the pty parent's buffer (terminal multiplexer
 * scrollback — cmux, tmux, etc.). Internal heap profilers
 * (`process.memoryUsage`, `Bun.heapStats`, `--inspect`) cannot see this
 * firehose because the bytes are already gone. The 2026-05-13 cmux/silvercode
 * incident attributed multi-GB of memory to cmux, not silvercode; silvercode's
 * own heap looked healthy throughout. See
 * `docs/lessons/cmux-pty-buffer-firehose.md` (in km root) for the full
 * incident write-up.
 *
 * Behavior (fixed thresholds — no env knobs):
 * - WARN at sustained ≥1 MB/s over a 10s window. Emits a `silvery:bytes_out`
 *   log + writes frame summaries to `/tmp/silvery-bytes-out-warn-<pid>-<ts>.txt`.
 *   Cooldown 10s before re-trip.
 * - PANIC at burst ≥100 MB/s over a 2s window. Emits frame summaries AND a
 *   v8 heap snapshot. Cooldown 60s before re-trip.
 *
 * Activation: tier 1 default (inherited from `SILVERY_STRICT=1`). Opt out per
 * test/session with `SILVERY_STRICT=1,!bytes_out`. The options below are
 * TEST overrides only — production reads no env knobs (per the user's
 * "diagnostics that require remembering ad-hoc env vars don't get used" rule).
 */
import { createLogger, type ConditionalLogger } from "loggily"

/**
 * Minimal logger surface the monitor depends on. Lets tests pass a small
 * mock without satisfying the full ConditionalLogger interface.
 */
export interface BytesOutLogger {
  warn?: (msg: string | (() => string), data?: unknown) => void
  error?: (msg: string | (() => string), data?: unknown) => void
}

const NS = "silvery:bytes_out"

const FRAME_HISTORY = 100
const WARN_WINDOW_MS = 10_000
const PANIC_WINDOW_MS = 2_000
const WARN_COOLDOWN_MS = 10_000
const PANIC_COOLDOWN_MS = 60_000
const EVICT_OLDER_THAN_MS = 60_000

const DEFAULT_WARN_MB_PER_SEC = 1
const DEFAULT_PANIC_MB_PER_SEC = 100

interface FrameEntry {
  frameNum: number
  ts: number
  bytes: number
}

/**
 * Test-only overrides for the monitor. Production code passes nothing — the
 * scheduler instantiates the monitor with all defaults so the activation
 * surface stays at `SILVERY_STRICT` slugs only.
 */
export interface BytesOutMonitorOptions {
  /** TEST: override WARN threshold (MB/s). Production is fixed at 1 MB/s. */
  warnMbPerSec?: number
  /** TEST: override PANIC threshold (MB/s). Production is fixed at 100 MB/s. */
  panicMbPerSec?: number
  /** TEST: skip the v8 heap snapshot at PANIC. Production always writes one. */
  skipHeapSnapshot?: boolean
  /** TEST: snapshot output directory. Production is `/tmp`. */
  snapshotDir?: string
  /** TEST: logger override (minimal warn/error surface; full ConditionalLogger also accepted). */
  logger?: BytesOutLogger | ConditionalLogger
  /** TEST: clock override. */
  now?: () => number
  /** TEST: heap-snapshot writer override. */
  writeHeapSnapshot?: (path: string) => string | void
  /** TEST: frame-summary writer override. */
  writeFile?: (path: string, contents: string) => void
  /** TEST: process id used in dump paths. */
  pid?: number
}

export interface BytesOutTrip {
  kind: "warn" | "panic"
  ts: number
  /** MB/s observed over the window. */
  mbPerSec: number
  /** Path to the frame-summaries dump. */
  summaryPath: string
  /** Path to the heap snapshot — present at PANIC unless skipped. */
  snapshotPath?: string
}

export interface BytesOutMonitor {
  recordWrite(frameNum: number, bytes: number): void
  /** Most recent trip event (across both warn + panic) — primarily for tests. */
  readonly lastTrip: BytesOutTrip | null
  /** Last 100 frame entries — primarily for tests. */
  snapshotFrames(): readonly FrameEntry[]
  dispose(): void
}

export function createBytesOutMonitor(
  options: BytesOutMonitorOptions = {},
): BytesOutMonitor {
  const warnMbPerSec = options.warnMbPerSec ?? DEFAULT_WARN_MB_PER_SEC
  const panicMbPerSec = options.panicMbPerSec ?? DEFAULT_PANIC_MB_PER_SEC
  const skipHeapSnapshot = options.skipHeapSnapshot ?? false
  const snapshotDir = options.snapshotDir ?? "/tmp"
  const log = options.logger ?? createLogger(NS)
  const now = options.now ?? Date.now
  const writeHeapSnapshot = options.writeHeapSnapshot ?? defaultWriteHeapSnapshot
  const writeFile = options.writeFile ?? defaultWriteFile
  const pid = options.pid ?? process.pid

  // Convert thresholds: MB/s × window-seconds → bytes-in-window.
  const warnBytesInWindow = warnMbPerSec * 1_000_000 * (WARN_WINDOW_MS / 1000)
  const panicBytesInWindow = panicMbPerSec * 1_000_000 * (PANIC_WINDOW_MS / 1000)

  const frames: FrameEntry[] = []
  let lastWarnAt = 0
  let lastPanicAt = 0
  let lastTrip: BytesOutTrip | null = null
  let disposed = false

  function evictOld(cutoff: number): void {
    while (frames.length > 0 && frames[0]!.ts < cutoff) frames.shift()
  }

  function sumBytesInWindow(windowMs: number, t: number): number {
    const horizon = t - windowMs
    let sum = 0
    for (let i = frames.length - 1; i >= 0; i--) {
      const f = frames[i]!
      if (f.ts < horizon) break
      sum += f.bytes
    }
    return sum
  }

  function dumpFrameSummaries(filePath: string): boolean {
    try {
      const tail = frames.slice(-FRAME_HISTORY)
      const header = "# frameNum\tts\tbytes\n"
      const body = tail
        .map((f) => `${f.frameNum}\t${new Date(f.ts).toISOString()}\t${f.bytes}`)
        .join("\n")
      writeFile(filePath, header + body + "\n")
      return true
    } catch (e) {
      log.error?.(`failed to write frame summary: ${(e as Error).message}`)
      return false
    }
  }

  function maybePanic(t: number): boolean {
    if (t - lastPanicAt < PANIC_COOLDOWN_MS) return false
    const burstBytes = sumBytesInWindow(PANIC_WINDOW_MS, t)
    if (burstBytes < panicBytesInWindow) return false

    const summaryPath = `${snapshotDir}/silvery-bytes-out-panic-${pid}-${t}.summary.txt`
    dumpFrameSummaries(summaryPath)

    let snapshotPath: string | undefined
    if (!skipHeapSnapshot) {
      const candidate = `${snapshotDir}/silvery-firehose-${pid}-${t}.heapsnapshot`
      try {
        const written = writeHeapSnapshot(candidate)
        snapshotPath = typeof written === "string" ? written : candidate
      } catch (e) {
        log.error?.(`failed to write heap snapshot: ${(e as Error).message}`)
      }
    }

    const mbPerSec = burstBytes / 1_000_000 / (PANIC_WINDOW_MS / 1000)
    log.error?.(
      `PANIC render-out burst ${mbPerSec.toFixed(1)} MB/s exceeds ${panicMbPerSec} MB/s for ${PANIC_WINDOW_MS}ms`,
      { summary: summaryPath, heapSnapshot: snapshotPath },
    )

    lastPanicAt = t
    lastTrip = { kind: "panic", ts: t, mbPerSec, summaryPath, snapshotPath }
    return true
  }

  function maybeWarn(t: number): boolean {
    if (t - lastWarnAt < WARN_COOLDOWN_MS) return false
    const sustainedBytes = sumBytesInWindow(WARN_WINDOW_MS, t)
    if (sustainedBytes < warnBytesInWindow) return false

    const summaryPath = `${snapshotDir}/silvery-bytes-out-warn-${pid}-${t}.summary.txt`
    dumpFrameSummaries(summaryPath)

    const mbPerSec = sustainedBytes / 1_000_000 / (WARN_WINDOW_MS / 1000)
    log.warn?.(
      `WARN render-out sustained ${mbPerSec.toFixed(1)} MB/s exceeds ${warnMbPerSec} MB/s over ${WARN_WINDOW_MS}ms`,
      { summary: summaryPath },
    )

    lastWarnAt = t
    lastTrip = { kind: "warn", ts: t, mbPerSec, summaryPath }
    return true
  }

  function recordWrite(frameNum: number, bytes: number): void {
    if (disposed) return
    const t = now()
    evictOld(t - EVICT_OLDER_THAN_MS)
    frames.push({ frameNum, ts: t, bytes })
    // PANIC supersedes WARN in the same record — they have separate cooldowns.
    if (maybePanic(t)) return
    maybeWarn(t)
  }

  function snapshotFrames(): readonly FrameEntry[] {
    return frames.slice()
  }

  function dispose(): void {
    disposed = true
    frames.length = 0
  }

  return {
    recordWrite,
    get lastTrip() {
      return lastTrip
    },
    snapshotFrames,
    dispose,
  }
}

function defaultWriteHeapSnapshot(path: string): string | void {
  const v8 = loadV8()
  return v8.writeHeapSnapshot(path)
}

function defaultWriteFile(path: string, contents: string): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs")
  fs.writeFileSync(path, contents)
}

function loadV8(): typeof import("node:v8") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("node:v8") as typeof import("node:v8")
}
