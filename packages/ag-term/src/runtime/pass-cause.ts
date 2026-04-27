/**
 * pass-cause.ts — Renderer feedback-edge instrumentation.
 *
 * Captures the cause of each render/layout pass beyond pass 1. The convergence
 * loop in `renderer.ts` (singlePassLayout / classic) and `create-app.tsx`
 * (processEventBatch flush loop) iterate until `hadReactCommit` is false. Each
 * extra pass is a "feedback edge": some computation in pass N caused React
 * state to change, which forces pass N+1.
 *
 * This module attributes each extra pass to a category (PassCause) and an
 * originating identity (node id, signal name, etc.) so we can answer "what
 * keeps the loop alive?". The data feeds C3b (bounded-convergence) — once we
 * know which feedback edges dominate, we can replace MAX_SINGLE_PASS_ITERATIONS
 * with attributed bounds (e.g. "scrollto-settle bounded to 1 extra pass" +
 * "text-measurement-feedback bounded to 0 extra passes by construction").
 *
 * Default behaviour (SILVERY_INSTRUMENT unset): all functions are inert
 * no-ops. The dispatch checks `instrumentEnabled` once per call and short-
 * circuits — the hot path pays at most one boolean read per emit point.
 *
 * Tracking: km-silvery.renderer-feedback-trace
 */

/**
 * Categories of feedback edges that can trigger an extra render/layout pass.
 *
 * - text-measurement-feedback: measure-phase produced a constraint that
 *   required a re-layout (e.g. fit-content binary-search shrink-wrap).
 * - viewport-dependent: a computation depends on the post-layout viewport
 *   (e.g. virtualizer window, scroll-container content extent).
 * - scrollto-settle: a `scrollTo` prop change required the layout pass to
 *   adjust scroll offset, which may shift child layout.
 * - resize-resettle: terminal dims changed mid-batch; layout was re-run with
 *   the new constraints.
 * - layout-invalidate: a layout signal (boxRect, scrollRect, screenRect, etc.)
 *   value changed, firing useBoxRect / useScrollRect subscribers that
 *   committed React state.
 * - unknown: pass cause could not be attributed to a more specific category.
 */
export type PassCause =
  | "text-measurement-feedback"
  | "viewport-dependent"
  | "scrollto-settle"
  | "resize-resettle"
  | "layout-invalidate"
  | "unknown"

export interface PassCauseRecord {
  cause: PassCause
  /** Optional originating node id (or other stable identity). */
  nodeId?: string | number
  /** Optional edge name (e.g. signal name, prop name). */
  edge?: string
  /** Optional free-form detail (kept short — not for prose). */
  detail?: string
}

export interface PassHistogramEntry {
  cause: PassCause
  count: number
  /** Top contributing edges (signal/prop names) sorted by count desc. */
  topEdges: { edge: string; count: number }[]
  /** Top contributing node ids sorted by count desc. */
  topNodes: { nodeId: string | number; count: number }[]
}

export interface PassHistogram {
  /** Total `recordPassCause` calls captured. */
  totalRecords: number
  /** Per-pass-index counts (index 0 = "pass cause for transition pass-0 → pass-1"). */
  perPass: number[]
  /** Per-cause aggregates with top edges/nodes. */
  byCause: PassHistogramEntry[]
}

const instrumentEnabled = process.env.SILVERY_INSTRUMENT === "1"

interface AggregateState {
  records: PassCauseRecord[]
  perPass: number[]
}

/** Active pass-index for the current convergence loop (0-indexed). */
let currentPassIndex = 0
let aggregate: AggregateState = { records: [], perPass: [] }

/** True when the SILVERY_INSTRUMENT env var is set to "1". */
export function isInstrumentEnabled(): boolean {
  return instrumentEnabled
}

/**
 * Reset the pass-cause tracker for a fresh convergence loop. Called at the top
 * of `doRender()`'s convergence loop (singlePassLayout/classic) and the
 * production processEventBatch flush loop.
 */
export function beginConvergenceLoop(): void {
  if (!instrumentEnabled) return
  currentPassIndex = 0
}

/**
 * Mark the start of pass N. Called at the top of each iteration of the
 * convergence loop. `passIndex` is 0-based.
 */
export function beginPass(passIndex: number): void {
  if (!instrumentEnabled) return
  currentPassIndex = passIndex
}

