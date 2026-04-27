/**
 * pass-cause.ts — Renderer feedback-edge instrumentation, loggily-native.
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
 * with attributed bounds.
 *
 * ## Design (post dual-pro review, 2026-04-26)
 *
 * Pass-causes are CATEGORICAL events, not duration spans. Both GPT-5.4 Pro
 * and Kimi K2.6 converged on:
 *
 * - Use `log.debug?.("pass", { cause, edge, nodeId, producerPhase })` —
 *   not `log.span()`. Spans imply duration; a pass-cause is instantaneous
 *   and would log spurious 0ms entries that pollute traces.
 * - Aggregate via a custom pipeline Stage that captures `LogEvent.props`,
 *   not via loggily's MetricsCollector (which is duration-only).
 * - Default-off via `DEBUG=silvery:passes` (or `LOG_LEVEL=debug` for the
 *   namespace) — loggily's idiomatic gate for log events.
 * - For tests: the aggregator stage is composable; tests can inspect
 *   the singleton or build a fresh logger with their own stage.
 *
 * The `INSTRUMENT` constant remains as a hot-path safety gate so emit
 * sites pay no cost when the env var is unset (JS engines fold the
 * `if (INSTRUMENT)` block; loggily's `?.` adds a second layer of
 * level-based filtering that drops debug events at info/warn level).
 *
 * Tracking: km-silvery.renderer-feedback-trace
 */

import { createLogger, type ConditionalLogger, type Stage, type Event } from "loggily"

/**
 * Categories of feedback edges that can trigger an extra render/layout pass.
 *
 * The taxonomy is **constrained to categories with a real producer path** in
 * the silvery pipeline. The C3a v2 enum scaffolded 14 prospective categories
 * after a dual-pro review (GPT-5.4 + Kimi K2.6, 2026-04-26); C3b's audit
 * confirmed 9 of those had no production emitter and were either subsumed
 * by an existing category or required a feature silvery does not have
 * (font fallback, async images, decoration loops). Those are removed —
 * keeping unused enum members bloats the discriminated-union and signals
 * "we expect to emit this" when no path will.
 *
 * Subscriber feedback (genuine pass causes):
 * - layout-invalidate: rect signal value changed AND a subscriber consumed
 *   it (gated on `hasLayoutSignals(node)` — see notifyLayoutSubscribers).
 *
 * Measure-phase feedback:
 * - intrinsic-shrinkwrap: fit-content / snug-content sizing changed parent
 *   dimensions across passes (the binary-search-then-resize edge).
 *
 * Layout side-effects:
 * - scrollto-settle: scrollTo prop change forced an offset adjustment.
 * - sticky-resettle: sticky child offsets caused another pass.
 *
 * Convergence-loop root triggers (depth-0; not feedback per se):
 * - viewport-resize: terminal dims changed; treated as a root trigger.
 *
 * Catch-all:
 * - unknown: pass committed React work but no specific cause was emitted.
 *   Should always be 0 in steady-state — non-zero count signals a missing
 *   PassCause category or a pure-React feedback loop the pipeline isn't
 *   aware of.
 *
 * Removed (no producer path; either deletion or subsumed by existing
 * category — see hub/silvery/design/convergence-bounds.md for the audit):
 * - wrap-reflow: subsumed by intrinsic-shrinkwrap (silvery wraps inside
 *   computeSnugContentWidth, no separate producer)
 * - font-metrics-changed: terminals have fixed cell width, no font fallback
 * - decoration-remap: useDecorations subscribers fire as layout-invalidate
 * - focus-scroll-into-view: programmatic scroll already fires scrollto-settle
 * - async-image-size: silvery's Kitty graphics protocol sets dims at register
 *   time, not lazy
 * - theme-metric-changed: setState path, not a within-frame loop
 * - resize-resettle: rect changes after resize already fire as layout-invalidate
 * - viewport-dependent: legacy bucket replaced by viewport-resize
 * - text-measurement-feedback: legacy bucket replaced by intrinsic-shrinkwrap
 */
