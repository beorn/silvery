/**
 * Layout-shift (CLS) monitor — post-commit instrumentation.
 *
 * Detects two classes of layout instability:
 *
 *  1. **Layout shifts** — an AgNode's `screenRect` changes between
 *     consecutive render commits with no scroll/resize cause. Logged
 *     individually under `DEBUG=silvery:cls`; quick-reflow storms (the
 *     same path shifting many times in a short window) escalate to a
 *     `warn` summary.
 *
 *  2. **Unreasonable sizes** — degenerate or oversized rects detected
 *     during the same walk: `width=0` / `height=0` with visible content
 *     underneath, negative coords, rect exceeding the terminal bounds.
 *     Logged at `warn` regardless of `DEBUG`.
 *
 * Inspired by Web Vitals' Cumulative Layout Shift. The DOM equivalent
 * fires on visible content moving; in terminals the same shape produces
 * the "first centered, then shifts left" symptom the user reported
 * 2026-05-11 12:42 + 13:05.
 *
 * Bead: @km/silvery/layout-shift-instrumentation-cls.
 *
 * ## Activation
 *
 * The walk runs every commit but does nothing when no logger method is
 * armed. Activation:
 *
 *  - `DEBUG=silvery:cls` — full instrumentation, per-shift `debug` logs
 *    + storm `warn` logs + size-violation `warn` logs.
 *  - `LOG_LEVEL=warn` only — storm + size-violation `warn` logs (no
 *    per-shift spam). Useful in CI / smoke tests.
 *
 * In both modes, the per-commit walk is O(visible-tree-nodes); the
 * dominant cost is the tree traversal, not the comparison. When
 * disabled, only the `if (!log.debug && !log.warn) return` guard runs.
 */

import { createLogger } from "loggily"
import type { AgNode, Rect } from "@silvery/ag/types"

const log = createLogger("silvery:cls")

/**
 * Opt-in gate. CLS instrumentation runs ONLY when one of these
 * env vars is set:
 *
 *   - `DEBUG=silvery:cls` (or `DEBUG=silvery:*` / `DEBUG=*`)
 *   - `SILVERY_INSTRUMENT=cls`
 *
 * Without the gate, even `warn`-level output stays silent — the
 * instrumentation produces too much noise in synthetic test
 * harnesses (createRenderer fixtures often have transient
 * zero-rect frames during initial measurement) to be safely
 * always-on. Phase 2 of the bead will tier specific checks back
 * to always-on once their false-positive rate is characterised.
 *
 * Bead: @km/silvery/layout-shift-instrumentation-cls.
 */
function clsEnabled(): boolean {
  if (process.env.SILVERY_INSTRUMENT === "cls") return true
  const debug = process.env.DEBUG ?? ""
  if (!debug) return false
  return /(^|,)\s*(silvery:cls|silvery:\*|\*)\s*(,|$)/.test(debug)
}

const STORM_PATH_WINDOW_MS = 500
const STORM_PATH_THRESHOLD = 3
const STORM_COMMIT_THRESHOLD = 5

interface ShiftRecord {
  path: string
  prev: Rect | null
  next: Rect | null
}

interface PathHistory {
  /** Wall-clock timestamps of recent shifts for this path. Trimmed to the
   *  most recent `STORM_PATH_WINDOW_MS` on every probe. */
  ts: number[]
  /** Set of (kind, key) sentinels already fired — once-per-pair to avoid
   *  spamming. Reset when the path settles (no shift for > 2s). */
  firedKinds: Set<string>
}

export interface ClsMonitor {
  /**
   * Run the post-commit walk. Call once per `paintFrame` boundary in
   * the runtime, after layout has settled.
   *
   * @param root             The reconciler container's root AgNode.
   * @param cols             Terminal columns (for overflow checks).
   * @param rows             Terminal rows (for overflow checks).
   * @param scrollOrResize   When true, suppresses shift logs from this
   *                         commit — scroll/resize-driven motion isn't a
   *                         layout-stability bug. Size sentinels still
   *                         run.
   */
  onCommit(root: AgNode | null, cols: number, rows: number, scrollOrResize: boolean): void

  /** Drop accumulated path history. Tests and dimension changes use
   *  this to start with a clean storm-detector state. */
  reset(): void
}

