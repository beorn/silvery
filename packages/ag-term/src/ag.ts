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
  markDirty,
  INITIAL_EPOCH,
  ALL_RECONCILER_BITS,
  CONTENT_BIT,
  STYLE_PROPS_BIT,
} from "@silvery/ag/epoch"
import { DEFAULT_COLOR_LEVEL } from "./pipeline/state"
import { getLayoutEngine } from "./layout-engine"
import type { RGB, TextFrame } from "@silvery/ag/text-frame"
import { TerminalBuffer, createTextFrame } from "./buffer"
import { createMeasurer, runWithMeasurer, type Measurer } from "./unicode"
import { measurePhase } from "./pipeline/measure-phase"
import {
  layoutPhase,
  scrollPhase,
  stickyPhase,
  scrollrectPhase,
  scrollrectPhaseSimple,
  notifyLayoutSubscribers,
  detectPipelineFeatures,
  strictApportionBandsCheck,
  strictLayoutOverflowCheck,
} from "./pipeline/layout-phase"
import { renderPhase, clearBgConflictWarnings } from "./pipeline/render-phase"
import {
  classifyPlan,
  commitSectionedPlan,
  isRenderPlanEnabled,
  RecordingBuffer,
  wrapPrevBufferForRecording,
} from "./pipeline/render-plan"
import { withPlanCapture } from "./pipeline/render-sink"
import { createRenderPostState, type RenderPostState } from "./pipeline/render-post-state"
export { createRenderPostState, type RenderPostState } from "./pipeline/render-post-state"
import { applyBackdrop, hasBackdropMarkers, type ColorLevel } from "./pipeline/backdrop"
import { applySubtreeFade, hasSubtreeFadeMarkers } from "./pipeline/subtree-fade"
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
  /**
   * Disable propagateLayout's parent-match incremental skip so EVERY node's
   * freshly-computed rect is written to boxRect. Used with markLayoutTreeDirty by
   * the `fresh-layout` STRICT slug to build an independent from-scratch layout
   * baseline — otherwise a stale rect under an unchanged ancestor is pruned and
   * the divergence stays hidden. Off (skip enabled) for the normal render path.
   */
  forceFullPropagate?: boolean
}

export interface AgRenderOptions {
  /** Force fresh render — no incremental, doesn't update internal prevBuffer. */
  fresh?: boolean
  /** Override prevBuffer for this render (bypasses internal tracking). */
  prevBuffer?: TerminalBuffer | null
  /**
   * Override post-state carrier (outline snapshots) for this render. When
   * provided, both reads (clearPreviousOutlines at the start of the render)
   * and writes (renderDecorationPass after content) target this carrier
   * instead of the Ag-internal `_postState`.
   *
   * Required for callers that create a fresh `Ag` instance per frame
   * (renderer.ts, scheduler.ts) — without it, every frame starts with an
   * empty snapshot list and stale outline pixels from `prevBuffer.clone()`
   * leak through the incremental render. Long-lived-Ag callers
   * (runtime/renderer.ts) can omit this and let the Ag manage `_postState`
   * internally.
   *
   * Mutated in place: after `render()` returns, the carrier holds the
   * current frame's outline snapshots, ready to be passed in again on the
   * next frame so `clearPreviousOutlines` can restore those cells.
   */
  postState?: RenderPostState
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
   * When undefined, backdrop graphics are off. Pass `true` or set
   * `SILVERY_KITTY_GRAPHICS=1` to enable them explicitly.
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
  /**
   * Post-state carrier with this frame's snapshots (outline cells, etc.).
   *
   * When the caller passed `options.postState` into `render()`, this is the
   * SAME reference (mutated in place) — exposed here so the call site doesn't
   * have to hold its own carrier separately. When no carrier was passed, this
   * is the Ag-internal `_postState`.
   *
   * Per-frame-Ag callers (renderer.ts, scheduler.ts) should hold their own
   * carrier and pass it back in next frame; reading from the result is fine
   * but is the same object they already own.
   */
  readonly postState: RenderPostState
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
   * emoji scrim. Defaults to false; pass true or set `SILVERY_KITTY_GRAPHICS=1`
   * to enable the graphics side channel explicitly.
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

/** Parse `#rrggbb` (or `#rgb`) into RGB; null on any non-hex input. */
function parseHexToRgb(hex: string): RGB | null {
  if (typeof hex !== "string") return null
  let s = hex.trim().toLowerCase()
  if (s.startsWith("#")) s = s.slice(1)
  if (s.length === 3) s = s[0]! + s[0]! + s[1]! + s[1]! + s[2]! + s[2]!
  if (!/^[0-9a-f]{6}$/.test(s)) return null
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  }
}

