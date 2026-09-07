/**
 * renderer.ts — `doRender` + render-guardrail helpers extracted from
 * `create-app.tsx` for clarity and test-ability.
 *
 * These pieces used to live as closures inside `createApp()` and captured
 * a large amount of the surrounding state. They are now factored into:
 *
 *   - `createRenderer(opts)` — returns the `doRender` function plus the
 *     render-adjacent overlay helpers. Each closure maintains its own
 *     `_ag` / `_lastTermBuffer` / `_renderCount` state.
 *
 * The factory approach (rather than a class) keeps fit with silvery's
 * no-classes house style and makes it trivial to unit-test a renderer
 * against a mock runtime if we ever want to.
 *
 * See `create-app.tsx` for the full integration; this file is not
 * intended to be used outside that module (no public barrel export).
 */

import { writeDumpFile } from "./dump-file"
import { reconciler, getContainerRoot } from "@silvery/ag-react/reconciler"
import { createAg, type Ag } from "../ag"
import { runWithMeasurer } from "../unicode"
import { createBuffer } from "./create-buffer"
import {
  isAnyDirty,
  isDirty,
  CONTENT_BIT,
  STYLE_PROPS_BIT,
  BG_BIT,
  CHILDREN_BIT,
  SUBTREE_BIT,
} from "@silvery/ag/epoch"
import { commitLayoutSnapshot } from "@silvery/ag/layout-signals"
import { IncrementalRenderMismatchError } from "../scheduler"
import { isStrictEnabled } from "../strict-mode"
import {
  markLayoutTreeDirty,
  FRESH_LAYOUT_STRICT_SLUG,
  FRESH_LAYOUT_STRICT_MIN_TIER,
} from "../pipeline"
import { emitRenderDispatched, isRenderTraceEnabled } from "./render-trace"
import {
  computeMatchRanges,
  createSearchState,
  renderSearchBarPlain,
  type SearchMatch,
} from "../search-overlay"
import {
  applySelectionToBuffer,
  composeSearchHighlightCells,
  composeSelectionCells,
  type SearchHighlight,
  type SelectionTheme,
} from "../selection-renderer"
import { hexToRgb } from "../pipeline/backdrop/color"
import { INSTRUMENT, logPass, recordPassRing } from "./pass-cause"
import type { Buffer, Dims, RenderTarget } from "./types"
import type { PipelineConfig } from "../pipeline"
import type { createVirtualScrollback } from "../virtual-scrollback"
import type { TerminalBuffer } from "../buffer"
// cellEquals/bufferToText are used only on the SILVERY_STRICT trace path below.
// buffer.ts imports nothing from the runtime, so a static value import is
// cycle-free and ESM-legal (was a lazy require to defer node:fs-free buffer code).
import { cellEquals, bufferToText } from "../buffer"
import type { createFiberRoot, createContainer } from "@silvery/ag-react/reconciler"
import type { TerminalSelectionState } from "@silvery/headless/selection"
import { resolveThemeColor, type Theme } from "@silvery/ansi"
import type { AgNode } from "@silvery/ag/types"

type Scrollback = ReturnType<typeof createVirtualScrollback>
type Container = ReturnType<typeof createContainer>
type FiberRoot = ReturnType<typeof createFiberRoot>
type SearchState = ReturnType<typeof createSearchState>

/**
 * Count all nodes in an AgNode subtree (inclusive of `root`). Used only by
 * the Phase 4 render-trace fiber hash — called solely when render tracing
 * is enabled, so the O(N) walk costs nothing on the production hot path.
 */
function countAgNodes(root: AgNode): number {
  let n = 1
  for (const child of root.children) n += countAgNodes(child)
  return n
}

// ---------------------------------------------------------------------------
// Renderer factory
// ---------------------------------------------------------------------------

/**
 * Immutable options + runtime-state accessors the renderer needs. Many
 * fields are functions rather than plain values so the renderer observes
 * live-updating runtime state (e.g. `getSearchState()` sees the current
 * search after the caller mutates it).
 */
export interface RendererOptions {
  /** React element (pre-wrapped with providers) to reconcile into the container. */
  wrappedElement: import("react").ReactElement
  fiberRoot: FiberRoot
  container: Container
  runtime: {
    getDims(): Dims
    invalidate(): void
  }
  /** True when running against an alternate screen (fullscreen mode). */
  alternateScreen: boolean
  /** Pipeline config (measurer, etc.); may be absent for tests. */
  pipelineConfig: PipelineConfig | undefined
  /** When set, skip incremental rendering and always render fresh. */
  noIncremental: boolean
  /** SILVERY_STRICT guardrail toggle. */
  strictMode: boolean
  /** Resolved cell-debug coords (SILVERY_CELL_DEBUG=x,y) if provided. */
  cellDebug: { x: number; y: number } | null
  /** True iff any diagnostic flag is on (STRICT_MODE || cellDebug). */
  instrumented: boolean
  /** SILVERY_TRACE_ANSI — writes step-by-step ANSI traces to /tmp. */
  ansiTrace: boolean
  /** Shared perfLog flag — writes render timings to /tmp/silvery-perf.log. */
  perfLog: boolean
}

