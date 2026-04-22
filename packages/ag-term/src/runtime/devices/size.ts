/**
 * term.size — single source of truth for terminal dimensions.
 *
 * Wraps the WriteStream's columns/rows behind a reactive alien-signals signal
 * so every reader sees the same value and can subscribe to resize events.
 *
 * Resize coalescing: multiplexers (tmux, cmux, Ghostty tabs) can fire
 * multiple SIGWINCH bursts in rapid succession as the PTY re-syncs. Without
 * coalescing, each event triggers a full re-layout at an intermediate size,
 * producing visible multi-phase layout shift. The owner coalesces bursts
 * within one 60Hz frame (~16ms) into a single update carrying the final
 * geometry. Discrete resizes spaced further apart pass through normally.
 *
 * Ownership: one `Size` per terminal session. Constructed by `createTerm()`
 * (Node terminal) or the emulator path (termless). Readers call `size.cols`
 * / `size.rows` or `size.subscribe(handler)` and never touch
 * `stdout.columns` / `stdout.rows` directly.
 *
 * Bead: km-silvery.term-sub-owners (Phase 5). Reference for the resize
 * coalescing rationale: km-tui.tab-switch-layout-shift.
 */

import { signal } from "@silvery/signals"

/** Snapshot of terminal dimensions. */
export interface SizeSnapshot {
  readonly cols: number
  readonly rows: number
}

/**
 * Terminal size sub-owner.
 *
 * Properties are live: every read of `size.cols` / `size.rows` reflects the
 * latest resize that has cleared the coalescing window. `subscribe` fires
 * on every coalesced change.
 */
export interface Size extends Disposable {
  /** Current terminal width in columns. */
  readonly cols: number

  /** Current terminal height in rows. */
  readonly rows: number

  /** Current dimensions as a plain snapshot. */
  readonly snapshot: SizeSnapshot

  /**
   * Subscribe to resize events. Handler fires after the 16ms coalescing
   * window elapses with the final geometry. Returns an unsubscribe function.
   */
  subscribe(handler: (s: SizeSnapshot) => void): () => void
}

/** One 60Hz frame — long enough to absorb PTY re-sync bursts, short enough to feel immediate. */
const RESIZE_COALESCE_MS = 16

/**
 * Options for `createSize`.
 */
export interface CreateSizeOptions {
  /** Override initial cols (default: `stdout.columns || 80`). */
  cols?: number
  /** Override initial rows (default: `stdout.rows || 24`). */
  rows?: number
  /**
   * Coalescing window in ms. Defaults to 16 (one 60Hz frame).
   * Set to 0 to disable coalescing (test scenarios).
   */
  coalesceMs?: number
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
export function createSize(
  stdout: NodeJS.WriteStream,
  options: CreateSizeOptions = {},
): Size {
  const coalesceMs = options.coalesceMs ?? RESIZE_COALESCE_MS
  const initialCols = options.cols ?? stdout.columns ?? 80
  const initialRows = options.rows ?? stdout.rows ?? 24

  // Reactive signal — readers via `size.cols/rows/snapshot`, fine-grained
  // subscribers via `size.subscribe(...)`. Both paths see the same value.
  const _size = signal<SizeSnapshot>({ cols: initialCols, rows: initialRows })

  // Subscriber set — notified on each coalesced resize.
  const listeners = new Set<(s: SizeSnapshot) => void>()

  let disposed = false
  let coalesceTimer: ReturnType<typeof setTimeout> | null = null

  const flush = () => {
    coalesceTimer = null
    if (disposed) return
    const next: SizeSnapshot = {
      cols: stdout.columns ?? 80,
      rows: stdout.rows ?? 24,
    }
    _size(next)
    listeners.forEach((l) => l(next))
  }

  const onResize = () => {
    if (disposed) return
    if (coalesceMs === 0) {
      flush()
      return
    }
    if (coalesceTimer !== null) return
    coalesceTimer = setTimeout(flush, coalesceMs)
  }

  stdout.on("resize", onResize)

  return {
    get cols() {
      return _size().cols
    },
    get rows() {
      return _size().rows
    },
    get snapshot() {
      return _size()
    },
    subscribe(handler: (s: SizeSnapshot) => void): () => void {
      listeners.add(handler)
      return () => {
        listeners.delete(handler)
      }
    },
    [Symbol.dispose]() {
      if (disposed) return
      disposed = true
      stdout.off("resize", onResize)
      if (coalesceTimer !== null) {
        clearTimeout(coalesceTimer)
        coalesceTimer = null
      }
      listeners.clear()
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
  const _size = signal<SizeSnapshot>(initial)
  const listeners = new Set<(s: SizeSnapshot) => void>()
  let disposed = false

  return {
    get cols() {
      return _size().cols
    },
    get rows() {
      return _size().rows
    },
    get snapshot() {
      return _size()
    },
    subscribe(handler: (s: SizeSnapshot) => void): () => void {
      listeners.add(handler)
      return () => {
        listeners.delete(handler)
      }
    },
    update(cols: number, rows: number) {
      if (disposed) return
      const next: SizeSnapshot = { cols, rows }
      _size(next)
      listeners.forEach((l) => l(next))
    },
    [Symbol.dispose]() {
      if (disposed) return
      disposed = true
      listeners.clear()
    },
  }
}
