/**
 * Node Creation and Layout Application
 *
 * Functions for creating SilveryNodes and applying layout properties.
 */

import { createLogger } from "loggily"
import type { LayoutNode } from "@silvery/ag/layout-types"
import { getConstants, getLayoutEngine, requireCapability } from "@silvery/ag-term/layout-engine"
import { collectPlainTextSkipHidden as collectNodeTextContent } from "@silvery/ag-term/pipeline/collect-text"
import {
  type BoxProps,
  type AgNode,
  type AgNodeType,
  type TextProps,
  type UserSelect,
  rectEqual,
} from "@silvery/ag/types"
import type { ViewportProps } from "@silvery/ag/viewport-types"
import {
  type Measurer,
  displayWidth,
  longestUnbreakableSegment,
  wrapText,
  getActiveLineHeight,
} from "@silvery/ag-term/unicode"
import {
  createEpochOwner,
  markDirty,
  type EpochOwner,
  INITIAL_EPOCH,
  isDirty,
  CONTENT_BIT,
  STYLE_PROPS_BIT,
  BG_BIT,
  SUBTREE_BIT,
  ALL_RECONCILER_BITS,
} from "@silvery/ag/epoch"

const measureLog = createLogger("silvery:measure")

// Import from shared module (lives in @silvery/ag-term to keep barrel React-free)
// Re-exported for consumers that imported from here previously
import { measureStats } from "@silvery/ag-term/pipeline/measure-stats"
export { measureStats }

import { syncRectSignals } from "@silvery/ag/layout-signals"

// Non-wrappable Text (wrap=truncate*|clip|false) reports natural width as both
// min-content and max-content — truncation itself is a paint-phase concern
// (render-text.ts:formatTextLines clips at layout.width). What the measureFunc
// must NOT do is report natural width against a DEFINITE width budget; see the
// resultWidth clamp below. Ink's historical `min(naturalWidth, N)` behavior
// used to need a shim here to get that clamp; the clamp is now unconditional,
// so Ink-compat and spec-correct silvery agree and the shim is gone.
//
// Tracking bead: km-silvery.text-intrinsic-vs-render.

// ============================================================================
// Node Creation
// ============================================================================

/**
 * Create a new SilveryNode with a fresh layout node.
 */