/**
 * Record that a feedback edge fired during the current pass. The cause will
 * be attributed to the *next* pass (the pass it triggers) when it actually
 * runs. Cheap: appends to an array.
 *
 * Call sites should use the cause that best describes WHY the next pass is
 * needed. When in doubt prefer "layout-invalidate" with the signal name as
 * `edge`, or "unknown" if the trigger is genuinely opaque.
 */
export function recordPassCause(record: PassCauseRecord): void {
  if (!instrumentEnabled) return
  // Stamp pass-index of the *triggering* pass so readers can compute
  // "pass N's commit caused pass N+1".
  aggregate.records.push(record)
}

/**
 * Mark that pass N committed React work that will require pass N+1. Bumps the
 * per-pass-index counter so the histogram can show "how many passes had
 * extra-pass causes attributed to them?" alongside the cause breakdown.
 */
export function notePassCommit(passIndex: number): void {
  if (!instrumentEnabled) return
  while (aggregate.perPass.length <= passIndex) {
    aggregate.perPass.push(0)
  }
  aggregate.perPass[passIndex] = (aggregate.perPass[passIndex] ?? 0) + 1
}

/**
 * Returns a snapshot of the current pass-cause histogram. Aggregates over all
 * convergence loops since the last `resetPassHistogram()`.
 */
export function getPassHistogram(): PassHistogram {
  if (!instrumentEnabled) {
    return { totalRecords: 0, perPass: [], byCause: [] }
  }
  const byCauseMap = new Map<
    PassCause,
    {
      count: number
      edges: Map<string, number>
      nodes: Map<string | number, number>
    }
  >()
  for (const r of aggregate.records) {
    let entry = byCauseMap.get(r.cause)
    if (!entry) {
      entry = { count: 0, edges: new Map(), nodes: new Map() }
      byCauseMap.set(r.cause, entry)
    }
    entry.count += 1
    if (r.edge) entry.edges.set(r.edge, (entry.edges.get(r.edge) ?? 0) + 1)
    if (r.nodeId !== undefined) {
      entry.nodes.set(r.nodeId, (entry.nodes.get(r.nodeId) ?? 0) + 1)
    }
  }
  const byCause: PassHistogramEntry[] = []
  for (const [cause, entry] of byCauseMap) {
    const topEdges = [...entry.edges.entries()]
      .map(([edge, count]) => ({ edge, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
    const topNodes = [...entry.nodes.entries()]
      .map(([nodeId, count]) => ({ nodeId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
    byCause.push({ cause, count: entry.count, topEdges, topNodes })
  }
  byCause.sort((a, b) => b.count - a.count)
  return {
    totalRecords: aggregate.records.length,
    perPass: aggregate.perPass.slice(),
    byCause,
  }
}

/** Clear all captured records. Test runner setup hook. */
export function resetPassHistogram(): void {
  aggregate = { records: [], perPass: [] }
  currentPassIndex = 0
}

/**
 * Format the histogram as a one-screen text summary. Stable for diffing in
 * markdown reports.
 */
export function formatPassHistogram(h: PassHistogram = getPassHistogram()): string {
  if (h.totalRecords === 0) {
    return "pass-cause histogram: no extra passes recorded"
  }
  const lines: string[] = []
  lines.push(`pass-cause histogram: ${h.totalRecords} extra-pass causes`)
  if (h.perPass.length > 0) {
    lines.push(
      "  per-pass commits: " +
        h.perPass
          .map((c, i) => (c > 0 ? `pass${i}=${c}` : null))
          .filter((s) => s !== null)
          .join(" "),
    )
  }
  for (const entry of h.byCause) {
    const pct = ((entry.count / h.totalRecords) * 100).toFixed(1)
    lines.push(`  ${entry.cause}: ${entry.count} (${pct}%)`)
    if (entry.topEdges.length > 0) {
      lines.push(
        "    edges: " + entry.topEdges.map((e) => `${e.edge}×${e.count}`).join(", "),
      )
    }
    if (entry.topNodes.length > 0) {
      lines.push(
        "    nodes: " + entry.topNodes.map((n) => `${n.nodeId}×${n.count}`).join(", "),
      )
    }
  }
  return lines.join("\n")
}

/** Print histogram to stderr (test runner / app teardown). No-op if disabled. */
export function printPassHistogram(): void {
  if (!instrumentEnabled) return
  const h = getPassHistogram()
  if (h.totalRecords === 0) return
  process.stderr.write("\n" + formatPassHistogram(h) + "\n")
}

/**
 * Internal: read current pass index. Used by emit sites that want to attach
 * the triggering pass to a record post-hoc.
 */
export function _currentPassIndex(): number {
  return currentPassIndex
}