/** Return type for the renderer factory — closures over the internal _ag / _renderCount state. */
export interface Renderer {
  doRender(): Buffer
  /** Current render count (for diagnostics). */
  renderCount(): number
  /** Reset the render counter (used at the start of an event batch). */
  resetCount(): void
  /** True when the next render will skip incremental (noIncremental env on). */
  isIncrementalOff(): boolean
  /** Forcibly reset the internal Ag instance — called on alt-screen switches / resume. */
  resetAg(): void
  /**
   * Promote in-flight rect signals to their committed peers via
   * `commitLayoutSnapshot`. Reactive `useBoxRect()` / `useScrollRect()` /
   * `useScreenRect()` consumers read the committed signals; calling this
   * advances them by one frame and may fire `effect()` callbacks that
   * trigger React `forceUpdate`s.
   *
   * The runtime calls this exactly once per event-batch commit boundary —
   * AFTER the in-flight convergence loop has drained — so reactive consumers
   * see one stable value across every pass within a batch. See bead
   * `@km/silvery/use-deferred-box-rect-and-post-commit-observers`.
   *
   * Returns `true` when at least one committed rect advanced — i.e. it fired
   * at least one reactive subscriber forceUpdate. The runtime's post-commit
   * drain uses this to decide whether the documented "one additional pass"
   * must run to paint the subscriber update within the same event (those
   * forceUpdates are deferred-lane and do not set `pendingRerender` nor drain
   * via `flushSyncWork`). See @si/render/19436.
   */
  commitLayout(): boolean
}

/**
 * Build a `doRender` closure wired to the supplied runtime. The closure
 * manages its own long-lived `Ag` instance and tracks the last layout
 * dimensions for dimension-change detection.
 */