export function createNode(
  type: AgNodeType,
  props: BoxProps | TextProps | Record<string, unknown>,
  epochOwner: EpochOwner,
  measurer?: Measurer,
): AgNode {
  const layoutNode = getLayoutEngine().createNode()
  const epoch = epochOwner.epoch

  const node: AgNode = {
    type,
    props,
    children: [],
    parent: null,
    epochOwner,
    layoutNode,
    boxRect: null,
    scrollRect: null,
    screenRect: null,
    prevLayout: null,
    prevScrollRect: null,
    prevScreenRect: null,
    layoutChangedThisFrame: epoch,
    dirtyBits: ALL_RECONCILER_BITS,
    dirtyEpoch: epoch,
  }

  // Apply initial flexbox props to layout node
  if (type === "silvery-box") {
    applyBoxProps(layoutNode, props as BoxProps)
  } else if (type === "silvery-text") {
    // Text is a leaf flex item — apply the FlexboxProps subset declared by
    // TextFlexItemProps (flexGrow/flexShrink/flexBasis/alignSelf + min/max
    // dimensions). See `TextFlexItemProps` in @silvery/ag/types.
    applyTextFlexItemProps(layoutNode, props as TextProps)
  } else if (type === "silvery-viewport") {
    // Viewport is a leaf with fixed cols × rows. No flex children, no measure
    // function — the foreign cell buffer is blitted by the render phase at
    // boxRect. See bead @km/silvery/15513.
    applyViewportProps(layoutNode, props as unknown as ViewportProps)
  } else if (type === "silvery-island") {
    // Island is a leaf with intrinsic cols × rows hints — parent flex/layout
    // overrides at the layout phase. The guest's cell buffer is blitted by
    // the render phase at boxRect. See bead @km/silvery/15646.
    applyIslandProps(layoutNode, props as IslandLayoutProps)
  }

  // Set up measure function for text nodes
  // This tells the layout engine how to calculate the text's intrinsic size
  if (type === "silvery-text") {
    // Cache for measure results - avoid recalculating if text and constraints unchanged
    // Cache multiple (width, widthMode) -> result entries since layout calls measure with different widths
    let cachedText: string | null = null
    const measureCache = new Map<string, { width: number; height: number }>()

    layoutNode.setMeasureFunc((width, widthMode, height, heightMode) => {
      measureStats.calls++
      // Log measure calls through loggily (zero-cost when disabled via optional chaining)
      measureLog.debug?.(
        `measure "${collectNodeTextContent(node).slice(0, 40)}" width=${width} widthMode=${widthMode} height=${height} heightMode=${heightMode}`,
      )

      // Fast path: check if we have a cached result for this exact constraint
      // This avoids text collection entirely if we've measured this before
      const cacheKey = `${width}|${widthMode}|${height}|${heightMode}`
      const cached = measureCache.get(cacheKey)
      if (cached && cachedText !== null && !isDirty(node, CONTENT_BIT)) {
        measureStats.cacheHits++
        return cached
      }

      // Collect text content from this node and its raw text children
      // Use cached text if node hasn't been marked dirty (contentDirty)
      let text: string
      if (cachedText !== null && !isDirty(node, CONTENT_BIT)) {
        text = cachedText
      } else {
        measureStats.textCollects++
        const newText = collectNodeTextContent(node)
        // Only clear measurement cache if text actually changed
        if (newText !== cachedText) {
          measureCache.clear()
        }
        text = newText
        cachedText = text
        // Clear CONTENT_BIT so subsequent measure calls in same layout pass use cache.
        // NOTE: This means the render phase won't see contentDirty=true for text nodes
        // whose content changed. The render phase uses stylePropsDirty (which survives the
        // measure phase) combined with the node type check to correctly identify text
        // nodes that need region clearing. See contentAreaAffected in render-phase.ts.
        node.dirtyBits &= ~CONTENT_BIT
      }
      if (!text) {
        return { width: 0, height: 0 }
      }

      // Check cache again (may have been preserved if text unchanged)
      const cachedAfterCollect = measureCache.get(cacheKey)
      if (cachedAfterCollect) {
        measureStats.cacheHits++
        return cachedAfterCollect
      }

      // Calculate text dimensions
      const lines = text.split("\n")
      // Treat NaN width the same as unconstrained (can happen with auto-sized parents).
      // The flexily-only "min-content" mode is treated as "AT_MOST 0" for the
      // wrap branch: any wrap opportunity floors at the longest unbreakable
      // word; non-wrappable text returns naturalWidth (the isTruncate branch
      // ignores maxWidth at intrinsic-sizing time).
      const isMinContentQuery = widthMode === "min-content"
      const maxWidth =
        widthMode === "undefined" || Number.isNaN(width)
          ? Number.POSITIVE_INFINITY
          : isMinContentQuery
            ? 0
            : width

      // Wrap mode classification — separates intrinsic-sizing semantics
      // (CSS-aligned) from paint-time clipping (handled by
      // render-text.ts:formatTextLines reading layout.width).
      //
      // CSS analogy for non-wrappable text (wrap="truncate*" / "clip" / false):
      //   white-space: nowrap → min-content == max-content == naturalWidth
      //   (no wrap opportunities; the line is one unbreakable token at
      //   intrinsic-sizing time). Truncation/clipping moves to the paint
      //   phase: render-text.ts applies the ellipsis or hard-clip at
      //   layout.width.
      //
      // CSS analogy for wrappable text (wrap="wrap" / "even" / undefined)
      // and word-break: break-all (wrap="hard"):
      //   min-content < max-content. Today this measureFunc reports the
      //   AT_MOST-constrained wrap result for both queries, which matches
      //   max-content for unconstrained queries and the post-wrap width
      //   under per-child constraints. A future Phase 2 introduces a
      //   distinct min-content protocol — see bead
      //   km-silvery.text-intrinsic-vs-render.
      //
      // Reference: pro review 2026-04-26 (GPT-5.4 Pro + Kimi K2.6) and
      // bead km-silvery.text-intrinsic-vs-render.
      const { wrap } = node.props as TextProps
      const isTruncate =
        wrap === "truncate" ||
        wrap === "truncate-start" ||
        wrap === "truncate-middle" ||
        wrap === "truncate-end" ||
        wrap === "clip" ||
        wrap === false
      // Hard wrap: character-level wrapping, not word-aware. Each line that
      // exceeds maxWidth is sliced into chunks of exactly maxWidth.
      const isHardWrap = wrap === "hard"
      // wrap-truncate: word-aware wrap with ellipsis fallback for atomic
      // tokens that can't break. Measure path threads the flag into the
      // measurer so intrinsic line count matches the render-time output —
      // otherwise layout reserves char-wrapped row count but render emits
      // one truncated line, leaving blank rows below.
      const isWrapTruncate = wrap === "wrap-truncate"

      // internal_transform (set by <Transform>) is applied per-rendered-line
      // and can change the line's display width. fit-content and other
      // intrinsic-sizing queries must reflect the post-transform width — see
      // pipeline-bugfixes.test.tsx "measure-fit-transform".
      const internalTransform = (node.props as TextProps).internal_transform

      // Calculate actual dimensions based on wrapping
      // Use wrapText() for accurate line count — must match the render phase
      // (render-text.ts formatTextLines) which also uses wrapText()
      let totalHeight = 0
      let actualWidth = 0

      // Use explicit measurer when available, fall back to module-level convenience functions
      const dw = measurer ? measurer.displayWidth.bind(measurer) : displayWidth
      const wt = measurer ? measurer.wrapText.bind(measurer) : wrapText

      const lh = getActiveLineHeight() // 1 in cell mode, lineHeightPx in pixel mode

      // Track the index of each rendered line (post-wrap, pre-transform) so
      // internal_transform receives the same (line, index) pairs the render
      // phase will produce. Reset per measure call.
      let renderedLineIndex = 0
      const widthFor = (line: string): number => {
        if (!internalTransform) return dw(line)
        const transformed = internalTransform(line, renderedLineIndex)
        return dw(transformed)
      }

      for (const line of lines) {
        measureStats.displayWidthCalls++
        const lineWidth = dw(line)
        if (isTruncate) {
          // Non-wrappable text. CSS analogue: `text-overflow: ellipsis`
          // (or `clip`) with `white-space: nowrap`. The element implicitly
          // declares "I'll fit in any width — overflow becomes ellipsis."
          //
          // min-content = 1 cell (one for the ellipsis) so flexbox CAN
          // shrink the Text below natural width. Without this, a
          // `<Text wrap="truncate">` in a narrow container reports
          // min-content = max-content = full natural width, the parent
          // gets pinned at natural width, the parent's overflow="hidden"
          // hard-clips with no ellipsis. User report 2026-05-11
          // (@km/silvery/text-truncation-mid-word-no-ellipsis):
          // "ProjectedMap auto-stabilization + render watc" — the "watc"
          // is a hard-clip at the parent's render-time width, with the
          // truncateText ellipsis path never reached because flex never
          // shrank the Text.
          //
          // max-content stays at natural width — fit-content / shrink-
          // wrap queries still see the full text so an unconstrained
          // parent sizes to the natural content width.
          totalHeight += lh
          if (isMinContentQuery) {
            actualWidth = Math.max(actualWidth, lineWidth > 0 ? 1 : 0)
          } else {
            actualWidth = Math.max(actualWidth, widthFor(line))
          }
          renderedLineIndex++
        } else if (isHardWrap) {
          if (isMinContentQuery) {
            // Hard-wrap min-content: any character can break, so min = 1
            // cell (or 0 for an empty line). Height is 1 — actual layout
            // computes wrapped height at the allocated width.
            totalHeight += lh
            actualWidth = Math.max(actualWidth, lineWidth > 0 ? 1 : 0)
            renderedLineIndex++
          } else if (lineWidth <= maxWidth) {
            totalHeight += lh
            actualWidth = Math.max(actualWidth, widthFor(line))
            renderedLineIndex++
          } else if (Number.isFinite(maxWidth) && maxWidth > 0) {
            // Character-level hard wrap: ceil(lineWidth / maxWidth) lines.
            const wrappedCount = Math.ceil(lineWidth / maxWidth)
            totalHeight += wrappedCount * lh
            actualWidth = Math.max(actualWidth, maxWidth)
            renderedLineIndex += wrappedCount
          } else {
            totalHeight += lh
            actualWidth = Math.max(actualWidth, widthFor(line))
            renderedLineIndex++
          }
        } else if (isMinContentQuery) {
          // Wrappable min-content: longest unbreakable segment between
          // ALL break opportunities the wrap algorithm would actually
          // honor. CSS min-content is the longest run of characters that
          // cannot break — for our wrap algorithm that includes both hard
          // boundaries (whitespace, hyphens) AND soft separators (`/`,
          // `\`, `.`, `_`, `:`) per `isSoftBreakPoint`.
          //
          // Without the soft-break aware split, paths like
          // `.claude/skills/{claim,do}/SKILL.md` reported their full
          // width as min-content, pinning parent Boxes wider than the
          // assigned cell budget — content overflowed the card border
          // when soft-wrap would have fit it just fine.
          //
          // Strategy: split on whitespace (primary) and on soft-break
          // points (secondary). The widest segment between any two
          // break opportunities is the true min-content for wrap.
          const longestSegment = longestUnbreakableSegment(line, dw)
          // Height at min-content: a single line per source line. Actual
          // wrapped height is computed when the layout pass measures with
          // the assigned width.
          totalHeight += lh
          actualWidth = Math.max(actualWidth, longestSegment)
          renderedLineIndex++
        } else {
          // Wrappable text (wrap, wrap-truncate, even, undefined) under
          // exact/at-most/undefined.
          if (lineWidth <= maxWidth) {
            totalHeight += lh
            actualWidth = Math.max(actualWidth, widthFor(line))
            renderedLineIndex++
          } else {
            // wrap-truncate: pass the truncate-atomic-overflow flag so the
            // measured line count matches what render emits.
            const wrapped = wt(line, maxWidth, false, true, isWrapTruncate)
            totalHeight += wrapped.length * lh
            for (const wl of wrapped) {
              actualWidth = Math.max(actualWidth, widthFor(wl))
              renderedLineIndex++
            }
          }
        }
      }

      // Respect height constraint from layout engine.
      // When heightMode is "at-most", the text should not exceed the available height.
      // When heightMode is "exactly", the text should be exactly that height.
      // This prevents text from overflowing into parent border rows.
      let resultHeight = Math.max(lh, totalHeight)
      if (heightMode === "exactly" && Number.isFinite(height)) {
        resultHeight = height
      } else if (heightMode === "at-most" && Number.isFinite(height)) {
        resultHeight = Math.min(resultHeight, height)
      }

      // Final width:
      //   - min-content query: return actualWidth as-is — the maxWidth
      //     clamp would zero out the longest-word answer (we set
      //     maxWidth=0 above for the min-content protocol).
      //   - everything else: clamp to maxWidth. For wrappable text that makes
      //     flex distribution see post-wrap width (wrapped "Hello world" at
      //     width=6 reports 5, the longest wrapped line). For non-wrappable
      //     text the clamp is inert on the max-content query (maxWidth is
      //     Infinity when widthMode is "undefined", so shrink-wrap parents
      //     still size to full natural width) and load-bearing under a
      //     DEFINITE budget: "at-most"/"exactly" is the container stating how
      //     much room the item actually gets, which is a used-size question,
      //     not an intrinsic one. Answering natural width there puts the item
      //     outside its parent's content box — on the CROSS axis nothing ever
      //     pulls it back, because flexily only issues the min-content query
      //     that lets shrink rescue the MAIN axis. That is how a
      //     `wrap="truncate"` Text in a bordered column painted straight over
      //     the right border (@yrd RUNNER box, 2026-08-13). The height branch
      //     directly above has honored "at-most" for the same reason since
      //     text started overflowing into parent border ROWS.
      const resultWidth = isMinContentQuery ? actualWidth : Math.min(actualWidth, maxWidth)
      const result = {
        width: resultWidth,
        height: resultHeight,
      }
      measureCache.set(cacheKey, result)
      return result
    })
  }

  return node
}