/**
 * Walk the ag tree top-down to find the root ThemeProvider's 16 ANSI colors
 * (`theme.palette`), converted to RGB for the backdrop fade.
 *
 * Mirrors `findRootThemeBg`: ThemeProvider renders `<Box theme={merged}>`, and
 * the Sterling `Theme` carries `palette: readonly string[]` — a 16-slot ANSI
 * catalog in canonical order (0 black … 6 cyan … 15 brightWhite), the SAME
 * index order as a buffer cell's numeric `Color`. We return those 16 slots as
 * RGB so the fade resolves palette-indexed cells against the active theme
 * instead of the hardcoded VGA table (@km 19764).
 *
 * Returns `null` when no theme node is present (bare tests without
 * ThemeProvider) OR the theme has no usable 16-entry hex palette — the fade
 * then falls back to `ansi256ToRgb` (VGA), preserving pre-fix behavior.
 */
function findRootThemeAnsi16(root: AgNode): readonly RGB[] | null {
  const props = root.props as Record<string, unknown>
  if (props.theme) {
    const theme = props.theme as Record<string, unknown>
    const palette = theme["palette"]
    if (Array.isArray(palette) && palette.length >= 16) {
      const rgb: RGB[] = []
      for (let i = 0; i < 16; i++) {
        const slot = palette[i]
        const parsed = typeof slot === "string" ? parseHexToRgb(slot) : null
        // A single unparseable slot aborts to the VGA fallback rather than
        // emitting a partial palette (which would mix themed + VGA colors).
        if (parsed === null) return null
        rgb.push(parsed)
      }
      return rgb
    }
  }
  for (const child of root.children) {
    const found = findRootThemeAnsi16(child)
    if (found !== null) return found
  }
  return null
}

/**
 * Explicit env override for backdrop Kitty graphics overlays.
 *
 * Terminal capability bits still report Kitty graphics support for image
 * components and caller-owned graphics. The backdrop pass is different: it is
 * an automatic per-frame side channel, so defaulting it on for a terminal
 * family can allocate compositor/GPU resources during ordinary first render.
 * Keep it opt-in until the renderer can attribute and budget the side channel
 * independently from text frames.
 */
function isKittyGraphicsForcedFromEnv(): boolean {
  const env =
    typeof process !== "undefined" ? process.env : ({} as Record<string, string | undefined>)

  const override = env.SILVERY_KITTY_GRAPHICS
  if (override === "1" || override === "true") return true

  return false
}

// =============================================================================
// Factory
// =============================================================================