export function createRenderer(opts: RendererOptions): Renderer {
  let _renderCount = 0
  let _ag: Ag | null = null
  let _lastTermBuffer: TerminalBuffer | null = null
  let _lastLayoutDims: Dims | null = null
  let lastCurrentBuffer: Buffer | null = null

  function doRender(): Buffer {
    _renderCount++
    if (opts.ansiTrace) {
      process
        .getBuiltinModule("node:fs")
        .appendFileSync(
          "/tmp/silvery-trace.log",
          `--- doRender #${_renderCount} (ag=${_ag ? "reuse" : "create"}, incremental=${!opts.noIncremental}) ---\n`,
        )
    }
    const renderStart = performance.now()

    // Phase A: React reconciliation
    reconciler.updateContainerSync(opts.wrappedElement, opts.fiberRoot, null, () => {})
    reconciler.flushSyncWork()
    const reconcileMs = performance.now() - renderStart

    // Bench instrumentation: accumulate reconcile time. The pipeline accumulator
    // (set by silveryBenchStart) catches measure/layout/content/output; reconcile
    // lives outside pipeline/index.ts so we add it here.
    {
      const acc = (globalThis as { __silvery_bench_phases?: { reconcile: number } })
        .__silvery_bench_phases
      if (acc) acc.reconcile += reconcileMs
    }

    // Phase B: Render pipeline (incremental when prevBuffer available)
    const pipelineStart = performance.now()
    const rootNode = getContainerRoot(opts.container)
    const dims = opts.runtime.getDims()

    const isInline = !opts.alternateScreen

    // Create or reuse long-lived Ag instance. Created lazily because the root
    // AgNode is produced by the React reconciler in Phase A above.
    if (!_ag) {
      _ag = createAg(rootNode, {
        measurer: opts.pipelineConfig?.measurer,
        colorLevel: opts.pipelineConfig?.colorLevel,
      })
    }

    // Invalidate prevBuffer on dimension change (resize).
    // Both Ag-level (ag.resetBuffer()) and runtime-level (runtime.invalidate())
    // must be cleared — otherwise the ANSI diff compares different-sized buffers.
    //
    // In inline mode, only WIDTH changes trigger invalidation. Height changes are
    // normal (content grows/shrinks as items are added/frozen) and are handled
    // incrementally by the output phase. Invalidating on height causes the runtime's
    // prevBuffer to be null, which triggers the first-render clear path with \x1b[J
    // — wiping the entire visible screen including shell prompt content above the app.
    //
    // A same-size terminal/emulator reflow (no dimension change) is handled
    // entirely on the runtime side: `createRuntime.render()` forces a
    // clear+full-repaint of the buffer it is handed (see `resizePaintPending`
    // there). The renderer does NOT drop its incremental baseline for that
    // case — doing so desyncs the Ag's `prevBuffer` from the runtime's, which
    // re-introduces incremental-skip flakiness on the following frame. The
    // runtime repaints what the renderer already produced. Bead:
    // @km/code/v0.2/19604-focus-blank.
    if (_ag) {
      const lastDims = _lastLayoutDims
      if (lastDims) {
        const widthChanged = dims.cols !== lastDims.cols
        const heightChanged = !isInline && dims.rows !== lastDims.rows
        if (widthChanged || heightChanged) {
          _ag.resetBuffer()
          opts.runtime.invalidate()
          // Always-on violation ring (cheap, no nodeId for a root trigger).
          recordPassRing(
            "viewport-resize",
            widthChanged && heightChanged ? "wh" : widthChanged ? "w" : "h",
          )
          if (INSTRUMENT) {
            // viewport-resize is a depth-0 root trigger, not a feedback edge.
            // It's recorded so the histogram shows resize-driven cascades; any
            // follow-on rect changes attribute as `layout-invalidate` (not as
            // a separate `resize-resettle` category — that was removed in C3b
            // because it was structurally subsumed).
            logPass({
              cause: "viewport-resize",
              edge: widthChanged && heightChanged ? "wh" : widthChanged ? "w" : "h",
              producerPhase: "renderer",
              detail: `${dims.cols}x${dims.rows} from ${lastDims.cols}x${lastDims.rows}`,
            })
          }
        }
      }
    }

    // Clear diagnostic arrays before the render so we capture only this render's data.
    // INSTRUMENTED is hoisted from env vars at module load — when no diagnostic is
    // active (the hot path), all three global resets and the cell-debug setup
    // constant-fold out of the frame.
    if (opts.instrumented) {
      const g = globalThis as Record<string, unknown>
      g.__silvery_content_all = undefined
      g.__silvery_node_trace = undefined
      // Cell debug: enable during real incremental render for SILVERY_STRICT diagnosis.
      // Set SILVERY_CELL_DEBUG=x,y to trace which nodes cover a specific cell.
      // The log is captured during the render and included in any mismatch error.
      g.__silvery_cell_debug =
        opts.cellDebug !== null
          ? { x: opts.cellDebug.x, y: opts.cellDebug.y, log: [] as string[] }
          : undefined
    }

    // Early return: if reconciliation produced no dirty flags on the tree,
    // skip the pipeline entirely. This avoids cloning prevBuffer (which
    // resets dirty rows to 0), preserving the row-level dirty markers that
    // the runtime diff needs to detect actual changes.
    // Exception: dimension changes require re-layout even without dirty flags.
    const rootHasDirty = rootNode.layoutNode?.isDirty() || isAnyDirty(rootNode)
    const dimsChanged =
      _lastLayoutDims != null &&
      (dims.cols !== _lastLayoutDims.cols || (!isInline && dims.rows !== _lastLayoutDims.rows))

    // Phase 4 (Visual Eyes epic): capture the root's dirty-bit names BEFORE
    // the pipeline below consumes the flags. Read-only — no behavior change.
    // The whole block constant-folds out when render tracing is disabled.
    const renderTraceDirtyReasons: string[] = []
    if (isRenderTraceEnabled()) {
      if (isDirty(rootNode, CONTENT_BIT)) renderTraceDirtyReasons.push("content")
      if (isDirty(rootNode, STYLE_PROPS_BIT)) renderTraceDirtyReasons.push("styleProps")
      if (isDirty(rootNode, BG_BIT)) renderTraceDirtyReasons.push("bg")
      if (isDirty(rootNode, CHILDREN_BIT)) renderTraceDirtyReasons.push("children")
      if (isDirty(rootNode, SUBTREE_BIT)) renderTraceDirtyReasons.push("subtree")
      if (rootNode.layoutNode?.isDirty()) renderTraceDirtyReasons.push("layout")
    }

    if (!rootHasDirty && !dimsChanged && _lastTermBuffer && lastCurrentBuffer) {
      return lastCurrentBuffer
    }

    // When SILVERY_NO_INCREMENTAL is set, force fresh render every frame
    if (opts.noIncremental) {
      _ag.resetBuffer()
    }

    // Run layout + content render via the long-lived Ag instance.
    // The Ag manages prevBuffer internally for incremental rendering.
    // Output phase is NOT run here — the runtime handles it separately.
    _ag.layout(dims)
    // STRICT diagnostic: when SILVERY_STRICT_TRAP=x,y is set, record all writes
    // to the target cell during incremental render too.
    const strictTrapEnv = process.env.SILVERY_STRICT_TRAP
    let strictTrap: { x: number; y: number; log: string[] } | undefined
    if (opts.strictMode && strictTrapEnv) {
      const [tx, ty] = strictTrapEnv.split(",").map((n) => parseInt(n, 10))
      if (!isNaN(tx as number) && !isNaN(ty as number)) {
        strictTrap = { x: tx as number, y: ty as number, log: [] }
        ;(globalThis as any).__silvery_write_trap = strictTrap
      }
    }
    const agResult = _ag.render()
    if (strictTrap) {
      ;(globalThis as any).__silvery_write_trap = null
      ;(globalThis as any).__silvery_strict_incremental_trap = strictTrap
    }
    const incrementalRenderPhaseDetail = opts.instrumented
      ? ({
          ...(
            globalThis as {
              __silvery_content_detail?: Record<string, number | string | undefined>
            }
          ).__silvery_content_detail,
        } as Record<string, number | string | undefined>)
      : undefined
    const { buffer: termBuffer, prevBuffer: agPrevBuffer } = agResult
    const overlay = agResult.overlay
    _lastTermBuffer = termBuffer
    _lastLayoutDims = { cols: dims.cols, rows: dims.rows }
    const wasIncremental = !opts.noIncremental && agPrevBuffer !== null
    const pipelineMs = performance.now() - pipelineStart

    // Expose timing for diagnostics.
    // Output timing is 0 here — the runtime handles the output phase separately.
    ;(
      globalThis as {
        __silvery_last_pipeline?: {
          layout: number
          output: number
          total: number
          incremental: boolean
        }
      }
    ).__silvery_last_pipeline = {
      layout: pipelineMs,
      output: 0,
      total: pipelineMs,
      incremental: wasIncremental,
    }
    ;(globalThis as { __silvery_render_count?: number }).__silvery_render_count =
      ((globalThis as { __silvery_render_count?: number }).__silvery_render_count ?? 0) + 1

    // Bench instrumentation: accumulate pipeline-level timing.
    // ag.ts handles measure/layout/content accumulation; we add total here.
    {
      const acc = (
        globalThis as { __silvery_bench_phases?: { total: number; pipelineCalls: number } }
      ).__silvery_bench_phases
      if (acc) {
        acc.total += pipelineMs
        acc.pipelineCalls += 1
      }
    }

    // SILVERY_STRICT: compare incremental render against fresh render.
    // createApp bypasses Scheduler/Renderer which have this check built-in,
    // so we add it here to catch incremental rendering bugs at runtime.
    if (opts.strictMode && wasIncremental) {
      // fresh-layout STRICT slug (packet #2, @si/render/20985): the createApp
      // path renders the follow-up standalone frame (scheduleFollowupStandaloneFrame
      // in create-app.tsx), which is exactly where @si/render/19436 deferred-lane
      // layout-feedback content lands. Force an INDEPENDENT from-scratch layout for
      // the comparison baseline so a missed-dirty stale rect on that REAL frame
      // surfaces as incremental≠fresh. The legitimate one-frame-late path renders
      // its correct converged content on that same frame → incremental≡fresh →
      // green BY CONSTRUCTION (no heuristic). Mirrors the renderer.ts / scheduler.ts
      // fresh paths; see markLayoutTreeDirty + AgLayoutOptions.forceFullPropagate.
      const freshLayout = isStrictEnabled(FRESH_LAYOUT_STRICT_SLUG, FRESH_LAYOUT_STRICT_MIN_TIER)
      const doFreshRender = () => {
        const freshAg = createAg(rootNode, {
          measurer: opts.pipelineConfig?.measurer,
          colorLevel: opts.pipelineConfig?.colorLevel,
        })
        if (freshLayout) markLayoutTreeDirty(rootNode)
        freshAg.layout(
          { cols: dims.cols, rows: dims.rows },
          {
            skipLayoutNotifications: true,
            skipScrollStateUpdates: true,
            forceFullPropagate: freshLayout,
          },
        )
        return freshAg.render()
      }
      const measurer = opts.pipelineConfig?.measurer
      const { buffer: freshBuffer } = measurer
        ? runWithMeasurer(measurer, doFreshRender)
        : doFreshRender()
      for (let y = 0; y < termBuffer.height; y++) {
        for (let x = 0; x < termBuffer.width; x++) {
          const a = termBuffer.getCell(x, y)
          const b = freshBuffer.getCell(x, y)
          if (!cellEquals(a, b)) {
            // Use cell debug log collected during the real incremental render
            let cellDebugInfo = ""
            const savedCellDbg = (
              globalThis as { __silvery_cell_debug?: { x: number; y: number; log: string[] } }
            ).__silvery_cell_debug
            if (savedCellDbg?.x === x && savedCellDbg.y === y && savedCellDbg.log.length > 0) {
              cellDebugInfo = `\nCELL DEBUG (${savedCellDbg.log.length} entries for (${x},${y})):\n${savedCellDbg.log.join("\n")}\n`
            } else if (savedCellDbg?.x === x && savedCellDbg.y === y) {
              cellDebugInfo = `\nCELL DEBUG: No nodes cover (${x},${y}) during incremental render\n`
            } else {
              cellDebugInfo = `\nCELL DEBUG: Target cell (${x},${y}) differs from debug cell (${savedCellDbg?.x},${savedCellDbg?.y})\n`
            }

            // Re-run fresh render with write trap to capture what writes to the mismatched cell
            let trapInfo = ""
            const trap = { x, y, log: [] as string[] }
            ;(
              globalThis as {
                __silvery_write_trap?: { x: number; y: number; log: string[] } | null
              }
            ).__silvery_write_trap = trap
            try {
              if (measurer) {
                runWithMeasurer(measurer, doFreshRender)
              } else {
                doFreshRender()
              }
            } catch {
              // ignore
            }
            ;(
              globalThis as {
                __silvery_write_trap?: { x: number; y: number; log: string[] } | null
              }
            ).__silvery_write_trap = null
            if (trap.log.length > 0) {
              trapInfo = `\nFRESH WRITE TRAP (${trap.log.length} writes to (${x},${y})):\n${trap.log.join("\n")}\n`
            } else {
              trapInfo = `\nFRESH WRITE TRAP: NO WRITES to (${x},${y})\n`
            }
            // Also include INCREMENTAL trap captured during the failing render
            const incrementalTrap = (
              globalThis as {
                __silvery_strict_incremental_trap?: { x: number; y: number; log: string[] }
              }
            ).__silvery_strict_incremental_trap
            if (incrementalTrap?.x === x && incrementalTrap.y === y) {
              if (incrementalTrap.log.length > 0) {
                trapInfo =
                  `\nINCREMENTAL WRITE TRAP (${incrementalTrap.log.length} writes to (${x},${y})):\n${incrementalTrap.log.join("\n")}\n` +
                  trapInfo
              } else {
                trapInfo = `\nINCREMENTAL WRITE TRAP: NO WRITES to (${x},${y})\n` + trapInfo
              }
            }
            const incText = bufferToText(termBuffer)
            const freshText = bufferToText(freshBuffer)
            const cellStr = (c: typeof a) =>
              `char=${JSON.stringify(c.char)} fg=${c.fg} bg=${c.bg} ulColor=${c.underlineColor} wide=${c.wide} cont=${c.continuation} attrs={bold=${c.attrs.bold},dim=${c.attrs.dim},italic=${c.attrs.italic},ul=${c.attrs.underline},ulStyle=${c.attrs.underlineStyle},blink=${c.attrs.blink},inv=${c.attrs.inverse},hidden=${c.attrs.hidden},strike=${c.attrs.strikethrough}}`
            const contentAll = (globalThis as { __silvery_content_all?: unknown[] })
              .__silvery_content_all
            const statsStr = contentAll
              ? `\n--- render phase stats (${contentAll.length} calls) ---\n` +
                contentAll
                  .map((s: unknown, i: number) => {
                    const x = s as Record<string, unknown>
                    return (
                      `  #${i}: visited=${x.nodesVisited} rendered=${x.nodesRendered} skipped=${x.nodesSkipped} ` +
                      `clearOps=${x.clearOps} cascade="${x.cascadeNodes}" ` +
                      `flags={C=${x.flagContentDirty} P=${x.flagStylePropsDirty} L=${x.flagLayoutChanged} ` +
                      `S=${x.flagSubtreeDirty} Ch=${x.flagChildrenDirty} CP=${x.flagChildPositionChanged} AL=${x.flagAncestorLayoutChanged} noPrev=${x.noPrevBuffer}} ` +
                      `scroll={containers=${x.scrollContainerCount} cleared=${x.scrollViewportCleared} reason="${x.scrollClearReason}"} ` +
                      `normalRepaint="${x.normalRepaintReason}" ` +
                      `prevBuf={null=${x._prevBufferNull} dimMismatch=${x._prevBufferDimMismatch} hasPrev=${x._hasPrevBuffer} ` +
                      `layout=${x._layoutW}x${x._layoutH} prev=${x._prevW}x${x._prevH}}`
                    )
                  })
                  .join("\n")
              : ""
            const msg =
              `SILVERY_STRICT (createApp): MISMATCH at (${x}, ${y}) on render #${_renderCount}\n` +
              `  incremental: ${cellStr(a)}\n` +
              `  fresh:       ${cellStr(b)}` +
              statsStr +
              (() => {
                const traces = (globalThis as { __silvery_node_trace?: unknown[][] })
                  .__silvery_node_trace
                if (!traces || traces.length === 0) return ""
                let out = "\n--- node trace ---"
                for (let ti = 0; ti < traces.length; ti++) {
                  out += `\n  renderPhase #${ti}:`
                  for (const t of traces[ti] as Record<string, unknown>[]) {
                    out += `\n    ${t.decision} ${t.id}(${t.type})@${t.depth} rect=${t.rect} prev=${t.prevLayout}`
                    out += ` hasPrev=${t.hasPrev} ancClr=${t.ancestorCleared} flags=[${t.flags}] layout∆=${t.layoutChanged}`
                    if (t.decision === "RENDER") {
                      out += ` caa=${t.contentAreaAffected} crc=${t.contentRegionCleared} cnfr=${t.childrenNeedFreshRender}`
                      out += ` childPrev=${t.childHasPrev} childAnc=${t.childAncestorCleared} skipBg=${t.skipBgFill} bg=${t.bgColor ?? "none"}`
                    }
                  }
                }
                return out
              })() +
              cellDebugInfo +
              trapInfo +
              `\n--- incremental ---\n${incText}\n--- fresh ---\n${freshText}`
            // Dump full diagnostics to temp file — alt screen hides stderr
            const dumpPath = writeDumpFile("strict-failure", msg)
            throw new IncrementalRenderMismatchError(
              dumpPath ? `${msg.split("\n")[0]}\n  dump: ${dumpPath}` : msg,
            )
          }
        }
      }
      if (opts.perfLog) {
        process
          .getBuiltinModule("node:fs")
          .appendFileSync(
            "/tmp/silvery-perf.log",
            `SILVERY_STRICT (createApp): render #${_renderCount} OK\n`,
          )
      }
    }

    // STRICT fresh-render comparison reuses the render pipeline and therefore
    // overwrites __silvery_content_detail. Restore the real incremental pass
    // before perf logging and render-trace emission sample it.
    if (incrementalRenderPhaseDetail) {
      ;(
        globalThis as { __silvery_content_detail?: typeof incrementalRenderPhaseDetail }
      ).__silvery_content_detail = incrementalRenderPhaseDetail
    }

    const buf = createBuffer(termBuffer, rootNode, overlay)
    lastCurrentBuffer = buf
    if (opts.perfLog) {
      const renderDuration = performance.now() - renderStart
      const phases = (
        globalThis as {
          __silvery_last_pipeline?: {
            measure?: number
            layout: number
            content?: number
            output: number
            total: number
          }
        }
      ).__silvery_last_pipeline
      const detail = (
        globalThis as {
          __silvery_content_detail?: Record<string, number | string | undefined>
        }
      ).__silvery_content_detail
      const phaseStr = phases
        ? ` [measure=${(phases.measure ?? 0).toFixed(1)} layout=${phases.layout.toFixed(1)} content=${(phases.content ?? 0).toFixed(1)} output=${phases.output.toFixed(1)}]`
        : ""
      const detailStr = detail
        ? ` {visited=${detail.nodesVisited} rendered=${detail.nodesRendered} skipped=${detail.nodesSkipped} noPrev=${detail.noPrevBuffer ?? 0} dirty=${detail.flagContentDirty ?? 0} paint=${detail.flagStylePropsDirty ?? 0} layoutChg=${detail.flagLayoutChanged ?? 0} subtree=${detail.flagSubtreeDirty ?? 0} children=${detail.flagChildrenDirty ?? 0} childPos=${detail.flagChildPositionChanged ?? 0} scroll=${detail.scrollContainerCount ?? 0}/${detail.scrollViewportCleared ?? 0}${detail.scrollClearReason ? `(${detail.scrollClearReason})` : ""}}${detail.cascadeNodes ? ` CASCADE[minDepth=${detail.cascadeMinDepth} ${detail.cascadeNodes}]` : ""}`
        : ""
      process
        .getBuiltinModule("node:fs")
        .appendFileSync(
          "/tmp/silvery-perf.log",
          `doRender #${_renderCount}: ${renderDuration.toFixed(1)}ms (reconcile=${reconcileMs.toFixed(1)}ms pipeline=${pipelineMs.toFixed(1)}ms ${dims.cols}x${dims.rows})${phaseStr}${detailStr}\n`,
        )
    }

    // Phase 4 (Visual Eyes epic): emit a RENDER_DISPATCHED event at the
    // flush boundary. Additive-only — reads already-computed state, never
    // mutates the buffer or tree. No-op (single boolean check) when
    // SILVERY_TRACE_FRAMES is unset.
    if (isRenderTraceEnabled()) {
      // signalDelta from the render-phase stats the pipeline already wrote
      // to __silvery_content_detail (instrumentation is auto-enabled when
      // render tracing is on — see opts.instrumented wiring in create-app).
      const detail = (
        globalThis as {
          __silvery_content_detail?: {
            nodesVisited?: number
            nodesRendered?: number
            nodesSkipped?: number
          }
        }
      ).__silvery_content_detail
      emitRenderDispatched({
        renderCount: _renderCount,
        dirtyReasons: renderTraceDirtyReasons,
        dimsChanged,
        bufferHeight: termBuffer.height,
        isRowDirty: (y) => termBuffer.isRowDirty(y),
        signalDelta: {
          nodesVisited: detail?.nodesVisited ?? -1,
          nodesRendered: detail?.nodesRendered ?? -1,
          nodesSkipped: detail?.nodesSkipped ?? -1,
          incremental: wasIncremental,
        },
        rootNodeCount: countAgNodes(rootNode),
        rootDirtyEpoch: rootNode.dirtyEpoch,
      })
    }

    return buf
  }

  function commitLayout(): boolean {
    // No-op when Ag hasn't been initialized yet (no render has run). Any
    // attempt to walk the tree before the first layout is harmless but
    // pointless — there are no committed signals to advance.
    if (!_ag) return false
    const rootNode = getContainerRoot(opts.container)
    return commitLayoutSnapshot(rootNode)
  }

  return {
    doRender,
    renderCount: () => _renderCount,
    resetCount: () => {
      _renderCount = 0
    },
    isIncrementalOff: () => opts.noIncremental,
    resetAg: () => {
      _ag = null
      _lastTermBuffer = null
      _lastLayoutDims = null
    },
    commitLayout,
  }
}