// collectNodeTextContent is imported from @silvery/ag-term/pipeline/collect-text
// as collectPlainTextSkipHidden. Previously duplicated here; now shared with
// measure-phase.ts and render-text.ts via the shared collect-text module.

/**
 * Create the root node for the Silvery tree.
 * Root is always column (document flow is top-to-bottom), regardless of
 * flexily's default flexDirection.
 */
export function createRootNode(): AgNode {
  // A root IS a tree, so it mints the epoch state every node under it shares.
  const node = createNode("silvery-root", {}, createEpochOwner())
  const c = getConstants()
  if (!node.layoutNode) {
    throw new Error("Silvery root creation did not create its required layout node")
  }
  node.layoutNode.setFlexDirection(c.FLEX_DIRECTION_COLUMN)
  return node
}

/**
 * Create a virtual text node (for nested text elements).
 * Virtual text nodes don't have layout nodes and don't participate in layout.
 * They're used when Text is nested inside another Text.
 */
export function createVirtualTextNode(props: TextProps, epochOwner: EpochOwner): AgNode {
  const epoch = epochOwner.epoch
  return {
    type: "silvery-text",
    props,
    children: [],
    parent: null,
    epochOwner,
    layoutNode: null, // No layout node for virtual text
    boxRect: null,
    scrollRect: null,
    screenRect: null,
    prevLayout: null,
    prevScrollRect: null,
    prevScreenRect: null,
    layoutChangedThisFrame: INITIAL_EPOCH,
    dirtyBits: CONTENT_BIT | STYLE_PROPS_BIT | BG_BIT | SUBTREE_BIT,
    dirtyEpoch: epoch,
    isRawText: false, // Not raw text, but virtual (nested) text
    inlineRects: null,
  }
}