export function createAg(root: AgNode, options?: CreateAgOptions): Ag {
  const measurer = options?.measurer
  const colorLevel: ColorLevel = options?.colorLevel ?? "truecolor"
  // Kitty graphics: explicit option wins. Otherwise only the env opt-in may
  // enable this automatic backdrop side channel; ordinary first render stays
  // text-only even on terminals that support Kitty graphics.
  const kittyGraphics =
    options?.kittyGraphics !== undefined ? options.kittyGraphics : isKittyGraphicsForcedFromEnv()
  // The context is what carries the tier into parseColor / getTextStyle, so a
  // caller that pinned a non-default level needs one even without a measurer.
  // Every consumer reads `ctx.measurer` on the strength of `ctx` existing, so
  // mint the default measurer rather than hand out a half-built context — it
  // resolves identically to the module-level width fallbacks it replaces.
  const ctxMeasurer =
    measurer ?? (colorLevel === DEFAULT_COLOR_LEVEL ? undefined : createMeasurer({}))
  const ctx: PipelineContext | undefined = ctxMeasurer
    ? { measurer: ctxMeasurer, colorLevel }
    : undefined
  let _prevBuffer: TerminalBuffer | null = null
  // Cross-frame post-state (outline snapshots, etc.). Phase 2 Step 5 of
  // paint-clear-invariant L5 hoisted outline snapshots off `TerminalBuffer`
  // onto a dedicated carrier owned here, alongside `_prevBuffer`. The
  // decoration phase reads/writes this object directly; the sink layer
  // captures parallel post-state ops only for plan-shape parity tests.
  // Reset semantics mirror `_prevBuffer`: cleared by `resetBuffer()` so a
  // resize discards stale snapshots (their cell coordinates would be wrong
  // at the new dimensions).
  let _postState: RenderPostState = createRenderPostState()
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
    if (!dimensionsChanged && !root.layoutNode?.isDirty() && !hasScrollDirty(root)) {
      log.debug?.("layout: skipped (Flexily clean, no scrollDirty, dimensions unchanged)")
      // Even when the full layout phase is skipped, style-only changes
      // (outline add/remove, absolute child structural changes) need cascade
      // input bits computed for the render phase. Without this, the render
      // phase can't detect outline mutations and stale outline pixels persist.
      layoutPhase(root, cols, rows)
      return { tMeasure: 0, tLayout: 0, tScroll: 0, tScrollRect: 0, tNotify: 0 }
    }

    using render = baseLog.span?.("pipeline", { width: cols, height: rows })

    let tMeasure: number
    {
      using _m = render?.span("measure")
      const t = performance.now()
      measurePhase(root, ctx)
      tMeasure = performance.now() - t
      log.debug?.(`measure: ${tMeasure.toFixed(2)}ms`)
    }

    let tLayout: number
    {
      using _l = render?.span("layout")
      const t = performance.now()
      layoutPhase(root, cols, rows, opts?.forceFullPropagate)
      tLayout = performance.now() - t
      log.debug?.(`layout: ${tLayout.toFixed(2)}ms`)
    }

    // STRICT invariant: verify no child overflows its parent's inner width.
    // Catches fit-content/snug-content/measure-phase bugs at the source.
    strictLayoutOverflowCheck(root)

    // STRICT invariant: verify no apportioned track rendered below its band
    // minimum while a sibling rendered above its maximum. Runs here, on the
    // realized rects, because the defect is what the layout engine did to the
    // allocation — not what the allocator returned.
    strictApportionBandsCheck(root)

    // Detect features for phase skipping. One-way merge: false → true only.
    // This scan runs every layout pass to catch newly mounted components.
    if (!hasScroll || !hasSticky) {
      const features = detectPipelineFeatures(root)
      if (features.hasScroll) hasScroll = true
      if (features.hasSticky) hasSticky = true
    }

    let tScroll: number
    if (hasScroll) {
      using _s = render?.span("scroll")
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
      using _r = render?.span("scrollRect")
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
      using _n = render?.span("notify")
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
    // Resolve the post-state carrier for this render.
    //
    // Three cases:
    //   1. `opts.fresh` → throw-away carrier. Fresh renders must not consume
    //      the cross-frame snapshots (there's no prev buffer to clear from)
    //      and must not stomp the carried-forward snapshots (the next
    //      incremental render still needs them).
    //   2. `opts.postState` provided → use the caller-owned carrier. Required
    //      for renderer.ts / scheduler.ts which create a fresh Ag per frame
    //      and hold the carrier alongside `prevBuffer` at the instance level.
    //   3. Default → use the Ag-internal `_postState`. Correct for
    //      long-lived-Ag callers (runtime/renderer.ts) that reuse the same
    //      Ag instance across frames.
    const postState: RenderPostState = opts?.fresh
      ? createRenderPostState()
      : (opts?.postState ?? _postState)

    let tContent: number
    let buffer: TerminalBuffer
    {
      const t = performance.now()
      // Phase 2 Step 7: SILVERY_RENDER_PLAN wires the plan/commit substrate
      // at the production entry point. Closes the Check 1 gap from Phase 1
      // derisking (the flag was previously read by tests only).
      //
      // When enabled, the render-phase walk is wrapped in `withPlanCapture`
      // which TeeSinks every emission to BOTH the BufferSink (for reads
      // and direct mutation — cells are still on the buffer for getCellBg /
      // outline snapshot capture / dirty-row inspection) AND a frame-shared
      // PlanSink that builds the SectionedRenderPlan in lock-step.
      //
      // After the walk, the sectioned plan is committed onto a fresh frame
      // buffer and becomes the authoritative result. The BufferSink-mutated
      // buffer remains the read substrate during the walk so renderers that
      // still need intra-frame reads keep working, but final pixels now use
      // the structural order: transfer → cleanup → paint → overlay →
      // post-state. That makes cleanup/paint interleaving bugs
      // unrepresentable at the frame boundary.
      if (isRenderPlanEnabled()) {
        const layout = root.boxRect
        if (!layout) {
          throw new Error("doRender: SILVERY_RENDER_PLAN enabled but root has no boxRect")
        }
        const captured = withPlanCapture(layout.width, layout.height, () =>
          renderPhase(root, prevBuffer, ctx, postState, opts),
        )
        void captured.result
        const replay =
          prevBuffer && prevBuffer.width === layout.width && prevBuffer.height === layout.height
            ? prevBuffer.clone()
            : new TerminalBuffer(layout.width, layout.height)
        commitSectionedPlan(replay, captured.plan)
        buffer = replay
      } else {
        buffer = renderPhase(root, prevBuffer, ctx, postState, opts)
      }
      tContent = performance.now() - t
      log.debug?.(`content: ${tContent.toFixed(2)}ms`)
    }
    // Substrate references retained for the parity-test suite + Phase 6/7.
    void wrapPrevBufferForRecording
    void RecordingBuffer
    void classifyPlan

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
    // Tree-scoped subtree fade (the unfocused-pane dim) shares the backdrop
    // pass's PRE-fade carry-forward invariant: it is a NON-IDEMPOTENT post-
    // content transform, so the carried buffer MUST be the pre-fade clone or a
    // dimmed pane's blank cells compound one extra dim per frame
    // (@si/render/20517). See ./pipeline/subtree-fade.ts.
    const subtreeFadeActive = hasSubtreeFadeMarkers(root)
    if (backdropActive || subtreeFadeActive) {
      carryForwardBuffer = buffer.clone()
      if (!opts?.fresh) {
        _prevBuffer = carryForwardBuffer
      }
      const defaultBg = findRootThemeBg(root) ?? undefined
      // Theme ANSI-16 palette so palette-indexed chrome (parsed agent terminal
      // cyan etc.) fades toward the theme's color, not VGA teal (@km 19764).
      const palette = findRootThemeAnsi16(root) ?? undefined
      // Subtree fade runs FIRST — it historically ran during the content walk,
      // before the post-content backdrop pass painted the modal scrim on top.
      if (subtreeFadeActive) {
        applySubtreeFade(root, buffer, { colorLevel, defaultBg, palette })
      }
      if (backdropActive) {
        const result = applyBackdrop(root, buffer, {
          colorLevel,
          defaultBg,
          palette,
          kittyGraphics,
        })
        overlay = result.overlay
      }
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

    // Clear THIS tree's dirty tracking after each render pass. Content dirty
    // nodes were processed by renderPhase; layout dirty is managed by Flexily
    // internally (isDirty cleared after calculateLayout).
    if (!opts?.fresh) {
      clearDirtyTracking(root)
    }

    // Bench instrumentation: accumulate content-phase timing.
    const acc = (globalThis as any).__silvery_bench_phases
    if (acc) {
      acc.content += tContent
      acc.renderCalls += 1
    }

    const frame = createTextFrame(buffer)
    return { frame, buffer, carryForwardBuffer, prevBuffer, tContent, overlay, postState }
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
      // Nodes an Ag mints belong to the tree that Ag renders.
      epochOwner: root.epochOwner,
      layoutNode,
      boxRect: null,
      scrollRect: null,
      screenRect: null,
      prevLayout: null,
      prevScrollRect: null,
      prevScreenRect: null,
      layoutChangedThisFrame: INITIAL_EPOCH,
      dirtyBits: ALL_RECONCILER_BITS,
      dirtyEpoch: getRenderEpoch(root),
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
        postState: result.postState,
      }
    },

    resetBuffer() {
      _prevBuffer = null
      // Outline snapshots reference cell coordinates in the OLD buffer's
      // dimensions; if a resize is the reason resetBuffer is called, the
      // snapshots would point at the wrong cells. Reset both together.
      _postState = createRenderPostState()
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
      markDirty(node, CONTENT_BIT | STYLE_PROPS_BIT)
      if (node.layoutNode) {
        node.layoutNode.markDirty()
      }
    },

    toString() {
      return `[Ag root=${root.type} children=${root.children.length}]`
    },
  }
}