// ---------------------------------------------------------------------------
// Render-adjacent overlay helpers
//
// These sit on top of the current `currentBuffer` / runtime state and are
// called after `doRender()` + `runtime.render()` to overlay selection,
// scrollback, and search bits. Each takes only the bits of state it needs
// via a small options object.
// ---------------------------------------------------------------------------

export interface SelectionPaintOptions {
  selectionEnabled: boolean
  selectionState: TerminalSelectionState
  /**
   * Buffer to mutate with selection styles. MUST be a clone of the post-render
   * buffer — selection styles get baked into the buffer's cells so the diff
   * engine sees them and naturally repaints when selection changes. Mutating
   * the canonical Ag-tracked buffer would pollute Ag's `_prevBuffer`, breaking
   * the incremental render's clone-and-fast-path-skip invariant (see
   * pipeline/CLAUDE.md "Incremental Rendering Model").
   */
  paintBuffer: Buffer
  /**
   * Active Theme — when provided, Sterling `bg-selected` / `fg-on-selected`
   * drive the selection highlight color.
   * When omitted, the hardcoded `DEFAULT_SELECTION_THEME` desaturated blue-grey
   * is used so callers without a Theme still get a visible highlight that
   * sidesteps the SGR-7 two-tone artifact described on
   * `DEFAULT_SELECTION_THEME` below.
   *
   * Tracking: km-silvery.selection-theme-tokens
   */
  theme?: Theme
}