// ============================================================================
// Layout Property Application
// ============================================================================

/**
 * Apply ViewportProps to a viewport node's layout node.
 *
 * A `<Viewport>` is a leaf with fixed `cols`×`rows` — no flex children, no
 * measure function. We pin width/height from the props so the parent layout
 * positions the viewport rect deterministically; if the parent rect is
 * narrower, flexbox + parent overflow="hidden" clips at paint time.
 *
 * See bead `@km/silvery/15513-surface-nested-composition-primitive`.
 */
export function applyViewportProps(
  layoutNode: LayoutNode,
  props: ViewportProps,
  oldProps?: ViewportProps,
): void {
  if (props.cols !== undefined) {
    layoutNode.setWidth(props.cols)
  } else if (oldProps?.cols !== undefined) {
    layoutNode.setWidthAuto()
  }
  if (props.rows !== undefined) {
    layoutNode.setHeight(props.rows)
  } else if (oldProps?.rows !== undefined) {
    layoutNode.setHeightAuto()
  }
}

/**
 * Layout-relevant slice of <Island> props.
 *
 * Islands are leaf flex items that ALSO carry guest-contract dims. The two
 * are intentionally decoupled:
 *
 * - `cols` / `rows` — initial dimensions for the **guest's cell grid**. PTY
 *   guests need them to spawn the child process; snapshot guests use them
 *   as the frame size. Live for the guest's first paint; subsequent resizes
 *   flow through `IslandSizeOwner.requestResize` (two-phase ack).
 *
 * - `width` / `height` / `flexGrow` / `flexShrink` / `flexBasis` / `alignSelf` /
 *   `minWidth` / `minHeight` / `maxWidth` / `maxHeight` — control the **layout
 *   slot** in flexily, exactly like any other flex item (Box, Text). When
 *   present, they override `cols` / `rows` for layout purposes. When the
 *   layout-derived dim differs from what the guest is rendering at, the host
 *   calls `handle.size.requestResize(layoutCols, layoutRows)` so the guest can
 *   acknowledge.
 *
 * Default behavior:
 *   - `<Island cols=80 rows=24 />` — fixed 80×24 slot, guest renders at 80×24.
 *   - `<Island cols=80 rows=24 flexGrow=1 />` — guest spawns at 80×24, flex
 *     grows the slot, host immediately requests resize to the new dims.
 *   - `<Island cols=80 rows=24 width=120 />` — guest spawns at 80×24, slot is
 *     120 wide, host requests resize to 120.
 *
 * The seven dimension props share the Box/Text length path. Adapter grammar
 * and axis checks apply equally to Island layout slots.
 */
export interface IslandLayoutProps {
  /** Stable focus/test identity, matching Box/Text `testID` semantics. */
  testID?: string
  /** Initial guest cell-grid width (cells). Required at the <Island> surface;
   *  optional here because oldProps may have already pinned it on a re-apply. */
  cols?: number
  /** Initial guest cell-grid height (cells). */
  rows?: number
  /** Whether this island participates in tree focus navigation. */
  focusable?: boolean
  /** CSS user-select equivalent for the island's guest cell grid. */
  userSelect?: UserSelect
  /** Explicit layout slot width (cells or "N%"). Overrides `cols` for layout. */
  width?: number | string
  /** Explicit layout slot height. Overrides `rows` for layout. */
  height?: number | string
  /** CSS `flex-grow` — proportion of free positive space along the main axis. */
  flexGrow?: number
  /** CSS `flex-shrink`. */
  flexShrink?: number
  /** CSS `flex-basis` — initial main-size before grow/shrink distribution. */
  flexBasis?: number | string
  /** Cross-axis self-alignment override. */
  alignSelf?: "auto" | "flex-start" | "flex-end" | "center" | "stretch" | "baseline"
  /** CSS `min-width` — floor for shrink distribution. */
  minWidth?: number | string
  /** CSS `min-height`. */
  minHeight?: number | string
  /** CSS `max-width` — ceiling for grow distribution. */
  maxWidth?: number | string
  /** CSS `max-height`. */
  maxHeight?: number | string
}

const lengthSetters = {
  width: "setWidth",
  height: "setHeight",
  minWidth: "setMinWidth",
  minHeight: "setMinHeight",
  maxWidth: "setMaxWidth",
  maxHeight: "setMaxHeight",
  flexBasis: "setFlexBasis",
} as const

type LengthProp = keyof typeof lengthSetters | "top" | "left" | "bottom" | "right"

function positionPercent(prop: string, input: string): number {
  const match = /^([+-]?(?:\d*\.\d+|\d+)(?:e[+-]?\d+)?)%$/i.exec(input.trim())
  if (match && Number.isFinite(Number(match[1]))) return Number(match[1])
  throw new TypeError(
    `${prop}: ${JSON.stringify(input)} — offsets accept numeric cells or a valid N%; math waits for #26238.`,
  )
}

/** Validate raw values before specificity or any node mutation. */
function validateRawLengths(props: object, component: "Box" | "Text" | "Island"): void {
  const raw = props as Record<string, unknown>
  for (const prop of [
    "padding",
    "paddingX",
    "paddingY",
    "paddingTop",
    "paddingBottom",
    "paddingLeft",
    "paddingRight",
    "margin",
    "marginX",
    "marginY",
    "marginTop",
    "marginBottom",
    "marginLeft",
    "marginRight",
    "gap",
    "rowGap",
    "columnGap",
  ]) {
    const value = raw[prop]
    if (typeof value === "string" && !(prop.startsWith("margin") && value === "auto")) {
      throw new TypeError(
        `<${component} ${prop}>: ${JSON.stringify(value)} — use numeric cells; spacing math waits for #26238.`,
      )
    }
  }
  for (const prop of ["top", "left", "bottom", "right"]) {
    const value = raw[prop]
    if (typeof value === "string") positionPercent(`<${component} ${prop}>`, value)
  }
}

