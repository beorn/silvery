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

import { tmpdir } from "node:os"
import { writeFileSync } from "node:fs"
import { reconciler, getContainerRoot } from "@silvery/ag-react/reconciler"
import { createAg, type Ag } from "../ag"
import { runWithMeasurer } from "../unicode"
import { createBuffer } from "./create-buffer"
import { isAnyDirty } from "@silvery/ag/epoch"
import { IncrementalRenderMismatchError } from "../scheduler"
import { createSearchState, renderSearchBar, type SearchMatch } from "../search-overlay"
import { renderSelectionOverlay } from "../selection-renderer"
import type { Buffer, Dims, RenderTarget } from "./types"
import type { PipelineConfig } from "../pipeline"
import type { createVirtualScrollback } from "../virtual-scrollback"
import type { TerminalBuffer } from "../buffer"
import type { createFiberRoot, createContainer } from "@silvery/ag-react/reconciler"
import type { TerminalSelectionState } from "@silvery/headless/selection"

type Scrollback = ReturnType<typeof createVirtualScrollback>
type Container = ReturnType<typeof createContainer>
type FiberRoot = ReturnType<typeof createFiberRoot>
type SearchState = ReturnType<typeof createSearchState>

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
}

/**
 * Build a `doRender` closure wired to the supplied runtime. The closure
 * manages its own long-lived `Ag` instance and tracks the last
 * TerminalBuffer for dimension-change detection.
 */