/**
 * Apply selection-highlight styles to a paint buffer in-place.
 *
 * Selection becomes part of the painted buffer's cells (fg/bg swap by
 * default) so the output-phase diff naturally tracks selection lifecycle:
 * when the selection shrinks or moves, cells that were styled last frame
 * but aren't this frame get repainted automatically.
 *
 * Replaces the legacy `writeSelectionOverlay` which wrote inverse ANSI
 * past the buffer — the diff engine had no record of those cells, so when
 * the selection shrank, stale inverse pixels stayed on screen until the
 * next forced full repaint.
 *
 * Tracking: km-silvery.delete-render-selection-overlay
 */
/**
 * Default selection-highlight color — a desaturated blue-grey that reads as
 * a uniform highlight across the full selection range, including trailing
 * whitespace. Stopgap until the existing `selectionbg` theme token (defined
 * in `packages/theme/src/validate-theme.ts` and derived per-palette in
 * `packages/ansi/src/theme/derive.ts`) is plumbed through paintFrame.
 * Tracked in `km-silvery.selection-theme-tokens`.
 *
 * Why a fixed color instead of the SGR-7 inverse-attr fallback:
 * - Inverse works correctly for ANSI16 — the terminal swaps the 16-color
 *   defaults uniformly, so content cells and trailing-whitespace cells look
 *   identical.
 * - In true-color / 256-color modes, inverse-on-explicit-rgb-cell and
 *   inverse-on-default-cell render with visibly different shades (the
 *   "lavender for blanks, grey for content" two-tone). An explicit bg
 *   sidesteps that by giving every cell in the range the same background.
 *
 * Only `selectionBg` is set; `selectionFg` is left undefined so each cell
 * keeps its original foreground (text stays legible) via
 * `theme.selectionFg ?? cellFg` in composeSelectionCells.
 */