/** One prop route. Adapters own string grammar, unit scale and capability errors. */
function applyLength(
  layoutNode: LayoutNode,
  prop: LengthProp,
  value: number | string | undefined,
  oldValue?: number | string,
): void {
  if (prop === "top" || prop === "left" || prop === "bottom" || prop === "right") {
    const c = getConstants()
    const edge = { top: c.EDGE_TOP, left: c.EDGE_LEFT, bottom: c.EDGE_BOTTOM, right: c.EDGE_RIGHT }[
      prop
    ]
    if (typeof value === "string") layoutNode.setPositionPercent(edge, positionPercent(prop, value))
    else layoutNode.setPosition(edge, value ?? NaN)
    return
  }
  if (Object.is(value, oldValue)) return
  if (value !== undefined) {
    layoutNode[lengthSetters[prop]](value)
    return
  }
  if (prop === "width") layoutNode.setWidthAuto()
  else if (prop === "height") layoutNode.setHeightAuto()
  else if (prop === "flexBasis") layoutNode.setFlexBasisAuto()
  else layoutNode[lengthSetters[prop]](prop.startsWith("min") ? 0 : Infinity)
}

/**
 * Apply IslandProps to an island node's layout node.
 *
 * `<Island>` is a leaf — guest content lives off the AgNode's `islandState`
 * slot, blitted by the render phase at boxRect. Layout-dim resolution:
 * explicit `width` / `height` wins; otherwise fall back to `cols` / `rows`.
 *
 * See bead `@km/silvery/15646-islands` for the two-phase resize protocol
 * (guest acks via `IslandSizeOwner` after host writes new dims).
 */
export function applyIslandProps(
  layoutNode: LayoutNode,
  props: IslandLayoutProps,
  oldProps?: IslandLayoutProps,
): void {
  validateRawLengths(props, "Island")
  const c = getConstants()
  const wasRemoved = (prop: keyof IslandLayoutProps): boolean =>
    oldProps?.[prop] !== undefined && props[prop] === undefined

  // ─── Width: explicit `width` wins; fall back to `cols` ─────────────────
  applyLength(layoutNode, "width", props.width ?? props.cols, oldProps?.width ?? oldProps?.cols)

  // ─── Height: explicit `height` wins; fall back to `rows` ───────────────
  applyLength(layoutNode, "height", props.height ?? props.rows, oldProps?.height ?? oldProps?.rows)

  // ─── Flex item props (mirror applyTextFlexItemProps semantics) ─────────
  if (props.flexGrow !== undefined) {
    layoutNode.setFlexGrow(props.flexGrow)
  } else if (wasRemoved("flexGrow")) {
    layoutNode.setFlexGrow(0)
  }

  if (props.flexShrink !== undefined) {
    layoutNode.setFlexShrink(props.flexShrink)
  } else if (wasRemoved("flexShrink")) {
    layoutNode.setFlexShrink(1)
  }

  applyLength(layoutNode, "flexBasis", props.flexBasis, oldProps?.flexBasis)

  if (props.alignSelf !== undefined) {
    if (props.alignSelf === "auto") {
      layoutNode.setAlignSelf(c.ALIGN_AUTO)
    } else {
      layoutNode.setAlignSelf(alignToConstant(props.alignSelf))
    }
  } else if (wasRemoved("alignSelf")) {
    layoutNode.setAlignSelf(c.ALIGN_AUTO)
  }

  // ─── Min / max dimensions ──────────────────────────────────────────────
  applyLength(layoutNode, "minWidth", props.minWidth, oldProps?.minWidth)

  applyLength(layoutNode, "minHeight", props.minHeight, oldProps?.minHeight)

  applyLength(layoutNode, "maxWidth", props.maxWidth, oldProps?.maxWidth)

  applyLength(layoutNode, "maxHeight", props.maxHeight, oldProps?.maxHeight)
}

/**
 * Apply TextFlexItemProps to a Text node's layout node.
 *
 * Text is a leaf flex item — it accepts the subset of FlexboxProps that
 * affect how it participates as a flex item (sizing, growth, shrink),
 * not the props that affect how it lays out children. This is the
 * canonical CSS escape hatch: use `flexShrink={0}` to keep a Text rigid,
 * or `minWidth={0}` to let it shrink fully under a tight parent.
 *
 * See `TextFlexItemProps` in @silvery/ag/types.
 */
export function applyTextFlexItemProps(
  layoutNode: LayoutNode,
  props: TextProps,
  oldProps?: TextProps,
): void {
  validateRawLengths(props, "Text")
  const c = getConstants()
  const wasRemoved = (prop: keyof TextProps): boolean =>
    oldProps?.[prop] !== undefined && props[prop] === undefined

  applyLength(layoutNode, "width", props.width, oldProps?.width)
  applyLength(layoutNode, "height", props.height, oldProps?.height)

  if (props.flexGrow !== undefined) {
    layoutNode.setFlexGrow(props.flexGrow)
  } else if (wasRemoved("flexGrow")) {
    layoutNode.setFlexGrow(0)
  }

  if (props.flexShrink !== undefined) {
    layoutNode.setFlexShrink(props.flexShrink)
  } else if (wasRemoved("flexShrink")) {
    layoutNode.setFlexShrink(1)
  }

  applyLength(layoutNode, "flexBasis", props.flexBasis, oldProps?.flexBasis)

  if (props.alignSelf !== undefined) {
    if (props.alignSelf === "auto") {
      layoutNode.setAlignSelf(c.ALIGN_AUTO)
    } else {
      layoutNode.setAlignSelf(alignToConstant(props.alignSelf))
    }
  } else if (wasRemoved("alignSelf")) {
    layoutNode.setAlignSelf(c.ALIGN_AUTO)
  }

  applyLength(layoutNode, "minWidth", props.minWidth, oldProps?.minWidth)

  applyLength(layoutNode, "minHeight", props.minHeight, oldProps?.minHeight)

  applyLength(layoutNode, "maxWidth", props.maxWidth, oldProps?.maxWidth)

  applyLength(layoutNode, "maxHeight", props.maxHeight, oldProps?.maxHeight)
}

