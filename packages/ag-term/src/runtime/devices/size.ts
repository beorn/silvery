/**
 * term.size — single source of truth for terminal dimensions, exposed as
 * reactive ReadSignals.
 *
 * Wraps the WriteStream's columns/rows behind an alien-signals signal so every
 * reader sees the same value and can participate in the reactive graph
 * (computed / effect). The signals are read-only from the outside — writes
 * happen internally on `resize` events (after coalescing).
 *
 * Resize coalescing: multiplexers (tmux, cmux, Ghostty tabs) can fire
 * multiple SIGWINCH bursts in rapid succession as the PTY re-syncs. Without
 * coalescing, each event triggers a full re-layout at an intermediate size,
 * producing visible multi-phase layout shift. The owner uses a **trailing-edge
 * debounce**: every incoming SIGWINCH resets a 200 ms timer, and the snapshot
 * publishes only after `coalesceMs` of silence. A four-event burst at ~80 ms
 * intervals (the observed cmux pattern) collapses to one published snapshot
 * carrying the final geometry. Discrete resizes spaced further apart than
 * `coalesceMs` pass through individually. The cost is a small per-resize
 * latency — fine for "settle after the workspace switch" but perceptible for
 * a continuous drag-resize; consumers that want zero-latency live preview
 * pass `coalesceMs: 0`.
 *
 * ## API shape
 *
 * ```ts
 * size.cols()          // current width
 * size.rows()          // current height
 * size.snapshot()      // { cols, rows }
 * effect(() => { … use size.cols() … })  // subscribe reactively
 * ```
 *
 * Ownership: one `Size` per terminal session. Constructed by `createTerm()`
 * (Node terminal) or the emulator path (termless). Readers never touch
 * `stdout.columns` / `stdout.rows` directly.
 */

import { signal, type ReadSignal } from "@silvery/signals"

/** Snapshot of terminal dimensions. */
export interface SizeSnapshot {
  readonly cols: number
  readonly rows: number
}

/**
 * Terminal size sub-owner.
 *
 * `cols`, `rows`, and `snapshot` are alien-signals `ReadSignal`s — call them
 * as functions to read the current value and, inside an `effect`, to
 * subscribe to changes. The first read (inside or outside an effect)
 * installs the lazy `stdout.on("resize")` listener.
 *
 * ```ts
 * // Read once
 * const { cols, rows } = term.size.snapshot()
 *
 * // Subscribe to changes
 * effect(() => {
 *   layout(term.size.cols(), term.size.rows())  // re-runs on every resize
 * })
 *
 * // React
 * const cols = useSignal(term.size.cols)
 * ```
 */
export interface Size extends Disposable {
  /** Current terminal width in columns. */
  readonly cols: ReadSignal<number>

  /** Current terminal height in rows. */
  readonly rows: ReadSignal<number>

  /** Current dimensions as a plain snapshot. */
  readonly snapshot: ReadSignal<SizeSnapshot>
}

/**
 * Trailing-edge debounce window. Long enough to absorb a multiplexer SIGWINCH
 * burst (cmux fires 4–6 events at ~80 ms intervals across ~300 ms during a
 * workspace switch); short enough to feel like settle, not lag, for a discrete
 * resize. Tests can shorten this via `coalesceMs`; consumers that want every
 * resize event published synchronously pass `coalesceMs: 0`.
 */
const RESIZE_COALESCE_MS = 200
const DEFAULT_COLS = 80
const DEFAULT_ROWS = 24

/**
 * Options for `createSize`.
 */
export interface CreateSizeOptions {
  /** Override initial cols (default: `stdout.columns || 80`). */
  cols?: number
  /** Override initial rows (default: `stdout.rows || 24`). */
  rows?: number
  /**
   * Trailing-edge debounce window in ms. Defaults to 200. Every incoming
   * `resize` event resets the timer; the snapshot publishes only after
   * `coalesceMs` of silence. Set to 0 to disable coalescing entirely (each
   * `resize` publishes synchronously) — useful in test scenarios where the
   * harness already controls timing.
   */
  coalesceMs?: number
}

function validDimension(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback
}

/**
 * Create a `Size` owner from a WriteStream. Subscribes to the stream's
 * `resize` event, coalesces bursts, and publishes the final geometry to
 * subscribers via alien-signals.
 *
 * Idempotent dispose: removes the resize listener and clears any pending
 * coalesce timer. Subsequent reads still work — the last known cols/rows
 * remain in the signal.
 */