const DEFAULT_SELECTION_THEME = { selectionBg: { r: 68, g: 78, b: 109 } } as const

/**
 * Resolve a `SelectionTheme` from an optional Theme.
 *
 * Priority for the selection background:
 *   1. Sterling flat token `bg-selected`
 *   2. Fall back to {@link DEFAULT_SELECTION_THEME} (the in-source desaturated
 *      blue-grey) so the highlight stays visible when no Theme is wired.
 *
 * Selection foreground: only `fg-on-selected` is honored. Leaving fg undefined
 * preserves each cell's original
 * foreground (text stays legible regardless of selection bg) via
 * `theme.selectionFg ?? cellFg` in {@link composeSelectionCells}.
 *
 */
export function resolveSelectionThemeFromTheme(theme: Theme | undefined): SelectionTheme {
  if (!theme) return DEFAULT_SELECTION_THEME
  // Use a widened view for the canonical hyphen keys. A raw retired field is
  // an invalid Theme shape, so route it through the shared refusal instead of
  // silently letting it influence selection paint.
  const themeAny = theme as unknown as Record<string, string | undefined>
  if (themeAny["selectionbg"] !== undefined) {
    resolveThemeColor("$selectionbg", theme)
  }
  const bgHex = themeAny["bg-selected"]
  const fgHex = themeAny["fg-on-selected"]
  const bg = bgHex ? hexToRgb(bgHex) : null
  if (!bg) return DEFAULT_SELECTION_THEME
  const fg = fgHex ? hexToRgb(fgHex) : null
  // Only set selectionFg when the theme actually carries fg-on-selected — leaving
  // it undefined preserves cell fg for legibility.
  return fg ? { selectionBg: bg, selectionFg: fg } : { selectionBg: bg }
}

