/**
 * Ag — tree + layout engine + renderer.
 *
 * The sole pipeline entry point. Two independent phases:
 * - ag.layout(dims) — measure + flexbox → positions/sizes
 * - ag.render() — positioned tree → cell grid → TextFrame
 *
 * The output phase (buffer → ANSI) is NOT part of ag — it lives in term.paint().
 *
 * @example
 * ```ts
 * const ag = createAg(root, { measurer })
 * ag.layout({ cols: 80, rows: 24 })
 * const { frame, buffer } = ag.render()
 * const output = term.paint(buffer, prevBuffer)
 * ```
 */

import { createLogger } from "loggily"
import type { AgNode, AgNodeType } from "@silvery/ag/types"
import {
  getRenderEpoch,
  INITIAL_EPOCH,
  ALL_RECONCILER_BITS,
  CONTENT_BIT,
  STYLE_PROPS_BIT,
} from "@silvery/ag/epoch"
import { getLayoutEngine } from "./layout-engine"
import type { TextFrame } from "@silvery/ag/text-frame"
import { type TerminalBuffer, createTextFrame } from "./buffer"
import { runWithMeasurer, type Measurer } from "./unicode"
import { measurePhase } from "./pipeline/measure-phase"
import {
  layoutPhase,
  scrollPhase,
  stickyPhase,
  scrollrectPhase,
  scrollrectPhaseSimple,
  notifyLayoutSubscribers,
  detectPipelineFeatures,
  strictLayoutOverflowCheck,
} from "./pipeline/layout-phase"
import { renderPhase, clearBgConflictWarnings } from "./pipeline/render-phase"
import {
  applyBackdrop,
  hasBackdropMarkers,
  type ColorLevel,
} from "./pipeline/backdrop"
import { CURSOR_RESTORE, CURSOR_SAVE, kittyDeleteAllScrimPlacements } from "@silvery/ansi"
import { clearDirtyTracking, hasScrollDirty } from "@silvery/ag/dirty-tracking"
import type { PipelineContext } from "./pipeline/types"

const log = createLogger("silvery:render")
const baseLog = createLogger("@silvery/ag-react")

// =============================================================================
// Types
// =============================================================================

export interface AgLayoutOptions {
  skipLayoutNotifications?: boolean
  skipScrollStateUpdates?: boolean
}

export interface AgRenderOptions {
  /** Force fresh render — no incremental, doesn't update internal prevBuffer. */
  fresh?: boolean
  /** Override prevBuffer for this render (bypasses internal tracking). */
  prevBuffer?: TerminalBuffer | null
}

export interface CreateAgOptionsInternal {
  /** Width measurer scoped to terminal capabilities. */
  measurer?: Measurer
  /**
   * Terminal color tier for the backdrop-fade pass (see `pipeline/backdrop/`).
   * Defaults to `"truecolor"` (OKLab blend). Set to `"ansi16"` at ANSI 16 tier
   * (SGR 2 dim) or `"mono"` to disable the pass entirely.
   */
  colorLevel?: ColorLevel
  /**
   * When true, the backdrop-fade pass emits Kitty graphics placements over
   * emoji / wide-char cells in the faded region so those glyphs visually
   * fade alongside surrounding text. Required because SGR 2 "dim" is a
   * no-op on bitmap emoji in most terminals (Ghostty confirmed).
   *
   * When undefined, `ag.ts` falls back to an env heuristic (Kitty/Ghostty/
   * WezTerm, not inside tmux, `SILVERY_KITTY_GRAPHICS` env not "0"). Pass
   * `false` to force-disable (tests, fallback terminals).
   */
  kittyGraphics?: boolean
}

export interface AgRenderResult {
  /** Immutable TextFrame snapshot of the rendered output. */
  readonly frame: TextFrame
  /**
   * Post-transform buffer for painting. Includes backdrop-fade cell transforms
   * (if any). Pass this to `term.paint()` / `outputPhase()` as `next`.
   */
  readonly buffer: TerminalBuffer
  /**
   * Pre-transform buffer. Identical to `buffer` when no backdrop-fade markers
   * are present. Callers managing their own incremental prev-buffer state must
   * carry THIS (not `buffer`) forward, so the next frame's render phase starts
   * from pre-fade cells and the fade pass re-applies deterministically.
   */
  readonly carryForwardBuffer: TerminalBuffer
  /** Previous frame's buffer (null on first render). For output-phase diffing. */
  readonly prevBuffer: TerminalBuffer | null
  /**
   * Out-of-band ANSI escapes that must be appended to the output stream after
   * the normal output phase diff. Currently carries Kitty graphics placements
   * emitted by the backdrop-fade pass to scrim emoji / wide-char cells. Empty
   * string when no overlays are active (backdrop inactive, kittyGraphics cap
   * disabled, or no wide cells in the faded region).
   */
  readonly overlay: string
}

