/**
 * Repaint-storm (flicker) monitor — backs the `SILVERY_STRICT=flicker` slug
 * (alias intent: "cls_storm"). Watches the ANSI byte stream silvery's render
 * pipeline writes to the terminal and PANICs when destructive full-screen
 * clears / scroll-region resets repeat fast enough to constitute visible
 * flicker.
 *
 * Why this exists: flicker is the single hardest render bug to catch — it is
 * invisible to text-frame assertions (the FINAL frame is correct; the damage
 * is the transient blank between frames) and historically took eyeball +
 * `#undead` rounds to pin down. The `@ag/code/20297-pane-flicker-on-resize`
 * incident was a bare `\x1b[2J` emitted OUTSIDE the DEC-2026 sync region on
 * every resize: each `2J` blanked the pane for one composited frame before the
 * repaint landed. Repeated rapidly (resize-drag, a layout limit-cycle, or a
 * stale process re-emitting frames) that is a strobing blank-flash. This
 * monitor makes that class fail LOUD + NAMED at the source.
 *
 * What counts as a storm signal (per frame written to the terminal):
 * - `\x1b[2J` / `\x1b[3J` — erase-in-display (the 20297 culprit). `\x1b[J` and
 *   `\x1b[0J` (erase-to-end) and `\x1b[1J` (erase-to-start) are NOT counted:
 *   they are partial, non-blanking, and used legitimately by inline/static
 *   output. Only the full-screen erasers blank the viewport.
 * - `\x1b[r` / `\x1b[<top>;<bottom>r` — DECSTBM scroll-region reset/set. A
 *   scroll-region thrash (set/reset churn) is the other shape of repaint
 *   storm (a "scroll storm"); a single frame carrying one is benign,
 *   repetition in the window is not.
 *
 * What does NOT count (CRITICAL — the 20297 *fix* must never false-trip):
 * - A homed full-viewport repaint (`\x1b[H` followed by a full `bufferToAnsi`
 *   rewrite of every cell) is the LEGITIMATE post-20297 resize/focus frame. It
 *   carries NO `2J`/`3J` at all, so it registers ZERO storm signals — it can
 *   never trip this monitor regardless of size. The monitor targets
 *   destructive-clear REPETITION within a window, not full repaints, and not a
 *   single isolated clear.
 *
 * Behavior (fixed thresholds — no env knobs):
 * - PANIC when ≥ `PANIC_CLEARS` destructive clears land within `WINDOW_MS`
 *   with no intervening settle (a settle = a frame in the window that carried
 *   zero storm signals, i.e. the storm actually paused). The diagnostic NAMES
 *   the offending sequence + the count + the window, plus a culprit hint
 *   (bare `2J` outside the sync region — the @ag/code/20297 signature).
 *   Cooldown `PANIC_COOLDOWN_MS` before a re-trip so a genuine sustained storm
 *   logs once, not every frame.
 *
 * Activation: tier 1 default (inherited from `SILVERY_STRICT=1`, the same tier
 * as `bytes_out`/`mem`). Opt out per test/session with
 * `SILVERY_STRICT=1,!flicker`. The options below are TEST overrides only —
 * production reads no env knobs (per the user's "diagnostics that require
 * remembering ad-hoc env vars don't get used" rule).
 */
import { createLogger, type ConditionalLogger } from "loggily"

/**
 * Minimal logger surface the monitor depends on. Lets tests pass a small
 * mock without satisfying the full ConditionalLogger interface.
 */
export interface FlickerLogger {
  warn?: (msg: string | (() => string), data?: unknown) => void
  error?: (msg: string | (() => string), data?: unknown) => void
}

const NS = "silvery:flicker"

/** Rolling window over which clears are counted. */
const WINDOW_MS = 1_000
/**
 * Number of destructive full-screen clears within the window (with no
 * intervening settle frame) that constitutes a repaint storm.
 *
 * Three is deliberately above any LEGITIMATE clear cadence:
 * - A normal session emits at most ONE full clear per discrete event (startup
 *   alt-screen entry, an explicit `invalidate({ clearScreen })` on focus-in).
 *   Post-20297 a resize/focus repaint emits ZERO `2J` (the homed full repaint
 *   IS the clear), so even rapid resize-drag produces no clears at all.
 * - The 20297 BUG emitted a `2J` on EVERY resize frame; a resize-drag fires
 *   tens of frames per second → ≫3 clears in a 1 s window → trips.
 */