export function createRenderer(opts: RendererOptions): Renderer {
  let _renderCount = 0
  let _ag: Ag | null = null
  let _lastTermBuffer: TerminalBuffer | null = null
  let lastCurrentBuffer: Buffer | null = null

  function doRender(): Buffer {
    _renderCount++
    if (opts.ansiTrace) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("node:fs").appendFileSync(
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
      const acc = (globalThis as { __silvery_bench_phases?: { reconcile: number } }).__silvery_bench_phases
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
      _ag = createAg(rootNode, { measurer: opts.pipelineConfig?.measurer })
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
    if (_ag) {
      const lastBuffer = _lastTermBuffer
      if (lastBuffer) {
        const widthChanged = dims.cols !== lastBuffer.width
        const heightChanged = !isInline && dims.rows !== lastBuffer.height
        if (widthChanged || heightChanged) {
          _ag.resetBuffer()
          opts.runtime.invalidate()
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
        opts.cellDebug !== null ? { x: opts.cellDebug.x, y: opts.cellDebug.y, log: [] as string[] } : undefined
    }

    // Early return: if reconciliation produced no dirty flags on the tree,
    // skip the pipeline entirely. This avoids cloning prevBuffer (which
    // resets dirty rows to 0), preserving the row-level dirty markers that
    // the runtime diff needs to detect actual changes.
    // Exception: dimension changes require re-layout even without dirty flags.
    const rootHasDirty = rootNode.layoutNode?.isDirty() || isAnyDirty(rootNode.dirtyBits, rootNode.dirtyEpoch)
    const dimsChanged =
      _lastTermBuffer != null && (dims.cols !== _lastTermBuffer.width || dims.rows !== _lastTermBuffer.height)
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
    const { buffer: termBuffer, prevBuffer: agPrevBuffer } = _ag.render()
    _lastTermBuffer = termBuffer
    const wasIncremental = !opts.noIncremental && agPrevBuffer !== null
    const pipelineMs = performance.now() - pipelineStart

    // Expose timing for diagnostics.
    // Output timing is 0 here — the runtime handles the output phase separately.
    ;(
      globalThis as {
        __silvery_last_pipeline?: { layout: number; output: number; total: number; incremental: boolean }
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
      const acc = (globalThis as { __silvery_bench_phases?: { total: number; pipelineCalls: number } })
        .__silvery_bench_phases
      if (acc) {
        acc.total += pipelineMs
        acc.pipelineCalls += 1
      }
    }

    // SILVERY_STRICT: compare incremental render against fresh render.
    // createApp bypasses Scheduler/Renderer which have this check built-in,
    // so we add it here to catch incremental rendering bugs at runtime.
    if (opts.strictMode && wasIncremental) {
      const doFreshRender = () => {
        const freshAg = createAg(rootNode, { measurer: opts.pipelineConfig?.measurer })
        freshAg.layout(
          { cols: dims.cols, rows: dims.rows },
          { skipLayoutNotifications: true, skipScrollStateUpdates: true },
        )
        return freshAg.render()
      }
      const measurer = opts.pipelineConfig?.measurer
      const { buffer: freshBuffer } = measurer ? runWithMeasurer(measurer, doFreshRender) : doFreshRender()
      const { cellEquals, bufferToText } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("../buffer") as typeof import("../buffer")
      for (let y = 0; y < termBuffer.height; y++) {
        for (let x = 0; x < termBuffer.width; x++) {
          const a = termBuffer.getCell(x, y)
          const b = freshBuffer.getCell(x, y)
          if (!cellEquals(a, b)) {
            // Use cell debug log collected during the real incremental render
            let cellDebugInfo = ""
            const savedCellDbg = (globalThis as { __silvery_cell_debug?: { x: number; y: number; log: string[] } })
              .__silvery_cell_debug
            if (savedCellDbg && savedCellDbg.x === x && savedCellDbg.y === y && savedCellDbg.log.length > 0) {
              cellDebugInfo = `\nCELL DEBUG (${savedCellDbg.log.length} entries for (${x},${y})):\n${savedCellDbg.log.join("\n")}\n`
            } else if (savedCellDbg && savedCellDbg.x === x && savedCellDbg.y === y) {
              cellDebugInfo = `\nCELL DEBUG: No nodes cover (${x},${y}) during incremental render\n`
            } else {
              cellDebugInfo = `\nCELL DEBUG: Target cell (${x},${y}) differs from debug cell (${savedCellDbg?.x},${savedCellDbg?.y})\n`
            }

            // Re-run fresh render with write trap to capture what writes to the mismatched cell
            let trapInfo = ""
            const trap = { x, y, log: [] as string[] }
            ;(globalThis as { __silvery_write_trap?: { x: number; y: number; log: string[] } | null }).__silvery_write_trap =
              trap
            try {
              if (measurer) {
                runWithMeasurer(measurer, doFreshRender)
              } else {
                doFreshRender()
              }
            } catch {
              // ignore
            }
            ;(globalThis as { __silvery_write_trap?: { x: number; y: number; log: string[] } | null }).__silvery_write_trap =
              null
            if (trap.log.length > 0) {
              trapInfo = `\nWRITE TRAP (${trap.log.length} writes to (${x},${y})):\n${trap.log.join("\n")}\n`
            } else {
              trapInfo = `\nWRITE TRAP: NO WRITES to (${x},${y})\n`
            }
            const incText = bufferToText(termBuffer)
            const freshText = bufferToText(freshBuffer)
            const cellStr = (c: typeof a) =>
              `char=${JSON.stringify(c.char)} fg=${c.fg} bg=${c.bg} ulColor=${c.underlineColor} wide=${c.wide} cont=${c.continuation} attrs={bold=${c.attrs.bold},dim=${c.attrs.dim},italic=${c.attrs.italic},ul=${c.attrs.underline},ulStyle=${c.attrs.underlineStyle},blink=${c.attrs.blink},inv=${c.attrs.inverse},hidden=${c.attrs.hidden},strike=${c.attrs.strikethrough}}`
            const contentAll = (globalThis as { __silvery_content_all?: unknown[] }).__silvery_content_all
            const statsStr = contentAll
              ? `\n--- render phase stats (${contentAll.length} calls) ---\n` +
                contentAll
                  .map(
                    (s: unknown, i: number) => {
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
                    },
                  )
                  .join("\n")
              : ""
            const msg =
              `SILVERY_STRICT (createApp): MISMATCH at (${x}, ${y}) on render #${_renderCount}\n` +
              `  incremental: ${cellStr(a)}\n` +
              `  fresh:       ${cellStr(b)}` +
              statsStr +
              (() => {
                const traces = (globalThis as { __silvery_node_trace?: unknown[][] }).__silvery_node_trace
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
            let dumpPath: string | undefined
            try {
              dumpPath = `${tmpdir()}/silvery-strict-failure-${Date.now()}.txt`
              writeFileSync(dumpPath, msg)
            } catch {}
            throw new IncrementalRenderMismatchError(
              dumpPath ? `${msg.split("\n")[0]}\n  dump: ${dumpPath}` : msg,
            )
          }
        }
      }
      if (opts.perfLog) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("node:fs").appendFileSync(
          "/tmp/silvery-perf.log",
          `SILVERY_STRICT (createApp): render #${_renderCount} OK\n`,
        )
      }
    }

    const buf = createBuffer(termBuffer, rootNode)
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
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("node:fs").appendFileSync(
        "/tmp/silvery-perf.log",
        `doRender #${_renderCount}: ${renderDuration.toFixed(1)}ms (reconcile=${reconcileMs.toFixed(1)}ms pipeline=${pipelineMs.toFixed(1)}ms ${dims.cols}x${dims.rows})${phaseStr}${detailStr}\n`,
      )
    }
    return buf
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
    },
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

export interface SelectionOverlayOptions {
  selectionEnabled: boolean
  selectionState: TerminalSelectionState
  currentBuffer: Buffer | null
  alternateScreen: boolean
  target: RenderTarget
}

export function writeSelectionOverlay(opts: SelectionOverlayOptions): void {
  const { selectionEnabled, selectionState, currentBuffer, alternateScreen, target } = opts
  if (!selectionEnabled || !selectionState.range || !currentBuffer) return
  const mode = alternateScreen ? "fullscreen" : "inline"
  const overlay = renderSelectionOverlay(selectionState.range, currentBuffer._buffer, mode, selectionState.scope)
  if (overlay) target.write(overlay)
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

export interface SearchHighlightsOptions {
  searchState: SearchState
  scrollback: Scrollback | null
  virtualScrollOffset: number
  currentBuffer: Buffer | null
  target: RenderTarget
}

export function renderSearchHighlights(opts: SearchHighlightsOptions): void {
  const { searchState, scrollback, virtualScrollOffset, currentBuffer, target } = opts
  if (!searchState.active || searchState.currentMatch < 0) return
  const match = searchState.matches[searchState.currentMatch]
  if (!match) return

  const dims = target.getDims()
  // Calculate the screen row of the current match
  let screenRow: number
  if (scrollback && virtualScrollOffset > 0) {
    const totalLines = scrollback.totalLines
    const firstVisibleLine = totalLines - virtualScrollOffset - dims.rows
    screenRow = match.row - firstVisibleLine
  } else {
    screenRow = match.row
  }

  if (screenRow < 0 || screenRow >= dims.rows) return

  // Move to match position and render with inverse
  let out = `\x1b[${screenRow + 1};${match.startCol + 1}H\x1b[7m`
  for (let col = match.startCol; col <= match.endCol; col++) {
    if (currentBuffer && virtualScrollOffset <= 0) {
      out += currentBuffer._buffer.getCell(col, screenRow).char
    } else {
      out += searchState.query[col - match.startCol] ?? " "
    }
  }
  out += "\x1b[27m"
  target.write(out)
}

export interface SearchBarOverlayOptions {
  searchState: SearchState
  target: RenderTarget
}

export function renderSearchBarOverlay(opts: SearchBarOverlayOptions): void {
  const { searchState, target } = opts
  if (!searchState.active) return
  const dims = target.getDims()
  const bar = renderSearchBar(searchState, dims.cols)
  // Position at the last row
  target.write(`\x1b[${dims.rows};1H${bar}`)
}

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
    const lowerQuery = query.toLowerCase()
    const matches: SearchMatch[] = []
    for (const lineIdx of matchingLines) {
      const rows = scrollback.getVisibleRows(scrollback.totalLines - lineIdx - 1, 1)
      const line = rows[0] ?? ""
      const plain = line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
      let col = plain.toLowerCase().indexOf(lowerQuery)
      while (col !== -1) {
        matches.push({ row: lineIdx, startCol: col, endCol: col + query.length - 1 })
        col = plain.toLowerCase().indexOf(lowerQuery, col + 1)
      }
    }
    return matches
  }
}
