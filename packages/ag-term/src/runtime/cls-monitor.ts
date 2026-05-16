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
import {
  aggregateReport,
  defaultClassifier,
  makeShift,
  type CLSReport,
  type LayoutShift,
  type ReasonClassifier,
} from "@silvery/ag/cls"
import type { AgNode, Rect } from "@silvery/ag/types"
import { assertNoUnexpectedShifts } from "../strict-cls"

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

/** Data-* attributes treated as identity tokens for CLS path resolution.
 *  Any component carrying one of these in its props is named in the
 *  layout-shift log even without an explicit `id` / `data-testid`. The
 *  list is intentionally broad so anonymous app-level boxes (cards,
 *  chat blocks, code containers, table grids) show up by role instead
 *  of collapsing to a generic "box" entry. */
const IDENTITY_DATA_KEYS = [
  "data-view",
  "data-block",
  "data-component",
  "data-card-id",
  "data-pane",
  "data-role",
] as const

interface ShiftRecord {
  path: string
  prev: Rect | null
  next: Rect | null
  /** Milliseconds since the previous shift for this path; null for the
   *  first observed shift. Included in `silvery:cls` debug logs so quick
   *  reflows can be diagnosed without reconstructing timing offline. */
  dtMs: number | null
}

interface PathHistory {
  /** Wall-clock timestamps of recent shifts for this path. Trimmed to the
   *  most recent `STORM_PATH_WINDOW_MS` on every probe. */
  ts: number[]
  /** Set of (kind, key) sentinels already fired — once-per-pair to avoid
   *  spamming. Reset when the path settles (no shift for > 2s). */
  firedKinds: Set<string>
  /** Most recent shift timestamp for this path, used for per-shift dt logs. */
  lastShiftAt: number | null
  /** True while the current timestamp window is already above the storm threshold. */
  inStorm: boolean
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

  /**
   * Start a CLS capture window. Subsequent `onCommit` calls accumulate
   * layout shifts (post-scroll `screenRect` transitions) into a session
   * buffer. The classifier labels each shift with a ReflowReason; default
   * classifier marks every shift "unexpected" (most pessimistic — surfaces
   * every shift). Throws on double-begin. While capturing, the monitor's
   * walk runs even without `DEBUG=silvery:cls` / `SILVERY_INSTRUMENT=cls`.
   *
   * Bead: @km/silvery/cls-instrumentation-primitive (Phase 8 — Option C consolidation).
   */
  beginCapture(classifier?: ReasonClassifier): void

  /**
   * End the active capture window, return aggregated `CLSReport`, reset
   * session state. Throws when not capturing. Under `SILVERY_STRICT=cls`
   * (tier 2 by default), throws `UnexpectedLayoutShiftError` when any
   * shift in the window was labeled "unexpected".
   */
  endCapture(): CLSReport

  /**
   * Cancel the active capture without producing a report. Idempotent —
   * safe to call when no capture is active (cleanup paths, error
   * recovery).
   */
  cancelCapture(): void
}