export type PassCause =
  | "layout-invalidate"
  | "intrinsic-shrinkwrap"
  | "scrollto-settle"
  | "sticky-resettle"
  | "viewport-resize"
  | "unknown"

/** Phase that produced the feedback edge. */
export type ProducerPhase =
  | "measure"
  | "layout"
  | "scroll"
  | "sticky"
  | "scrollrect"
  | "decoration"
  | "content"
  | "output"
  | "renderer"
  | "react-effect"

export interface PassCauseRecord {
  cause: PassCause
  /** Originating node id (or other stable identity). */
  nodeId?: string | number
  /** Edge name (e.g. signal name, prop name). */
  edge?: string
  /** Pipeline phase that produced the feedback. */
  producerPhase?: ProducerPhase
  /** Free-form detail (kept short — not for prose). */
  detail?: string
}

export interface PassHistogramEntry {
  cause: PassCause
  count: number
  topEdges: { edge: string; count: number }[]
  topNodes: { nodeId: string | number; count: number }[]
}

export interface PassHistogram {
  totalRecords: number
  perPass: number[]
  byCause: PassHistogramEntry[]
}

/**
 * Module-level instrumentation gate. Constant so JS engines can fold the
 * `if (INSTRUMENT) { ... }` blocks at every emit site out of the hot path.
 *
 * Mapping to loggily:
 * - SILVERY_INSTRUMENT=1 implies LOG_LEVEL=debug + DEBUG=silvery:passes
 *   for the silvery:passes namespace, so the loggily pipeline accepts
 *   debug-level events (default level is info, which would drop them).
 *
 * The two gates compose:
 * - INSTRUMENT controls the silvery side (emit-call evaluation, prop
 *   allocation).
 * - DEBUG/LOG_LEVEL controls the loggily side (which sinks/stages see
 *   the event).
 */
export const INSTRUMENT = process.env.SILVERY_INSTRUMENT === "1"
const instrumentEnabled = INSTRUMENT

/** True when the SILVERY_INSTRUMENT env var is set to "1". */
export function isInstrumentEnabled(): boolean {
  return instrumentEnabled
}

// =============================================================================
// Aggregator — captures categorical pass-cause data from log events.
// =============================================================================

interface AggregatorState {
  records: PassCauseRecord[]
  perPass: number[]
}

/**
 * Pipeline-stage-shaped aggregator. The `stage` is attached to a loggily
 * pipeline; it captures `pass` events emitted under the `silvery:passes`
 * namespace into its categorical store.
 *
 * Tests can construct fresh aggregators and attach them to test loggers;
 * the module's default singleton `passAggregator` is what production
 * (and the vitest setup) uses.
 */
export interface PassCauseAggregator {
  /** Loggily pipeline stage — attach to logger config to capture events. */
  readonly stage: Stage
  /** Snapshot the current histogram. */
  getHistogram(): PassHistogram
  /** Format histogram as a human-readable summary. */
  formatSummary(): string
  /** Clear all captured records. */
  reset(): void
  /** Record a per-pass-index commit (so we know convergence depth). */
  notePassCommit(passIndex: number): void
  /** Mark the start of a pass (used for unknown synthesis). */
  beginPass(passIndex: number): void
  /** Reset before a fresh convergence loop. */
  beginConvergenceLoop(): void
  /** Append a JSON snapshot to a file (test-runner exit hook). */
  appendJson(file: string): void
}