export interface Ag {
  /** The root AgNode tree. */
  readonly root: AgNode

  // -------------------------------------------------------------------------
  // Pipeline
  // -------------------------------------------------------------------------

  /**
   * Run layout phases: measure → flexbox → scroll → sticky → scrollRect → notify.
   * Mutates layout nodes in place.
   */
  layout(dims: { cols: number; rows: number }, options?: AgLayoutOptions): void

  /**
   * Run the render phase: positioned tree → cell grid → TextFrame.
   * Uses internal prevBuffer for incremental rendering.
   * Returns frame (public read API) + buffer/prevBuffer (for output phase).
   */
  render(options?: AgRenderOptions): AgRenderResult

  /** Reset internal prevBuffer (call on resize — forces fresh render next frame). */
  resetBuffer(): void

  // -------------------------------------------------------------------------
  // Tree Mutation API (Phase 4)
  // -------------------------------------------------------------------------

  /** Create a new AgNode with a layout node. */
  createNode(type: AgNodeType, props: Record<string, unknown>): AgNode

  /** Insert child at index in both ag tree and layout tree. */
  insertChild(parent: AgNode, child: AgNode, index: number): void

  /** Remove child from both ag tree and layout tree. */
  removeChild(parent: AgNode, child: AgNode): void

  /** Update node props (applies to layout node if layout-affecting). */
  updateProps(
    node: AgNode,
    props: Record<string, unknown>,
    oldProps?: Record<string, unknown>,
  ): void

  /** Update text content on a node. */
  setText(node: AgNode, text: string): void

  /** Structural text representation (no layout). */
  toString(): string
}

export interface CreateAgOptions {
  /** Width measurer scoped to terminal capabilities. */
  measurer?: Measurer
  /**
   * Terminal color tier for the backdrop-fade pass. Defaults to `"truecolor"`.
   * See `pipeline/backdrop/` for tier semantics.
   */
  colorLevel?: ColorLevel
  /**
   * Whether the backdrop-fade pass may emit Kitty graphics placements for
   * emoji scrim. Defaults to an env heuristic (see `isKittyGraphicsEnabled`).
   * Pass `false` to force-disable (tests, explicit opt-out).
   */
  kittyGraphics?: boolean
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Walk the ag tree top-down to find the root ThemeProvider's background color.
 *
 * ThemeProvider in @silvery/ag-react renders a `<Box theme={merged}>` wrapper.
 * The render phase pushes/pops this theme via pushContextTheme/popContextTheme,
 * so the module-level theme stack is empty after the render phase completes.
 * We walk the tree directly to recover the root bg without requiring the
 * render phase to be running.
 *
 * Returns the first Box node's Sterling `bg-surface-default` (with legacy `bg`
 * fallback for backdrop-only Themes that pre-date Sterling's flat surface
 * tokens) found in a depth-first walk, or `null` if no theme node is present
 * (bare tests without ThemeProvider).
 */
function findRootThemeBg(root: AgNode): string | null {
  const props = root.props as Record<string, unknown>
  if (props.theme) {
    const theme = props.theme as Record<string, unknown>
    const sterlingBg = theme["bg-surface-default"]
    if (typeof sterlingBg === "string") return sterlingBg
    const legacyBg = theme["bg"]
    if (typeof legacyBg === "string") return legacyBg
  }
  for (const child of root.children) {
    const found = findRootThemeBg(child)
    if (found !== null) return found
  }
  return null
}

/**
 * Env heuristic: should the backdrop-fade pass emit Kitty graphics overlays?
 *
 * This is the MVP gate — a lightweight capability detector used when the
 * caller doesn't pass `kittyGraphics` explicitly. Matches the Option C design
 * intent: emit only on modern terminals where Kitty graphics are known to
 * work (Kitty, Ghostty, WezTerm), NOT inside tmux (DCS passthrough is
 * unreliable), with an explicit `SILVERY_KITTY_GRAPHICS` override.
 *
 * - `SILVERY_KITTY_GRAPHICS=0` → always off
 * - `SILVERY_KITTY_GRAPHICS=1` → always on (bypasses tmux + term checks)
 * - `TMUX` env var present → off (unless forced on above)
 * - `TERM_PROGRAM` in {Ghostty, WezTerm} → on
 * - `TERM` contains "kitty" → on
 * - `KITTY_WINDOW_ID` set → on
 * - otherwise → off
 *
 * The long-term plan is to promote this to a `TerminalCaps.kittyGraphics`
 * consumer. That field exists (see `@silvery/ansi` detectTerminalCaps) but
 * isn't threaded into the render pipeline yet — tracked as a follow-up.
 */