export function createClsMonitor(): ClsMonitor {
  const envEnabled = clsEnabled()
  const pathHistory = new Map<string, PathHistory>()
  let prevCols = 0
  let prevRows = 0

  // Capture-window state. Independent of the env-gate so test-time
  // capture works without DEBUG=silvery:cls. When `capturing === true`
  // the walk runs even when `envEnabled === false`, and per-commit
  // shifts are pushed into `sessionShifts` for `endCapture()` to
  // aggregate into a `CLSReport`.
  let capturing = false
  let activeClassifier: ReasonClassifier = defaultClassifier
  let sessionShifts: LayoutShift[] = []

  function ensureHistory(path: string): PathHistory {
    let h = pathHistory.get(path)
    if (h === undefined) {
      h = { ts: [], firedKinds: new Set(), lastShiftAt: null, inStorm: false }
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
    // CSS-selector-style identity chain. Walk ancestors, keep ONLY
    // nodes carrying a recognized identity prop (rendered as `#name`
    // or `[data-*=value]`); the unidentified intermediate
    // `silvery-box` chains drop out. The leaf always renders even
    // if untagged (as its bare type minus the `silvery-` prefix).
    // Joins with ` > ` like a CSS descendant selector. Bead:
    // @km/silvery/layout-shift-instrumentation-cls user feedback
    // 2026-05-11: paths were "silvery-root/silvery-box/silvery-box
    // #main/..." which is the full-chain — switch to "#main >
    // #bottom-bar > ... > text#watcher-status".
    //
    // Identity hierarchy (first non-empty wins):
    //   1. `id`                     → `#name`
    //   2. `data-testid`            → `#name` (test identity)
    //   3. `data-view`              → `[data-view=name]` (km-tui board roles)
    //   4. `data-block` / `-component` / `-card-id` → `[data-...=name]`
    //
    // When none present, the node is treated as a transparent
    // wrapper and skipped (unless it's the leaf).
    const parts: string[] = []
    let n: AgNode | null = node
    let depth = 0
    let isLeaf = true
    while (n && depth < 20) {
      const tag = identityTag(n)
      if (tag !== null) {
        const typeTag = n.type === "silvery-box" ? "" : `${typeShort(n.type)}`
        parts.push(`${typeTag}${tag}`)
      } else if (isLeaf) {
        // Leaf without id — emit the bare type so the log still
        // names what shifted.
        parts.push(typeShort(n.type))
      }
      // Else: untagged intermediate — skip.
      isLeaf = false
      n = n.parent
      depth++
    }
    return parts.reverse().join(" > ")
  }

  /** Resolve a node's identity tag for CLS paths. Returns null when no
   *  recognised identity prop is set — the node is then treated as a
   *  transparent wrapper. */
  function identityTag(node: AgNode): string | null {
    const props = node.props as Record<string, unknown>
    const id = props.id
    if (typeof id === "string" && id.length > 0) return `#${id}`
    const testid = props["data-testid"]
    if (typeof testid === "string" && testid.length > 0) return `#${testid}`
    // Common data-* identity props from km/silvercode/silvery apps. Anything
    // that names the component's role qualifies — we treat them all as
    // equivalent identity sources so anonymous boxes wearing a `data-block`
    // (or similar) get a real path token. The selector form ([data-x=y])
    // matches CSS for the read-back-to-code experience.
    for (const key of IDENTITY_DATA_KEYS) {
      const v = props[key]
      if (typeof v === "string" && v.length > 0) return `[${key}=${v}]`
    }
    return null
  }

  function typeShort(type: string): string {
    // Drop the `silvery-` prefix when present: `silvery-text` → `text`,
    // `silvery-box` → `box`, `silvery-root` → `root`.
    return type.startsWith("silvery-") ? type.slice("silvery-".length) : type
  }

  function recordShift(rec: ShiftRecord, now: number): boolean {
    const h = ensureHistory(rec.path)
    rec.dtMs = h.lastShiftAt === null ? null : now - h.lastShiftAt
    h.lastShiftAt = now
    h.ts.push(now)
    // Trim to window.
    while (h.ts.length > 0 && h.ts[0]! < now - STORM_PATH_WINDOW_MS) h.ts.shift()
    const inStorm = h.ts.length >= STORM_PATH_THRESHOLD
    const justEnteredStorm = inStorm && !h.inStorm
    h.inStorm = inStorm
    return justEnteredStorm
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

  function walk(
    node: AgNode,
    cols: number,
    rows: number,
    suppressShift: boolean,
    commitShifts: ShiftRecord[],
  ): void {
    if (!node.screenRect) {
      for (const child of node.children) walk(child, cols, rows, suppressShift, commitShifts)
      return
    }
    // Size-invariant WARN logging is a production-diagnostic side effect
    // gated by env (DEBUG=silvery:cls / SILVERY_INSTRUMENT=cls). Test-time
    // capture must walk silently — surfacing `silvery:cls` WARNs during a
    // capture window would fail consumers that treat any console output
    // as a test error (e.g. silvercode's vitest setup). Bead:
    // @km/silvery/cls-instrumentation-primitive — first-consumer broke
    // post-Option-C until this gate landed.
    if (envEnabled) checkSizeInvariants(node, cols, rows)
    if (!suppressShift) {
      const prev = node.prevScreenRect
      const next = node.screenRect
      if (prev !== null && !rectEqual(prev, next)) {
        // First-time-measurement transitions don't count as shifts —
        // those are the deferred-only useBoxRect contract working as
        // designed (0,0 seed → real rect on next commit).
        const isFirstMeasure =
          prev.width === 0 && prev.height === 0 && next.width > 0 && next.height > 0
        // Virtual inline text children always have {0,0,0,0} or
        // size-zero rects (they don't own layout — they inherit
        // position from their parent silvery-box). Their "shifts"
        // are just propagation noise from the real parent shift.
        const isInlineTextNoise =
          node.type === "silvery-text" &&
          (prev.width === 0 || prev.height === 0) &&
          (next.width === 0 || next.height === 0)
        if (!isFirstMeasure && !isInlineTextNoise) {
          commitShifts.push({ path: nodePath(node), prev, next, dtMs: null })
        }
      }
    }
    for (const child of node.children) walk(child, cols, rows, suppressShift, commitShifts)
  }

  function onCommit(
    root: AgNode | null,
    cols: number,
    rows: number,
    scrollOrResize: boolean,
  ): void {
    // Dimension tracking is metadata, not gated. Tracking prevCols/rows on
    // every commit (regardless of envEnabled/capturing) means a capture
    // started mid-session can use the established baseline instead of
    // treating its first commit as a first-paint resize. Two field
    // assignments per commit when nobody's listening — negligible.
    const resized = cols !== prevCols || rows !== prevRows
    const suppressShift = scrollOrResize || resized || prevCols === 0 || prevRows === 0
    prevCols = cols
    prevRows = rows

    // Cheap gate: opt-in via DEBUG=silvery:cls or SILVERY_INSTRUMENT=cls,
    // OR an active test-time capture window. Outside both, this is a
    // single boolean compare per commit — zero overhead.
    if (!envEnabled && !capturing) return
    if (!root) return

    const commitShifts: ShiftRecord[] = []
    walk(root, cols, rows, suppressShift, commitShifts)

    // Capture path: stash shifts into the active session for endCapture()
    // to aggregate. Skipped when suppressShift is true — scroll/resize
    // motion is user-action, not an unexpected layout shift. Classifier
    // still sees every non-suppressed shift and may override the default
    // "unexpected" label per-shift (e.g. label streamed chat reflow as
    // content-arrival).
    if (capturing && !suppressShift && commitShifts.length > 0) {
      const ts = Date.now()
      for (const rec of commitShifts) {
        if (rec.prev === null || rec.next === null) continue
        const reason = activeClassifier(rec.path, rec.prev, rec.next, ts)
        const shift = makeShift(rec.path, rec.prev, rec.next, ts, reason)
        if (shift !== null) sessionShifts.push(shift)
      }
    }

    // Production path: storm-detection + silvery:cls logging. Only runs
    // when env-gated — test-time captures don't pollute the storm history
    // (independent buffers, independent thresholds).
    if (!envEnabled) return
    if (commitShifts.length === 0) return

    const now = performance.now()
    let stormPaths = 0
    for (const rec of commitShifts) {
      const stormForPath = recordShift(rec, now)
      if (stormForPath) stormPaths++
      log.debug?.("shift", { path: rec.path, prev: rec.prev, next: rec.next, dtMs: rec.dtMs })
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

  function beginCapture(classifier?: ReasonClassifier): void {
    if (capturing) {
      throw new Error(
        "ClsMonitor.beginCapture: already capturing. Call endCapture() or cancelCapture() before starting a new window.",
      )
    }
    capturing = true
    activeClassifier = classifier ?? defaultClassifier
    sessionShifts = []
  }

  function endCapture(): CLSReport {
    if (!capturing) {
      throw new Error("ClsMonitor.endCapture: not capturing. Call beginCapture() first.")
    }
    const report = aggregateReport(sessionShifts)
    capturing = false
    activeClassifier = defaultClassifier
    sessionShifts = []
    // Honors SILVERY_STRICT=cls — throws UnexpectedLayoutShiftError when
    // tier 2 strict is active and the window saw any "unexpected" shifts.
    // No-op when strict isn't engaged.
    assertNoUnexpectedShifts(report)
    return report
  }

  function cancelCapture(): void {
    capturing = false
    activeClassifier = defaultClassifier
    sessionShifts = []
  }

  return { onCommit, reset, beginCapture, endCapture, cancelCapture }
}
