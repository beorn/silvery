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
 * producing visible multi-phase layout shift. The owner coalesces bursts
 * within one 60Hz frame (~16ms) into a single update carrying the final
 * geometry. Discrete resizes spaced further apart pass through normally.
 *
 * ## API shape
 *
 * ```ts
 * size.cols()          // current width
 * size.rows()          // current height
 * size.snapshot()      // { cols, rows }
 * effect(() => { … use size.cols() … })  // subscribe reactively
 * size.subscribe(fn)   // imperative push callback (useSyncExternalStore / event-queue)
 * ```
 *
 * Both `effect(() => size.cols())` and `size.subscribe(fn)` get the same
 * coalesced updates. The imperative `subscribe` is retained for callers
 * that already have a push-callback shape (React's useSyncExternalStore and
 * the term-provider event queue).
 *
 * Ownership: one `Size` per terminal session. Constructed by `createTerm()`
 * (Node terminal) or the emulator path (termless). Readers never touch
 * `stdout.columns` / `stdout.rows` directly.
 *
 * Bead: km-silvery.term-sub-owners (Phase 5) + km-silvery.modes-as-signals
 * follow-up (expose as ReadSignal).
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

  // Writable signal owned privately — readers see it only through the
  // ReadSignal-shaped exports below. Consumers subscribe via
  // `effect(() => size.cols())` (or React's `useSignal(size.cols)`).
  const _snapshot = signal<SizeSnapshot>({ cols: initialCols, rows: initialRows })

  let disposed = false
  let coalesceTimer: ReturnType<typeof setTimeout> | null = null
  let installed = false

  const flush = () => {
    coalesceTimer = null
    if (disposed) return
    _snapshot({
      cols: stdout.columns ?? 80,
      rows: stdout.rows ?? 24,
    })
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

  // Lazy install — the resize listener is attached on first read of any
  // public ReadSignal. Consumers that never read (e.g. style-only
  // createTerm() usages from chalk-compat call sites in km-tui/text/*)
  // pay zero listeners. Prevents the MaxListenersExceededWarning that
  // surfaced when every createTerm() eagerly wired one.
  const ensureInstalled = () => {
    if (installed || disposed) return
    installed = true
    stdout.on("resize", onResize)
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
  const _snapshot = signal<SizeSnapshot>(initial)
  let disposed = false

  const cols: ReadSignal<number> = () => _snapshot().cols
  const rows: ReadSignal<number> = () => _snapshot().rows
  const snapshot: ReadSignal<SizeSnapshot> = () => _snapshot()

  return {
    cols,
    rows,
    snapshot,
    update(cols: number, rows: number) {
      if (disposed) return
      _snapshot({ cols, rows })
    },
    [Symbol.dispose]() {
      if (disposed) return
      disposed = true
    },
  }
}