export function createPassCauseAggregator(): PassCauseAggregator {
  let state: AggregatorState = { records: [], perPass: [] }
  let recordsAtPassStart = 0

  const stage: Stage = (event: Event): Event => {
    // We only care about silvery:passes log events with message="pass".
    if (event.kind !== "log") return event
    if (event.namespace !== "silvery:passes") return event
    if (event.message !== "pass") return event
    const props = event.props as Partial<PassCauseRecord> | undefined
    if (!props?.cause) return event
    state.records.push({
      cause: props.cause,
      nodeId: props.nodeId,
      edge: props.edge,
      producerPhase: props.producerPhase,
      detail: props.detail,
    })
    return event
  }

  function getHistogram(): PassHistogram {
    const byCauseMap = new Map<
      PassCause,
      {
        count: number
        edges: Map<string, number>
        nodes: Map<string | number, number>
      }
    >()
    for (const r of state.records) {
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
      totalRecords: state.records.length,
      perPass: state.perPass.slice(),
      byCause,
    }
  }

  function formatSummary(): string {
    const h = getHistogram()
    if (h.totalRecords === 0) return "pass-cause histogram: no extra passes recorded"
    const lines: string[] = []
    lines.push(`pass-cause histogram: ${h.totalRecords} extra-pass causes`)
    if (h.perPass.length > 0) {
      const perPassLine = h.perPass
        .map((c, i) => (c > 0 ? `pass${i}=${c}` : null))
        .filter((s) => s !== null)
        .join(" ")
      if (perPassLine) lines.push(`  per-pass commits: ${perPassLine}`)
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

  function reset(): void {
    state = { records: [], perPass: [] }
    recordsAtPassStart = 0
  }

  function notePassCommit(passIndex: number): void {
    while (state.perPass.length <= passIndex) state.perPass.push(0)
    state.perPass[passIndex] = (state.perPass[passIndex] ?? 0) + 1
    // If no specific cause was emitted between beginPass and notePassCommit,
    // synthesize an "unknown" record. This converts "no data for this pass"
    // into observable signal — C3b can read the unknown count to know
    // whether the enum is missing categories for some commit-causing edge.
    if (state.records.length === recordsAtPassStart) {
      state.records.push({
        cause: "unknown",
        detail: `pass-${passIndex}-uncategorized-commit`,
      })
    }
  }

  function beginPass(_passIndex: number): void {
    recordsAtPassStart = state.records.length
  }

  function beginConvergenceLoop(): void {
    recordsAtPassStart = state.records.length
  }

  function appendJson(file: string): void {
    const h = getHistogram()
    if (h.totalRecords === 0) return
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs")
    fs.appendFileSync(file, JSON.stringify(h) + "\n")
  }

  return {
    stage,
    getHistogram,
    formatSummary,
    reset,
    notePassCommit,
    beginPass,
    beginConvergenceLoop,
    appendJson,
  }
}

// =============================================================================
// Module-singleton logger + aggregator.
// =============================================================================
//
// Wired together at module load. The logger's pipeline includes:
//   - level: debug for the silvery:passes namespace
//   - the aggregator stage (which captures categorical data)
//
// Default behaviour (SILVERY_INSTRUMENT unset): the aggregator stage is
// still wired in but no events ever reach it because emit sites are gated
// by INSTRUMENT.
//
// When SILVERY_INSTRUMENT=1, emit sites call `passLog.debug?.("pass", ...)`
// and loggily's pipeline routes the event through the aggregator stage.

const passAggregator = createPassCauseAggregator()

/** The singleton aggregator — used by tests and tooling to read counts. */
export function getPassAggregator(): PassCauseAggregator {
  return passAggregator
}

/**
 * Pass-cause logger. Namespace `silvery:passes`. Default level is `debug` so
 * recordPassCause's `?.` short-circuits except when the env enables debug.
 *
 * The aggregator stage is always attached — it's a no-op when no events
 * arrive, and the INSTRUMENT gate at emit sites prevents events when the
 * env var is unset.
 */
const passLog: ConditionalLogger = createLogger("silvery:passes", [
  // When SILVERY_INSTRUMENT=1, raise this namespace's level to debug so
  // emit sites' `?.debug` calls actually dispatch.
  { level: instrumentEnabled ? "debug" : "info" },
  passAggregator.stage,
])

// =============================================================================
// Public API — back-compat shape preserved so existing call sites in
// renderer.ts / layout-phase.ts / measure-phase.ts / runtime/renderer.ts /
// runtime/create-app.tsx don't need to change.
// =============================================================================

/**
 * Reset the per-loop pass-index tracker. Called at the top of each
 * convergence loop in renderer.ts / runtime/create-app.tsx.
 */
export function beginConvergenceLoop(): void {
  if (!instrumentEnabled) return
  passAggregator.beginConvergenceLoop()
}

/** Mark the start of pass N (0-based). */
export function beginPass(passIndex: number): void {
  if (!instrumentEnabled) return
  passAggregator.beginPass(passIndex)
}

/**
 * Record that a feedback edge fired during the current pass.
 *
 * Emits via loggily — `passLog.debug?.("pass", record)` — so that the
 * aggregator stage receives the event and the rest of the pipeline can
 * see it (DEBUG=silvery:passes prints to console, etc.).
 */
export function recordPassCause(record: PassCauseRecord): void {
  if (!instrumentEnabled) return
  passLog.debug?.("pass", record as unknown as Record<string, unknown>)
}

/**
 * Mark that pass N committed React work that will require pass N+1.
 * Bumps the per-pass-index counter and synthesizes an "unknown" record
 * if no specific cause was emitted during pass N.
 */
export function notePassCommit(passIndex: number): void {
  if (!instrumentEnabled) return
  passAggregator.notePassCommit(passIndex)
}

/** Snapshot the current pass-cause histogram. */
export function getPassHistogram(): PassHistogram {
  if (!instrumentEnabled) {
    return { totalRecords: 0, perPass: [], byCause: [] }
  }
  return passAggregator.getHistogram()
}

/** Clear all captured records. */
export function resetPassHistogram(): void {
  passAggregator.reset()
}

/** Format the histogram as a one-screen text summary. */
export function formatPassHistogram(_h?: PassHistogram): string {
  return passAggregator.formatSummary()
}

/**
 * Print histogram to stderr (test runner / app teardown). No-op if
 * instrumentation is disabled or no records exist.
 *
 * In test environments where stdout/stderr are intercepted, write to
 * SILVERY_INSTRUMENT_FILE instead.
 */
export function printPassHistogram(): void {
  if (!instrumentEnabled) return
  const h = passAggregator.getHistogram()
  if (h.totalRecords === 0) return
  const formatted = passAggregator.formatSummary()
  const file = process.env.SILVERY_INSTRUMENT_FILE
  if (file) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs")
    fs.appendFileSync(file, "\n" + formatted + "\n")
    return
  }
  process.stderr.write("\n" + formatted + "\n")
}

/** Append a JSON snapshot to a file (vitest exit hook). */
export function appendHistogramJson(file: string): void {
  if (!instrumentEnabled) return
  passAggregator.appendJson(file)
}

// =============================================================================
// Bounded-convergence (C3b)
// =============================================================================

/**
 * Per-cause convergence bound: maximum extra passes (beyond the initial pass)
 * each PassCause category can structurally trigger before settling. Each
 * bound is an invariant of how the cause works in the pipeline — not a
 * histogram observation — and the math is documented in
 * `hub/silvery/design/convergence-bounds.md`.
 *
 * Empirical baseline (C3a v3 corpus, 105 termless app teardowns,
 * 11 538 records): no test reached pass 1+. The structural ceiling matches:
 * sum(PASS_CAUSE_BOUNDS) = 0, plus 1 initial pass + 1 settle pass = MAX=2.
 *
 * Why every cause's bound is 0:
 * - layout-invalidate: when a subscriber re-renders, the new layout produces
 *   the SAME rects (idempotent given same input) so the second
 *   notifyLayoutSubscribers reports no change. The settle pass drains the
 *   subscribers' commits; it doesn't seed new feedback.
 * - intrinsic-shrinkwrap: measurement is content-deterministic; same tree
 *   produces same shrunkWidth / fitContentHeight on the next pass.
 * - scrollto-settle: prevScrollTo === scrollTo guard prevents the same intent
 *   from re-firing; the recovery edge is a one-shot "target moved offscreen".
 * - sticky-resettle: stickyChildren is recomputed deterministically from
 *   layout positions — once layout is stable, sticky offsets are stable.
 * - viewport-resize: dim-change is a depth-0 root trigger, not a feedback
 *   edge. Once the new dims are observed, no further resize fires.
 * - unknown: any non-zero unknown count is a regression to surface, not
 *   budget to consume.
 *
 * The total convergence ceiling = 1 (initial) + 1 (settle) + sum of per-cause
 * bounds. Per the v3 corpus and the audit above, the per-cause bounds are
 * ALL 0 — each cause is satisfied within the single settle pass. Total = 2.
 */
export const PASS_CAUSE_BOUNDS: Readonly<Record<PassCause, number>> = {
  "layout-invalidate": 0,
  "intrinsic-shrinkwrap": 0,
  "scrollto-settle": 0,
  "sticky-resettle": 0,
  "viewport-resize": 0,
  unknown: 0,
} as const

/**
 * Total convergence bound: 1 (initial) + 1 (one settle pass) + sum of
 * PASS_CAUSE_BOUNDS = 2. Replaces the historical magic constants
 * `MAX_SINGLE_PASS_ITERATIONS = 15`, `MAX_LAYOUT_ITERATIONS = 5`,
 * `MAX_EFFECT_FLUSHES = 5`, and `maxFlushes = 5` in the renderer's
 * convergence loops. Empirical envelope was pass 0 → 1; structural ceiling
 * matches.
 */
export const MAX_CONVERGENCE_PASSES =
  1 + // initial pass
  1 + // canonical settle pass — drains subscriber commits within the settle
  PASS_CAUSE_BOUNDS["layout-invalidate"] +
  PASS_CAUSE_BOUNDS["intrinsic-shrinkwrap"] +
  PASS_CAUSE_BOUNDS["scrollto-settle"] +
  PASS_CAUSE_BOUNDS["sticky-resettle"] +
  PASS_CAUSE_BOUNDS["viewport-resize"] +
  PASS_CAUSE_BOUNDS.unknown

/**
 * Loops that wrap their iterations in the bound assertion. Used as the
 * `loopName` argument to `assertBoundedConvergence` so an over-budget
 * regression names the offending loop.
 */
export type ConvergenceLoopName =
  | "single-pass"
  | "classic"
  | "effect-flush"
  | "production-flush"

/**
 * Assert the convergence loop did not exceed MAX_CONVERGENCE_PASSES.
 * Called from the renderer's loops + create-app's processEventBatch flush
 * loop. No-op outside SILVERY_STRICT — the loop bound itself is the
 * production safety net.
 *
 * STRICT=2: throws with a per-cause breakdown so a regression names the
 *   responsible edge instead of just "exhausted N iterations".
 * STRICT=1: emits a stderr warning with the same breakdown.
 */
export function assertBoundedConvergence(
  passCount: number,
  loopName: ConvergenceLoopName,
): void {
  if (passCount <= MAX_CONVERGENCE_PASSES) return
  const strict = process?.env?.SILVERY_STRICT
  if (!strict) return
  const h = getPassHistogram()
  const breakdown = h.byCause
    .map((e) => `${e.cause}=${e.count}(bound=${PASS_CAUSE_BOUNDS[e.cause]})`)
    .join(", ")
  const msg =
    `convergence bound exceeded in ${loopName}: ${passCount} passes ran ` +
    `but MAX_CONVERGENCE_PASSES=${MAX_CONVERGENCE_PASSES}. ` +
    `Per-cause breakdown: ${breakdown || "(no records — INSTRUMENT off)"}. ` +
    `Either a feedback edge broke its per-cause invariant, or a new edge ` +
    `needs a PassCause category in pass-cause.ts.`
  if (strict === "2") throw new Error(msg)
  process.stderr.write(`[silvery] ${msg}\n`)
}