export function createSize(stdout: NodeJS.WriteStream, options: CreateSizeOptions = {}): Size {
  const coalesceMs = options.coalesceMs ?? RESIZE_COALESCE_MS
  // When callers override dims explicitly (tests, headless-emulator setup),
  // their values are authoritative — we don't sync from stdout on install.
  // When neither is overridden we treat stdout as truth and re-read on first
  // access so any resize between construction and first read isn't lost.
  const dimsOverridden = options.cols !== undefined || options.rows !== undefined
  const initialCols =
    options.cols !== undefined ? options.cols : validDimension(stdout.columns, DEFAULT_COLS)
  const initialRows =
    options.rows !== undefined ? options.rows : validDimension(stdout.rows, DEFAULT_ROWS)

  // Writable signal owned privately — readers see it only through the
  // ReadSignal-shaped exports below. Consumers subscribe via
  // `effect(() => size.cols())` (or React's `useSignal(size.cols)`).
  // Seed snapshot is frozen so external casts (`as any`) can't corrupt owner
  // state silently. Every subsequent publish freezes a fresh object.
  const _snapshot = signal<SizeSnapshot>(Object.freeze({ cols: initialCols, rows: initialRows }))

  let disposed = false
  let coalesceTimer: ReturnType<typeof setTimeout> | null = null
  let installed = false

  /** Publish a new snapshot if the dims actually changed (equal-value guard). */
  const publish = (cols: number, rows: number) => {
    const prev = _snapshot()
    if (prev.cols === cols && prev.rows === rows) return
    _snapshot(Object.freeze({ cols, rows }))
  }

  const flush = () => {
    coalesceTimer = null
    if (disposed) return
    const prev = _snapshot()
    publish(validDimension(stdout.columns, prev.cols), validDimension(stdout.rows, prev.rows))
  }

  const onResize = () => {
    if (disposed) return
    if (coalesceMs === 0) {
      flush()
      return
    }
    // Trailing-edge debounce: every event resets the pending timer so a burst
    // of SIGWINCHs settles to a single publish carrying the *final* geometry.
    // Replaces the prior first-edge-then-flush design which let bursts wider
    // than the coalesce window leak every intermediate value (cmux's ~80 ms
    // inter-event spacing escaped the 16 ms window and produced 4–6 publishes
    // per workspace switch).
    if (coalesceTimer !== null) clearTimeout(coalesceTimer)
    coalesceTimer = setTimeout(flush, coalesceMs)
  }

  // Lazy install — the resize listener is attached on first read of any
  // public ReadSignal. Consumers that never read (e.g. style-only
  // createTerm() usages from chalk-compat call sites in km-tui/text/*)
  // pay zero listeners. Prevents the MaxListenersExceededWarning that
  // surfaced when every createTerm() eagerly wired one.
  //
  // Install-time resync: if the terminal resized between construction and
  // this first read (no listener attached yet → missed event), re-read the
  // live stdout dims and publish if they differ from the seed. Fixes the
  // "first read returns stale value forever" bug flagged by Pro review.
  //
  // Skipped when the caller explicitly overrode dims — those options are
  // authoritative (simulated sizes for tests, emulator setup).
  const ensureInstalled = () => {
    if (installed || disposed) return
    installed = true
    stdout.on("resize", onResize)
    if (!dimsOverridden) {
      const prev = _snapshot()
      publish(validDimension(stdout.columns, prev.cols), validDimension(stdout.rows, prev.rows))
    }
  }

  // Plain arrow functions — the derivation (`.cols` / `.rows` field access)
  // is O(1) and `computed()`'s memoization doesn't earn its keep here.
  const cols: ReadSignal<number> = () => {
    ensureInstalled()
    return _snapshot().cols
  }
  const rows: ReadSignal<number> = () => {
    ensureInstalled()
    return _snapshot().rows
  }
  const snapshot: ReadSignal<SizeSnapshot> = () => {
    ensureInstalled()
    return _snapshot()
  }

  return {
    cols,
    rows,
    snapshot,
    [Symbol.dispose]() {
      if (disposed) return
      disposed = true
      if (installed) {
        stdout.off("resize", onResize)
        installed = false
      }
      if (coalesceTimer !== null) {
        clearTimeout(coalesceTimer)
        coalesceTimer = null
      }
    },
  }
}

/**
 * Create a fixed-dimensions `Size` for headless / emulator terminals.
 *
 * No stream is observed. `update(cols, rows)` is the only way dimensions
 * change; the emulator-backed term calls it on explicit resize.
 */
export function createFixedSize(initial: SizeSnapshot): Size & {
  update(cols: number, rows: number): void
} {
  const _snapshot = signal<SizeSnapshot>(Object.freeze({ cols: initial.cols, rows: initial.rows }))
  let disposed = false

  const cols: ReadSignal<number> = () => _snapshot().cols
  const rows: ReadSignal<number> = () => _snapshot().rows
  const snapshot: ReadSignal<SizeSnapshot> = () => _snapshot()

  return {
    cols,
    rows,
    snapshot,
    update(nextCols: number, nextRows: number) {
      if (disposed) return
      const prev = _snapshot()
      if (prev.cols === nextCols && prev.rows === nextRows) return
      _snapshot(Object.freeze({ cols: nextCols, rows: nextRows }))
    },
    [Symbol.dispose]() {
      if (disposed) return
      disposed = true
    },
  }
}