const PANIC_CLEARS = 3
/** Cooldown before a sustained storm is allowed to re-log. */
const PANIC_COOLDOWN_MS = 5_000
/** Drop frame records older than this to keep memory bounded. */
const EVICT_OLDER_THAN_MS = 10_000
/** Last-N frames retained for the diagnostic dump. */
const FRAME_HISTORY = 50

/**
 * Destructive full-screen erase-in-display: `\x1b[2J` (whole viewport) and
 * `\x1b[3J` (viewport + scrollback). Deliberately does NOT match `\x1b[J`,
 * `\x1b[0J`, or `\x1b[1J` — those are partial, non-blanking erases.
 */
const FULL_CLEAR_RE = /\x1b\[[23]J/g
/**
 * DECSTBM scroll-region reset/set: `\x1b[r` (reset to full screen) or
 * `\x1b[<top>;<bottom>r`. A private-mode variant (`\x1b[?...r`) is matched too
 * so DEC private scroll-region churn is caught.
 */
const SCROLL_REGION_RE = /\x1b\[\??(?:\d+(?:;\d+)*)?r/g

/** Per-frame storm-signal tally. */
interface FrameSignals {
  fullClears: number
  scrollRegionResets: number
}

interface FrameEntry {
  frameNum: number
  ts: number
  bytes: number
  signals: FrameSignals
}

/**
 * Test-only overrides for the monitor. Production code passes nothing — the // seam-allow: injected clock, logger and writers keep the tests deterministic without module mocks
 * scheduler instantiates the monitor with all defaults so the activation
 * surface stays at `SILVERY_STRICT` slugs only.
 */
export interface FlickerMonitorOptions {
  /** TEST: override the clears-in-window PANIC threshold. Production is fixed. */
  panicClears?: number
  /** TEST: override the rolling window (ms). Production is fixed at 1000ms. */
  windowMs?: number
  /**
   * TEST: when true the monitor records + diagnoses but does NOT throw, so a
   * test can assert the trip via `lastTrip` without unwinding the stack.
   * Production always THROWS on PANIC (fail loud). Default false.
   */
  noThrow?: boolean
  /** TEST: logger override (minimal warn/error surface; full ConditionalLogger also accepted). */
  logger?: FlickerLogger | ConditionalLogger
  /** TEST: clock override. */
  now?: () => number
  /** TEST: frame-summary writer override. */
  writeFile?: (path: string, contents: string) => void
  /** TEST: summary output directory. Production is `/tmp`. */
  snapshotDir?: string
  /** TEST: process id used in dump paths. */
  pid?: number
}

export interface FlickerTrip {
  kind: "panic"
  ts: number
  /** Number of destructive clears counted in the window. */
  clears: number
  /** Number of scroll-region resets counted in the window. */
  scrollRegionResets: number
  /** The window (ms) the count was measured over. */
  windowMs: number
  /** The named offending sequence (human-readable). */
  sequence: string
  /** The full panic message (also passed to log.error + the thrown Error). */
  message: string
  /** Path to the frame-summaries dump. */
  summaryPath: string
}

export interface FlickerMonitor {
  /**
   * Record one frame's worth of bytes actually written to the terminal. The
   * monitor scans `output` for destructive-clear / scroll-region sequences and
   * trips when their rate within the rolling window crosses the threshold.
   */
  recordFrame(frameNum: number, output: string): void
  /** Most recent trip event — primarily for tests. */
  readonly lastTrip: FlickerTrip | null
  /** Last frame entries — primarily for tests. */
  snapshotFrames(): readonly FrameEntry[]
  dispose(): void
}

export function createFlickerMonitor(options: FlickerMonitorOptions = {}): FlickerMonitor {
  const panicClears = options.panicClears ?? PANIC_CLEARS
  const windowMs = options.windowMs ?? WINDOW_MS
  const noThrow = options.noThrow ?? false
  const log = options.logger ?? createLogger(NS)
  const now = options.now ?? Date.now
  const writeFile = options.writeFile ?? defaultWriteFile
  const snapshotDir = options.snapshotDir ?? "/tmp"
  const pid = options.pid ?? process.pid

  const frames: FrameEntry[] = []
  let lastPanicAt = 0
  let lastTrip: FlickerTrip | null = null
  let disposed = false

  function evictOld(cutoff: number): void {
    while (frames.length > 0 && frames[0]!.ts < cutoff) frames.shift()
  }

  /**
   * Count storm signals across the in-window tail. Returns the totals AND
   * whether the storm settled (a window frame carried zero signals) — a settle
   * resets the "fast repetition" judgment so a slow trickle of clears spread
   * across calm frames never trips.
   */
  function tallyWindow(t: number): {
    fullClears: number
    scrollRegionResets: number
    settled: boolean
  } {
    const horizon = t - windowMs
    let fullClears = 0
    let scrollRegionResets = 0
    let settled = false
    for (let i = frames.length - 1; i >= 0; i--) {
      const f = frames[i]!
      if (f.ts < horizon) break
      const s = f.signals
      const frameSignals = s.fullClears + s.scrollRegionResets
      if (frameSignals === 0) {
        // A settle frame in the window means the storm paused — the clears on
        // either side of it are not a single uninterrupted burst.
        settled = true
        break
      }
      fullClears += s.fullClears
      scrollRegionResets += s.scrollRegionResets
    }
    return { fullClears, scrollRegionResets, settled }
  }

  function dumpFrameSummaries(filePath: string): void {
    try {
      const tail = frames.slice(-FRAME_HISTORY)
      const header = "# frameNum\tts\tbytes\tfullClears\tscrollRegionResets\n"
      const body = tail
        .map((f) =>
          [
            f.frameNum,
            new Date(f.ts).toISOString(),
            f.bytes,
            f.signals.fullClears,
            f.signals.scrollRegionResets,
          ].join("\t"),
        )
        .join("\n")
      writeFile(filePath, header + body + "\n")
    } catch (e) {
      log.error?.(`failed to write flicker frame summary: ${(e as Error).message}`)
    }
  }

  function maybePanic(t: number): void {
    if (t - lastPanicAt < PANIC_COOLDOWN_MS) return
    const { fullClears, scrollRegionResets, settled } = tallyWindow(t)
    // The storm must be UNINTERRUPTED within the window — a settle frame means
    // the clears were not a single fast burst (so an occasional legit clear,
    // even a few across a calm session, never accumulates into a trip).
    if (settled) return
    if (fullClears < panicClears) return

    const summaryPath = `${snapshotDir}/silvery-flicker-panic-${pid}-${t}.summary.txt`
    dumpFrameSummaries(summaryPath)

    const clearSeq = "\\x1b[2J"
    const sequence =
      scrollRegionResets > 0
        ? "\\x1b[2J/\\x1b[3J full-screen clear + \\x1b[r scroll-region reset"
        : "\\x1b[2J/\\x1b[3J full-screen clear"
    const message =
      `PANIC repaint storm: ${fullClears} full-screen clears` +
      (scrollRegionResets > 0 ? ` + ${scrollRegionResets} scroll-region resets` : "") +
      ` in ${windowMs}ms (threshold ${panicClears}). ` +
      `Offending sequence: ${sequence}. ` +
      `Likely culprit: a destructive ${clearSeq} emitted per-frame outside the ` +
      `DEC-2026 sync region (the @ag/code/20297-pane-flicker-on-resize signature) — ` +
      `a full repaint should home (\\x1b[H) and overwrite cells instead. ` +
      `Frame summary: ${summaryPath}`

    log.error?.(message, { clears: fullClears, scrollRegionResets, windowMs, summary: summaryPath })

    lastPanicAt = t
    lastTrip = {
      kind: "panic",
      ts: t,
      clears: fullClears,
      scrollRegionResets,
      windowMs,
      sequence,
      message,
      summaryPath,
    }

    if (!noThrow) throw new Error(message)
  }

  function recordFrame(frameNum: number, output: string): void {
    if (disposed) return
    const t = now()
    evictOld(t - EVICT_OLDER_THAN_MS)
    const signals: FrameSignals = {
      fullClears: countMatches(output, FULL_CLEAR_RE),
      scrollRegionResets: countMatches(output, SCROLL_REGION_RE),
    }
    frames.push({ frameNum, ts: t, bytes: output.length, signals })
    maybePanic(t)
  }

  function snapshotFrames(): readonly FrameEntry[] {
    return frames.slice()
  }

  function dispose(): void {
    disposed = true
    frames.length = 0
  }

  return {
    recordFrame,
    get lastTrip() {
      return lastTrip
    },
    snapshotFrames,
    dispose,
  }
}

function countMatches(haystack: string, re: RegExp): number {
  // re carries the global flag; reset lastIndex defensively (these are
  // module-level singletons reused across calls).
  re.lastIndex = 0
  let count = 0
  while (re.exec(haystack) !== null) count++
  re.lastIndex = 0
  return count
}

function defaultWriteFile(path: string, contents: string): void {
  // sync-node-builtin: multi-target lazy guard via getBuiltinModule (ESM-only wave-3).
  const fs = process.getBuiltinModule("node:fs")
  fs.writeFileSync(path, contents)
}