/**
 * Parse a `fitWidth` entry from user-facing form (number | string) to the
 * engine's FitWidthLane shape (number | { value, unit: "cqi" | "cqmin" }).
 *
 * Accepted strings: `"100cqi"`, `"50cqmin"` — decimal and integer values both
 * fine. Numbers pass through unchanged. Invalid strings throw with a clear
 * pointer to the bug — the layout engine consumes only the parsed form, so
 * parse-fail at the React seam is the right place.
 */
function parseFitWidthEntry(
  entry: number | string,
): number | { value: number; unit: "cqi" | "cqmin" } {
  if (typeof entry === "number") return entry
  const cqiMatch = entry.match(/^(\d+(?:\.\d+)?)cqi$/)
  if (cqiMatch) return { value: Number.parseFloat(entry.slice(0, -3)), unit: "cqi" }
  const cqminMatch = entry.match(/^(\d+(?:\.\d+)?)cqmin$/)
  if (cqminMatch) return { value: Number.parseFloat(entry.slice(0, -5)), unit: "cqmin" }
  throw new Error(
    `<Box fitWidth>: invalid lane entry ${JSON.stringify(entry)}. ` +
      `Expected a number (cells) or a string like "100cqi" / "50cqmin".`,
  )
}

/**
 * Apply BoxProps to a layout node.
 * This maps Ink/Silvery props to the layout engine API.
 */