export function createClsMonitor(): ClsMonitor {
  const enabled = clsEnabled()
  const pathHistory = new Map<string, PathHistory>()
  let prevCols = 0
  let prevRows = 0

  function ensureHistory(path: string): PathHistory {
    let h = pathHistory.get(path)
    if (h === undefined) {
      h = { ts: [], firedKinds: new Set() }
      pathHistory.set(path, h)
    }
    return h
  }

  function rectEqual(a: Rect | null, b: Rect | null): boolean {
    if (a === b) return true
    if (a === null || b === null) return false
    return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  }

  function nodePath(node: AgNode): string {
    // Identity chain: walk ancestors, encoding type + key (from
    // props.id / data-testid / index). Cheap stable identifier — does
    // not need to be globally unique, only stable across commits for
    // the same logical node.
    const parts: string[] = []
    let n: AgNode | null = node
    let depth = 0
    while (n && depth < 12) {
      const props = n.props as { id?: string; "data-testid"?: string }
      const key = props.id ?? props["data-testid"] ?? ""
      parts.push(`${n.type}${key ? `#${key}` : ""}`)
      n = n.parent
      depth++
    }
    return parts.reverse().join("/")
  }

  function recordShift(rec: ShiftRecord, now: number): boolean {
    const h = ensureHistory(rec.path)
    h.ts.push(now)
    // Trim to window.
    while (h.ts.length > 0 && h.ts[0]! < now - STORM_PATH_WINDOW_MS) h.ts.shift()
    return h.ts.length >= STORM_PATH_THRESHOLD
  }

  function fireOnce(path: string, key: string): boolean {
    const h = ensureHistory(path)
    if (h.firedKinds.has(key)) return false
    h.firedKinds.add(key)
    return true
  }

  function checkSizeInvariants(node: AgNode, cols: number, rows: number): void {
    const rect = node.screenRect
    if (!rect) return
    // silvery-text nodes inherit layout from their parent silvery-box.
    // Virtual inline text children (Text-in-Text) legitimately have
    // {0,0,0,0} rects — they don't own layout. Skip text nodes; their
    // owning container will fire if it's actually degenerate.
    if (node.type === "silvery-text") return
    const path = nodePath(node)
    if (rect.x < 0 || rect.y < 0 || rect.width < 0 || rect.height < 0) {
      if (fireOnce(path, "negative")) {
        log.warn?.("negative-rect", { path, rect })
      }
    }
    if (rect.width > cols || rect.height > rows) {
      if (fireOnce(path, "overflow")) {
        log.warn?.("rect-overflows-terminal", { path, rect, cols, rows })
      }
    }
    // Zero-size with visible content: only flag when the node clearly
    // intends to render (has children with text, or has an explicit bg).
    if ((rect.width === 0 || rect.height === 0) && hasVisibleContent(node)) {
      if (fireOnce(path, "zero-area-with-content")) {
        log.warn?.("zero-area-with-content", { path, rect })
      }
    }
  }

  function hasVisibleContent(node: AgNode): boolean {
    if (node.type === "silvery-text") return true
    const props = node.props as { backgroundColor?: unknown; borderStyle?: unknown }
    if (props.backgroundColor !== undefined || props.borderStyle !== undefined) return true
    for (const child of node.children) {
      if (hasVisibleContent(child)) return true
    }
    return false
  }

  function walk(node: AgNode, cols: number, rows: number, suppressShift: boolean, commitShifts: ShiftRecord[]): void {
    if (!node.screenRect) {
      for (const child of node.children) walk(child, cols, rows, suppressShift, commitShifts)
      return
    }
    checkSizeInvariants(node, cols, rows)
    if (!suppressShift) {
      const prev = node.prevScreenRect
      const next = node.screenRect
      if (prev !== null && !rectEqual(prev, next)) {
        // First-time-measurement transitions don't count as shifts —
        // those are the deferred-only useBoxRect contract working as
        // designed (0,0 seed → real rect on next commit).
        const isFirstMeasure = prev.width === 0 && prev.height === 0 && next.width > 0 && next.height > 0
        if (!isFirstMeasure) {
          commitShifts.push({ path: nodePath(node), prev, next })
        }
      }
    }
    for (const child of node.children) walk(child, cols, rows, suppressShift, commitShifts)
  }

  function onCommit(root: AgNode | null, cols: number, rows: number, scrollOrResize: boolean): void {
    // Cheap gate: opt-in via DEBUG=silvery:cls or SILVERY_INSTRUMENT=cls.
    if (!enabled) return
    if (!root) return

    const resized = cols !== prevCols || rows !== prevRows
    const suppressShift = scrollOrResize || resized || prevCols === 0 || prevRows === 0
    prevCols = cols
    prevRows = rows

    const commitShifts: ShiftRecord[] = []
    walk(root, cols, rows, suppressShift, commitShifts)

    if (commitShifts.length === 0) return

    const now = performance.now()
    let stormPaths = 0
    for (const rec of commitShifts) {
      const stormForPath = recordShift(rec, now)
      if (stormForPath) stormPaths++
      log.debug?.("shift", { path: rec.path, prev: rec.prev, next: rec.next })
    }
    if (stormPaths > 0) {
      log.warn?.("reflow-storm-per-path", {
        stormPaths,
        windowMs: STORM_PATH_WINDOW_MS,
        threshold: STORM_PATH_THRESHOLD,
      })
    }
    if (commitShifts.length >= STORM_COMMIT_THRESHOLD) {
      log.warn?.("reflow-storm-per-commit", {
        shifts: commitShifts.length,
        threshold: STORM_COMMIT_THRESHOLD,
        firstPaths: commitShifts.slice(0, 5).map((r) => r.path),
      })
    }
  }

  function reset(): void {
    pathHistory.clear()
    prevCols = 0
    prevRows = 0
  }

  return { onCommit, reset }
}