function isKittyGraphicsEnabledFromEnv(): boolean {
  const env =
    typeof process !== "undefined" ? process.env : ({} as Record<string, string | undefined>)

  const override = env.SILVERY_KITTY_GRAPHICS
  if (override === "0" || override === "false") return false
  if (override === "1" || override === "true") return true

  // tmux's DCS passthrough for Kitty graphics is flaky — off by default.
  // User can override via SILVERY_KITTY_GRAPHICS=1 if their tmux config
  // (allow-passthrough + extended keys) actually works.
  if (env.TMUX) return false

  const program = env.TERM_PROGRAM ?? ""
  if (program === "ghostty" || program === "Ghostty" || program === "WezTerm") return true

  const term = env.TERM ?? ""
  if (term.includes("kitty")) return true

  if (env.KITTY_WINDOW_ID) return true

  return false
}

// =============================================================================
// Factory
// =============================================================================

export function createAg(root: AgNode, options?: CreateAgOptions): Ag {
  const measurer = options?.measurer
  const colorLevel: ColorLevel = options?.colorLevel ?? "truecolor"
  // Kitty graphics: explicit option wins. Otherwise fall back to env heuristic
  // so the default behavior matches the terminal running the app without
  // callers needing to thread TerminalCaps through every site. Tests that
  // want to pin determinism pass `kittyGraphics: false`.
  const kittyGraphics =
    options?.kittyGraphics !== undefined ? options.kittyGraphics : isKittyGraphicsEnabledFromEnv()
  const ctx: PipelineContext | undefined = measurer ? { measurer } : undefined
  let _prevBuffer: TerminalBuffer | null = null
  // True when the PREVIOUS frame had backdrop markers (and so emitted Kitty
  // placements). Drives the one-shot delete-all on the first frame where the
  // backdrop goes away so leftover scrim rectangles don't linger on screen.
  // Scoped per-Ag; non-persistent-Ag callers (test driver renderer.ts)
  // additionally track at their own level — see that file.
  let _kittyActive = false

  // Feature flags — one-way: once true, stays true for the lifetime of this Ag.
  // This ensures dynamically mounted scroll/sticky components enable their phases
  // and never get skipped again.
  let hasScroll = false
  let hasSticky = false

  function doLayout(
    cols: number,
    rows: number,
    opts?: AgLayoutOptions,
  ): { tMeasure: number; tLayout: number; tScroll: number; tScrollRect: number; tNotify: number } {
    // Layout-on-demand gate: skip ALL layout phases when Flexily reports
    // no dirty nodes, no scroll offset changed, and dimensions haven't changed.
    // This eliminates ~38% of per-frame pipeline cost for cursor/style-only changes.
    // First render always has isDirty (Flexily nodes start dirty on creation).
    // scrollTo/scrollOffset changes don't affect Flexily (they don't change
    // dimensions) but DO need scroll/sticky/scrollRect/notify phases to run.
    const prevRootLayout = root.boxRect
    const dimensionsChanged =
      prevRootLayout && (prevRootLayout.width !== cols || prevRootLayout.height !== rows)
    if (!dimensionsChanged && !root.layoutNode?.isDirty() && !hasScrollDirty()) {
      log.debug?.("layout: skipped (Flexily clean, no scrollDirty, dimensions unchanged)")
      // Even when the full layout phase is skipped, style-only changes
      // (outline add/remove, absolute child structural changes) need cascade
      // input bits computed for the render phase. Without this, the render
      // phase can't detect outline mutations and stale outline pixels persist.
      layoutPhase(root, cols, rows)
      return { tMeasure: 0, tLayout: 0, tScroll: 0, tScrollRect: 0, tNotify: 0 }
    }

    using render = baseLog.span("pipeline", { width: cols, height: rows })

    let tMeasure: number
    {
      using _m = render.span("measure")
      const t = performance.now()
      measurePhase(root, ctx)
      tMeasure = performance.now() - t
      log.debug?.(`measure: ${tMeasure.toFixed(2)}ms`)
    }

    let tLayout: number
    {
      using _l = render.span("layout")
      const t = performance.now()
      layoutPhase(root, cols, rows)
      tLayout = performance.now() - t
      log.debug?.(`layout: ${tLayout.toFixed(2)}ms`)
    }

    // STRICT invariant: verify no child overflows its parent's inner width.
    // Catches fit-content/snug-content/measure-phase bugs at the source.
    strictLayoutOverflowCheck(root)

    // Detect features for phase skipping. One-way merge: false → true only.
    // This scan runs every layout pass to catch newly mounted components.
    if (!hasScroll || !hasSticky) {
      const features = detectPipelineFeatures(root)
      if (features.hasScroll) hasScroll = true
      if (features.hasSticky) hasSticky = true
    }

    let tScroll: number
    if (hasScroll) {
      using _s = render.span("scroll")
      const t = performance.now()
      scrollPhase(root, { skipStateUpdates: opts?.skipScrollStateUpdates })
      tScroll = performance.now() - t
    } else {
      tScroll = 0
    }

    if (hasSticky) {
      stickyPhase(root)
    }

    let tScrollRect: number
    {
      using _r = render.span("scrollRect")
      const t = performance.now()
      if (hasScroll || hasSticky) {
        scrollrectPhase(root)
      } else {
        // Fast path: no scroll offsets or sticky positions to account for.
        // scrollRect === boxRect, screenRect === scrollRect.
        scrollrectPhaseSimple(root)
      }
      tScrollRect = performance.now() - t
    }

    let tNotify = 0
    if (!opts?.skipLayoutNotifications) {
      using _n = render.span("notify")
      const t = performance.now()
      notifyLayoutSubscribers(root)
      tNotify = performance.now() - t
    }

    // Bench instrumentation: accumulate per-phase timings in a global counter
    // that a harness can read + reset between iterations. Cheap: five `+=` ops.
    // See __silvery_bench_accumulate / __silvery_bench_reset helpers below.
    const acc = (globalThis as any).__silvery_bench_phases
    if (acc) {
      acc.measure += tMeasure
      acc.layout += tLayout
      acc.scroll += tScroll
      acc.scrollRect += tScrollRect
      acc.notify += tNotify
      acc.layoutTotal += tMeasure + tLayout + tScroll + tScrollRect + tNotify
    }

    return { tMeasure, tLayout, tScroll, tScrollRect, tNotify }
  }

  function doRender(opts?: AgRenderOptions): AgRenderResult & { tContent: number } {
    clearBgConflictWarnings()
    const prevBuffer = opts?.fresh
      ? null
      : opts?.prevBuffer !== undefined
        ? opts.prevBuffer
        : _prevBuffer

    let tContent: number
    let buffer: TerminalBuffer
    {
      const t = performance.now()
      buffer = renderPhase(root, prevBuffer, ctx)
      tContent = performance.now() - t
      log.debug?.(`content: ${tContent.toFixed(2)}ms`)
    }

    // Backdrop-fade pass — runs after content + decoration, before output.
    //
    // Incremental invariant: fast-path cells carry the PREVIOUS frame's
    // pixels into the clone inside renderPhase. If those pixels are
    // POST-fade, the fade pass re-fades already-faded cells and the result
    // compounds across frames (STRICT: incremental post-fade diverges from
    // fresh post-fade after 2+ frames).
    //
    // Solution: snapshot the PRE-transform buffer BEFORE applying fade.
    // Store it as `_prevBuffer` (for internal ag state) AND return it as
    // `carryForwardBuffer` so external callers managing their own prev
    // state (renderer.ts) can track pre-fade. The post-fade `buffer` is
    // what gets painted; pre-fade is what gets cloned for incremental.
    let carryForwardBuffer: TerminalBuffer
    let overlay = ""
    const backdropActive = hasBackdropMarkers(root)
    if (backdropActive) {
      carryForwardBuffer = buffer.clone()
      if (!opts?.fresh) {
        _prevBuffer = carryForwardBuffer
      }
      const defaultBg = findRootThemeBg(root) ?? undefined
      const result = applyBackdrop(root, buffer, {
        colorLevel,
        defaultBg,
        kittyGraphics,
      })
      overlay = result.overlay
    } else {
      carryForwardBuffer = buffer
      if (!opts?.fresh) {
        _prevBuffer = buffer
      }
    }
    // Kitty scrim deactivation — edge-triggered. When the previous frame
    // painted Kitty placements but this frame did not, emit a one-shot
    // delete-all so leftover placements don't linger on screen. Handles
    // BOTH cases:
    //   (a) markers removed entirely (backdropActive=false), and
    //   (b) markers still present but plan became inactive (e.g., fade={0}),
    //       where applyBackdrop intentionally returns an empty overlay.
    // This MUST be edge-triggered: emitting the delete-all every inactive
    // frame would spam the terminal indefinitely once a Modal mounts at
    // fade={0}.
    const kittyActiveThisFrame = backdropActive && overlay.length > 0
    if (_kittyActive && !kittyActiveThisFrame) {
      overlay = CURSOR_SAVE + kittyDeleteAllScrimPlacements() + CURSOR_RESTORE
    }
    _kittyActive = kittyActiveThisFrame

    // Clear the module-level dirty tracking after each render pass.
    // Content dirty nodes were processed by renderPhase; layout dirty is
    // managed by Flexily internally (isDirty cleared after calculateLayout).
    clearDirtyTracking()

    // Bench instrumentation: accumulate content-phase timing.
    const acc = (globalThis as any).__silvery_bench_phases
    if (acc) {
      acc.content += tContent
      acc.renderCalls += 1
    }

    const frame = createTextFrame(buffer)
    return { frame, buffer, carryForwardBuffer, prevBuffer, tContent, overlay }
  }

  // -------------------------------------------------------------------------
  // Tree Mutation
  // -------------------------------------------------------------------------

  function agCreateNode(type: AgNodeType, props: Record<string, unknown>): AgNode {
    const engine = getLayoutEngine()
    const layoutNode = engine.createNode()
    return {
      type,
      props,
      children: [],
      parent: null,
      layoutNode,
      boxRect: null,
      scrollRect: null,
      screenRect: null,
      prevLayout: null,
      prevScrollRect: null,
      prevScreenRect: null,
      layoutChangedThisFrame: INITIAL_EPOCH,
      dirtyBits: ALL_RECONCILER_BITS,
      dirtyEpoch: getRenderEpoch(),
    }
  }

  function agInsertChild(parent: AgNode, child: AgNode, index: number): void {
    // Remove from old parent if already in a tree (keyed reorder)
    if (child.parent) {
      agRemoveChild(child.parent, child)
    }

    // Insert into children array
    parent.children.splice(index, 0, child)
    child.parent = parent

    // Sync layout tree
    if (parent.layoutNode && child.layoutNode) {
      // Layout index = count of children with layoutNode before this position
      const layoutIndex = parent.children
        .slice(0, index)
        .filter((c) => c.layoutNode !== null).length
      parent.layoutNode.insertChild(child.layoutNode, layoutIndex)
    }
  }

  function agRemoveChild(parent: AgNode, child: AgNode): void {
    const index = parent.children.indexOf(child)
    if (index === -1) return

    parent.children.splice(index, 1)

    if (parent.layoutNode && child.layoutNode) {
      parent.layoutNode.removeChild(child.layoutNode)
      child.layoutNode.free()
    }

    child.parent = null
  }

  return {
    root,

    // Pipeline
    layout(dims, options) {
      if (measurer) {
        runWithMeasurer(measurer, () => doLayout(dims.cols, dims.rows, options))
      } else {
        doLayout(dims.cols, dims.rows, options)
      }
    },

    render(options) {
      const result = measurer
        ? runWithMeasurer(measurer, () => doRender(options))
        : doRender(options)
      return {
        frame: result.frame,
        buffer: result.buffer,
        carryForwardBuffer: result.carryForwardBuffer,
        prevBuffer: result.prevBuffer,
        overlay: result.overlay,
      }
    },

    resetBuffer() {
      _prevBuffer = null
    },

    // Tree mutations
    createNode: agCreateNode,
    insertChild: agInsertChild,
    removeChild: agRemoveChild,

    updateProps(node, props, oldProps) {
      node.props = props
      if (node.layoutNode) {
        node.layoutNode.markDirty()
      }
    },

    setText(node, text) {
      ;(node as any).textContent = text
      const epoch = getRenderEpoch()
      const bits = CONTENT_BIT | STYLE_PROPS_BIT
      node.dirtyBits = node.dirtyEpoch !== epoch ? bits : node.dirtyBits | bits
      node.dirtyEpoch = epoch
      if (node.layoutNode) {
        node.layoutNode.markDirty()
      }
    },

    toString() {
      return `[Ag root=${root.type} children=${root.children.length}]`
    },
  }
}