export function applyBoxProps(layoutNode: LayoutNode, props: BoxProps, oldProps?: BoxProps): void {
  validateRawLengths(props, "Box")
  const c = getConstants()
  // Helper: true when a prop was set in oldProps but not in newProps (prop removed on rerender)
  const wasRemoved = (prop: keyof BoxProps): boolean =>
    oldProps?.[prop] !== undefined && props[prop] === undefined

  // Dimensions
  applyLength(layoutNode, "width", props.width, oldProps?.width)

  applyLength(layoutNode, "height", props.height, oldProps?.height)

  // Min/Max dimensions
  applyLength(layoutNode, "minWidth", props.minWidth, oldProps?.minWidth)

  applyLength(layoutNode, "minHeight", props.minHeight, oldProps?.minHeight)

  applyLength(layoutNode, "maxWidth", props.maxWidth, oldProps?.maxWidth)

  applyLength(layoutNode, "maxHeight", props.maxHeight, oldProps?.maxHeight)

  // Flex properties
  if (props.flexGrow !== undefined) {
    layoutNode.setFlexGrow(props.flexGrow)
  } else if (wasRemoved("flexGrow")) {
    layoutNode.setFlexGrow(0)
  }

  if (props.flexShrink !== undefined) {
    layoutNode.setFlexShrink(props.flexShrink)
  } else if (wasRemoved("flexShrink")) {
    layoutNode.setFlexShrink(1)
  }

  applyLength(layoutNode, "flexBasis", props.flexBasis, oldProps?.flexBasis)

  // Flex direction
  if (props.flexDirection !== undefined) {
    const directionMap: Record<string, number> = {
      row: c.FLEX_DIRECTION_ROW,
      column: c.FLEX_DIRECTION_COLUMN,
      "row-reverse": c.FLEX_DIRECTION_ROW_REVERSE,
      "column-reverse": c.FLEX_DIRECTION_COLUMN_REVERSE,
    }
    layoutNode.setFlexDirection(directionMap[props.flexDirection] ?? c.FLEX_DIRECTION_ROW)
  } else if (wasRemoved("flexDirection")) {
    layoutNode.setFlexDirection(c.FLEX_DIRECTION_ROW)
  }

  // Flex wrap
  if (props.flexWrap !== undefined) {
    const wrapMap: Record<string, number> = {
      nowrap: c.WRAP_NO_WRAP,
      wrap: c.WRAP_WRAP,
      "wrap-reverse": c.WRAP_WRAP_REVERSE,
    }
    layoutNode.setFlexWrap(wrapMap[props.flexWrap] ?? c.WRAP_NO_WRAP)
  } else if (wasRemoved("flexWrap")) {
    layoutNode.setFlexWrap(c.WRAP_NO_WRAP)
  }

  // Alignment
  if (props.alignItems !== undefined) {
    layoutNode.setAlignItems(alignToConstant(props.alignItems))
  } else if (wasRemoved("alignItems")) {
    layoutNode.setAlignItems(c.ALIGN_STRETCH)
  }

  if (props.alignSelf !== undefined) {
    if (props.alignSelf === "auto") {
      layoutNode.setAlignSelf(c.ALIGN_AUTO)
    } else {
      layoutNode.setAlignSelf(alignToConstant(props.alignSelf))
    }
  } else if (wasRemoved("alignSelf")) {
    layoutNode.setAlignSelf(c.ALIGN_AUTO)
  }

  if (props.alignContent !== undefined) {
    layoutNode.setAlignContent(alignToConstant(props.alignContent))
  } else if (wasRemoved("alignContent")) {
    layoutNode.setAlignContent(c.ALIGN_FLEX_START)
  }

  if (props.justifyContent !== undefined) {
    layoutNode.setJustifyContent(justifyToConstant(props.justifyContent))
  } else if (wasRemoved("justifyContent")) {
    layoutNode.setJustifyContent(c.JUSTIFY_FLEX_START)
  }

  // Padding
  applySpacing(layoutNode, "padding", props)

  // Margin
  applySpacing(layoutNode, "margin", props)

  // Gap
  if (props.gap !== undefined) {
    layoutNode.setGap(c.GUTTER_ALL, props.gap)
  } else if (wasRemoved("gap")) {
    layoutNode.setGap(c.GUTTER_ALL, 0)
  }

  if (props.columnGap !== undefined) {
    layoutNode.setGap(c.GUTTER_COLUMN, props.columnGap)
  } else if (wasRemoved("columnGap")) {
    layoutNode.setGap(c.GUTTER_COLUMN, 0)
  }

  if (props.rowGap !== undefined) {
    layoutNode.setGap(c.GUTTER_ROW, props.rowGap)
  } else if (wasRemoved("rowGap")) {
    layoutNode.setGap(c.GUTTER_ROW, 0)
  }

  // Display
  if (props.display !== undefined) {
    layoutNode.setDisplay(props.display === "none" ? c.DISPLAY_NONE : c.DISPLAY_FLEX)
  } else if (wasRemoved("display")) {
    layoutNode.setDisplay(c.DISPLAY_FLEX)
  }

  // Position
  // Note: 'sticky' is handled at render-time, not by layout engine. For layout purposes, treat as relative.
  if (props.position !== undefined) {
    if (props.position === "absolute") {
      layoutNode.setPositionType(c.POSITION_TYPE_ABSOLUTE)
    } else if (props.position === "static") {
      layoutNode.setPositionType(c.POSITION_TYPE_STATIC)
    } else {
      layoutNode.setPositionType(c.POSITION_TYPE_RELATIVE)
    }
  } else if (wasRemoved("position")) {
    layoutNode.setPositionType(c.POSITION_TYPE_RELATIVE)
  }

  // Position offsets (top, left, bottom, right)
  // Skip offsets for position="static" — static positioning ignores offsets (CSS spec).
  if (props.position !== "static") {
    applyLength(layoutNode, "top", props.top, oldProps?.top)
    applyLength(layoutNode, "left", props.left, oldProps?.left)
    applyLength(layoutNode, "bottom", props.bottom, oldProps?.bottom)
    applyLength(layoutNode, "right", props.right, oldProps?.right)
  }

  // Aspect ratio
  if (props.aspectRatio !== undefined) {
    layoutNode.setAspectRatio(props.aspectRatio)
  } else if (wasRemoved("aspectRatio")) {
    layoutNode.setAspectRatio(NaN)
  }

  // Overflow
  // Derive effective overflow: explicit overflow takes precedence, then per-axis (hidden if either axis is hidden)
  const effectiveOverflow =
    props.overflow ??
    (props.overflowX === "hidden" || props.overflowY === "hidden" ? "hidden" : undefined)
  if (effectiveOverflow !== undefined) {
    if (effectiveOverflow === "hidden") {
      layoutNode.setOverflow(c.OVERFLOW_HIDDEN)
    } else if (effectiveOverflow === "scroll") {
      // Use OVERFLOW_HIDDEN for layout so children are constrained to parent width
      // (text wraps instead of overflowing). The render phase reads props.overflow
      // to enable vertical scroll behavior independently of the layout constraint.
      layoutNode.setOverflow(c.OVERFLOW_HIDDEN)
    } else {
      layoutNode.setOverflow(c.OVERFLOW_VISIBLE)
    }
  } else if (wasRemoved("overflow") || wasRemoved("overflowX") || wasRemoved("overflowY")) {
    layoutNode.setOverflow(c.OVERFLOW_VISIBLE)
  }

  // Container queries (A0.1) — wired only when the active engine advertises the
  // capability. Under yoga, `requireCapability` throws at first paint with the
  // one-line fix (SILVERY_ENGINE=flexily). Phase 1 contains inline-size only;
  // `containerName` is reserved for forward-compat (matcher arrives in Phase A).
  //
  // The numeric mapping mirrors flexily's CONTAINER_TYPE_NORMAL=0 / INLINE_SIZE=1.
  // Hardcoded at this seam to avoid widening LayoutConstants for two values that
  // don't roundtrip through yoga (yoga has no equivalent).
  if (props.containerType !== undefined) {
    requireCapability("containerQueries", "<Box containerType>")
    layoutNode.setContainerType(props.containerType === "inline-size" ? 1 : 0)
  } else if (wasRemoved("containerType")) {
    layoutNode.setContainerType(0)
  }
  if (props.containSize !== undefined) {
    requireCapability("containSize", "<Box containSize>")
    layoutNode.setContainSize(props.containSize)
  } else if (wasRemoved("containSize")) {
    layoutNode.setContainSize(false)
  }
  // containerQueries — substrate prop, no engine wiring yet. The Phase A
  // silvery-layer matcher will read this prop on the React side, not push it
  // into the layout engine. We DO surface a capability check so consumers under
  // yoga get the same one-line-fix error shape as the other CQ primitives.
  if (props.containerQueries !== undefined) {
    requireCapability("containerQueries", "<Box containerQueries>")
  }

  // fitWidth (A0.2). Parse string entries like "100cqi" / "50cqmin" into the
  // engine's FitWidthLane shape. Plain numbers pass through. Invalid strings
  // throw with a clear message — silvery's prop layer is the authoritative
  // place to do this validation (the layout engine just consumes the parsed form).
  if (props.fitWidth !== undefined) {
    requireCapability("fitWidth", "<Box fitWidth>")
    layoutNode.setFitWidth(props.fitWidth.map(parseFitWidthEntry))
  } else if (wasRemoved("fitWidth")) {
    layoutNode.setFitWidth(undefined)
  }

  // Border (affects layout - 1 cell per border side in terminal mode).
  // In pixel/canvas mode (lineHeight > 1), borders are visual-only — drawn by
  // fillRoundedRect, not layout-affecting box-drawing characters. Set width to 0
  // so flexily doesn't steal space from content for invisible character borders.
  if (props.borderStyle) {
    const borderWidth = getActiveLineHeight() > 1 ? 0 : 1
    if (props.borderTop !== false) {
      layoutNode.setBorder(c.EDGE_TOP, borderWidth)
    } else {
      layoutNode.setBorder(c.EDGE_TOP, 0)
    }
    if (props.borderBottom !== false) {
      layoutNode.setBorder(c.EDGE_BOTTOM, borderWidth)
    } else {
      layoutNode.setBorder(c.EDGE_BOTTOM, 0)
    }
    if (props.borderLeft !== false) {
      layoutNode.setBorder(c.EDGE_LEFT, borderWidth)
    } else {
      layoutNode.setBorder(c.EDGE_LEFT, 0)
    }
    if (props.borderRight !== false) {
      layoutNode.setBorder(c.EDGE_RIGHT, borderWidth)
    } else {
      layoutNode.setBorder(c.EDGE_RIGHT, 0)
    }
  } else {
    // Reset all border widths when borderStyle is removed
    layoutNode.setBorder(c.EDGE_TOP, 0)
    layoutNode.setBorder(c.EDGE_BOTTOM, 0)
    layoutNode.setBorder(c.EDGE_LEFT, 0)
    layoutNode.setBorder(c.EDGE_RIGHT, 0)
  }
}