export function applySelectionToPaintBuffer(opts: SelectionPaintOptions): void {
  const { selectionEnabled, selectionState, paintBuffer, theme } = opts
  if (!selectionEnabled || !selectionState.range) return
  const selectionTheme = resolveSelectionThemeFromTheme(theme)
  const changes = composeSelectionCells(
    paintBuffer._buffer,
    selectionState.range,
    selectionTheme,
    true,
    selectionState.scope,
  )
  applySelectionToBuffer(paintBuffer._buffer, changes)
}

export interface SearchHighlightsPaintOptions {
  searchState: SearchState
  scrollback: Scrollback | null
  virtualScrollOffset: number
  /**
   * Buffer to mutate with search-highlight styles. MUST be a clone of the
   * post-render buffer — see `SelectionPaintOptions.paintBuffer` for the
   * full rationale (preserves Ag's `_prevBuffer` invariant).
   */
  paintBuffer: Buffer
  /**
   * Active Theme — same resolution as `SelectionPaintOptions.theme`. Search
   * highlights share the selection highlight color so the two effects look
   * uniform across content cells and trailing-whitespace cells.
   *
   * Tracking: km-silvery.selection-theme-tokens
   */
  theme?: Theme
}

/**
 * Apply the active search currentMatch highlight to a paint buffer in-place.
 *
 * Highlight becomes part of the painted buffer's cells (fg/bg swap by
 * default) so the output-phase diff naturally tracks the highlight
 * lifecycle: when `currentMatch` moves (n/N navigation or query edit),
 * cells that were highlighted last frame but aren't this frame get
 * repainted automatically.
 *
 * Replaces the legacy `renderSearchHighlights` which wrote inverse ANSI
 * past the buffer — the diff engine had no record of those cells, so
 * stale inverse pixels persisted until the next forced row repaint.
 *
 * Tracking: km-silvery.delete-search-overlay-ansi
 */
export function applySearchHighlightsToPaintBuffer(opts: SearchHighlightsPaintOptions): void {
  const { searchState, scrollback, virtualScrollOffset, paintBuffer, theme } = opts
  if (!searchState.active || searchState.currentMatch < 0) return
  const match = searchState.matches[searchState.currentMatch]
  if (!match) return

  const cols = paintBuffer._buffer.width
  const rows = paintBuffer._buffer.height

  // Map scrollback-relative row → screen row.
  let screenRow: number
  if (scrollback && virtualScrollOffset > 0) {
    const totalLines = scrollback.totalLines
    const firstVisibleLine = totalLines - virtualScrollOffset - rows
    screenRow = match.row - firstVisibleLine
  } else {
    screenRow = match.row
  }
  if (screenRow < 0 || screenRow >= rows) return

  const highlights: SearchHighlight[] = [
    {
      screenRow,
      startCol: match.startCol,
      endCol: Math.min(match.endCol, cols - 1),
    },
  ]
  // Same theme as selection — uniform highlight color across content cells
  // and any non-content cells the match range happens to cover. Avoids the
  // two-tone artifact described on DEFAULT_SELECTION_THEME above.
  const selectionTheme = resolveSelectionThemeFromTheme(theme)
  const changes = composeSearchHighlightCells(paintBuffer._buffer, highlights, selectionTheme)
  applySelectionToBuffer(paintBuffer._buffer, changes)
}