/**
 * Apply padding or margin to a layout node.
 */
function applySpacing(layoutNode: LayoutNode, type: "padding" | "margin", props: BoxProps): void {
  const c = getConstants()
  // `"auto"` is margin-only, and must reach the engine's dedicated auto path —
  // passing the string through setMargin produces NaN and collapses the row.
  // Padding keeps the numeric setter, because CSS has no auto padding.
  const set: (edge: number, value: number | "auto") => void =
    type === "padding"
      ? (edge, value): void => {
          // CSS has no auto padding and BoxProps types padding as `number`, so
          // this is unreachable by construction. Throw rather than coerce: a
          // silent 0 would turn a caller's type error into a layout mystery.
          if (value === "auto") {
            throw new Error('padding does not accept "auto" (CSS has no auto padding)')
          }
          layoutNode.setPadding(edge, value)
        }
      : (edge, value): void => {
          if (value === "auto") layoutNode.setMarginAuto(edge)
          else layoutNode.setMargin(edge, value)
        }

  type Spacing = number | "auto" | undefined
  const all = props[type] as Spacing
  const x = props[`${type}X` as keyof BoxProps] as Spacing
  const yy = props[`${type}Y` as keyof BoxProps] as Spacing
  const top = props[`${type}Top` as keyof BoxProps] as Spacing
  const bottom = props[`${type}Bottom` as keyof BoxProps] as Spacing
  const left = props[`${type}Left` as keyof BoxProps] as Spacing
  const right = props[`${type}Right` as keyof BoxProps] as Spacing

  // Compute effective value per edge, resolving CSS-like specificity cascade:
  // individual > axis (X/Y) > all > 0
  // This handles the case where props are REMOVED (e.g., paddingLeft: 1 → undefined):
  // the edge is reset to 0 instead of retaining the stale Yoga value.
  set(c.EDGE_TOP, top ?? yy ?? all ?? 0)
  set(c.EDGE_BOTTOM, bottom ?? yy ?? all ?? 0)
  set(c.EDGE_LEFT, left ?? x ?? all ?? 0)
  set(c.EDGE_RIGHT, right ?? x ?? all ?? 0)
}

/**
 * Convert align value to layout constant.
 */
function alignToConstant(align: string): number {
  const c = getConstants()
  const map: Record<string, number> = {
    "flex-start": c.ALIGN_FLEX_START,
    "flex-end": c.ALIGN_FLEX_END,
    center: c.ALIGN_CENTER,
    stretch: c.ALIGN_STRETCH,
    baseline: c.ALIGN_BASELINE,
    "space-between": c.ALIGN_SPACE_BETWEEN,
    "space-around": c.ALIGN_SPACE_AROUND,
    "space-evenly": c.ALIGN_SPACE_EVENLY,
  }
  return map[align] ?? c.ALIGN_STRETCH
}

/**
 * Convert justify value to layout constant.
 */
function justifyToConstant(justify: string): number {
  const c = getConstants()
  const map: Record<string, number> = {
    "flex-start": c.JUSTIFY_FLEX_START,
    "flex-end": c.JUSTIFY_FLEX_END,
    center: c.JUSTIFY_CENTER,
    "space-between": c.JUSTIFY_SPACE_BETWEEN,
    "space-around": c.JUSTIFY_SPACE_AROUND,
    "space-evenly": c.JUSTIFY_SPACE_EVENLY,
  }
  return map[justify] ?? c.JUSTIFY_FLEX_START
}

// ============================================================================
// Layout Calculation
// ============================================================================

/**
 * Calculate layout for the entire tree starting from root.
 */
export function calculateLayout(root: AgNode, width: number, height: number): void {
  const c = getConstants()
  if (!root.layoutNode) {
    throw new Error("Root node must have a layout node")
  }
  root.layoutNode.calculateLayout(width, height, c.DIRECTION_LTR)
  propagateLayout(root, 0, 0)
  notifyLayoutSubscribers(root)
}

/**
 * Propagate computed layout from layout nodes to SilveryNodes.
 */
function propagateLayout(node: AgNode, parentX: number, parentY: number): void {
  // Save previous layout for change detection
  node.prevLayout = node.boxRect

  // Get computed layout from layout node
  if (!node.layoutNode) {
    // Virtual nodes (raw text, nested text) inherit parent layout
    return
  }
  const left = node.layoutNode.getComputedLeft()
  const top = node.layoutNode.getComputedTop()
  const width = node.layoutNode.getComputedWidth()
  const height = node.layoutNode.getComputedHeight()

  node.boxRect = {
    x: parentX + left,
    y: parentY + top,
    width,
    height,
  }

  // If dimensions changed, content needs re-render
  if (!rectEqual(node.prevLayout, node.boxRect)) {
    markDirty(node, CONTENT_BIT)
  }

  // Recursively propagate to children
  for (const child of node.children) {
    propagateLayout(child, node.boxRect.x, node.boxRect.y)
  }
}

/**
 * Sync layout signals for nodes whose rects changed.
 */
function notifyLayoutSubscribers(node: AgNode): void {
  // Sync rect values into alien-signals (for signal-based hooks)
  syncRectSignals(node)

  for (const child of node.children) {
    notifyLayoutSubscribers(child)
  }
}