export interface PushToScrollbackOptions {
  scrollback: Scrollback | null
  currentBuffer: Buffer | null
}

export function pushToScrollback(opts: PushToScrollbackOptions): void {
  if (!opts.scrollback || !opts.currentBuffer) return
  const lines = opts.currentBuffer.text.split("\n")
  opts.scrollback.push(lines)
}

export interface VirtualScrollbackViewOptions {
  scrollback: Scrollback | null
  virtualScrollOffset: number
  target: RenderTarget
}

export function renderVirtualScrollbackView(opts: VirtualScrollbackViewOptions): void {
  const { scrollback, virtualScrollOffset, target } = opts
  if (!scrollback || virtualScrollOffset <= 0) return
  const dims = target.getDims()
  const rows = scrollback.getVisibleRows(virtualScrollOffset, dims.rows)

  // Clear screen and write rows using absolute positioning
  let out = ""
  for (let row = 0; row < rows.length; row++) {
    out += `\x1b[${row + 1};1H\x1b[2K${rows[row] ?? ""}`
  }

  // Scroll indicator at top-right
  const indicator = ` ↑ ${virtualScrollOffset} lines `
  const indicatorCol = Math.max(1, dims.cols - indicator.length + 1)
  out += `\x1b[1;${indicatorCol}H\x1b[7m${indicator}\x1b[27m`

  target.write(out)
}

// Legacy `renderSearchHighlights` (ANSI past the buffer) deleted in
// km-silvery.delete-search-overlay-ansi. The compose+apply path lives
// in `applySearchHighlightsToPaintBuffer` above — highlights are stamped
// into the painted clone's cells so the diff engine tracks lifecycle.

export interface SearchBarPaintOptions {
  searchState: SearchState
  /**
   * Buffer to mutate with the search-bar text. MUST be a clone of the
   * post-render buffer — see `SelectionPaintOptions.paintBuffer`.
   */
  paintBuffer: Buffer
}

/**
 * Stamp the search bar (when active) onto the last row of a paint buffer.
 *
 * The bar lives at row `height-1` (the bottom of the screen). Each cell
 * carries the bar's character + the inverse attribute so the terminal
 * displays it as inverse video. When `searchState.active` flips to false,
 * subsequent paint frames don't call this function — the clone's last row
 * carries whatever the React tree wrote there, and the diff engine repaints
 * the row clean.
 *
 * Replaces the legacy `renderSearchBarOverlay` which wrote inverse ANSI to
 * `\x1b[${rows};1H` past the buffer — the canonical buffer's last row
 * stayed unchanged across frames, so when the bar closed the terminal
 * screen kept the stale bar text until something else forced a row repaint.
 *
 * Tracking: km-silvery.delete-search-overlay-ansi (Phase 2)
 */
export function applySearchBarToPaintBuffer(opts: SearchBarPaintOptions): void {
  const { searchState, paintBuffer } = opts
  if (!searchState.active) return
  const cols = paintBuffer._buffer.width
  const rows = paintBuffer._buffer.height
  if (rows < 1 || cols < 1) return

  const barText = renderSearchBarPlain(searchState, cols)
  const row = rows - 1
  for (let col = 0; col < cols; col++) {
    const ch = barText[col] ?? " "
    const cell = paintBuffer._buffer.getCell(col, row)
    paintBuffer._buffer.setCell(col, row, {
      ...cell,
      char: ch,
      attrs: { ...cell.attrs, inverse: true },
    })
  }
}

// Legacy `renderSearchBarOverlay` (ANSI past the buffer) deleted in
// km-silvery.delete-search-overlay-ansi (Phase 2). The compose+apply path
// lives in `applySearchBarToPaintBuffer` above — the bar's chars + inverse
// attr are stamped into the painted clone's last row so the diff engine
// tracks the bar's open/close lifecycle. With the legacy ANSI path, the
// bar's terminal-screen state stayed visible after `searchState.active`
// flipped to false because the canonical buffer's last row never changed.

/**
 * Build a `searchScrollback(query)` fn bound to the given scrollback.
 * Returns SearchMatch[] — used as the update-effect pump for the
 * reducer-style search state machine.
 */
export function createSearchScrollback(
  scrollback: Scrollback | null,
): (query: string) => SearchMatch[] {
  return (query: string): SearchMatch[] => {
    if (!scrollback || !query) return []
    const matchingLines = scrollback.search(query)
    const matches: SearchMatch[] = []
    for (const lineIdx of matchingLines) {
      const rows = scrollback.getVisibleRows(scrollback.totalLines - lineIdx - 1, 1)
      const line = rows[0] ?? ""
      const plain = line.replace(
        new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[a-zA-Z]`, "g"),
        "",
      )
      for (const range of computeMatchRanges(plain, query)) {
        // Runtime paint ranges are inclusive; canonical text ranges are exclusive.
        matches.push({ row: lineIdx, startCol: range.start, endCol: range.end - 1 })
      }
    }
    return matches
  }
}
