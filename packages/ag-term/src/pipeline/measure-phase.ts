/**
 * Phase 1: Measure Phase
 *
 * Handle fit-content nodes by measuring their intrinsic content size.
 */

import type { BoxProps, AgNode, TextProps } from "@silvery/ag/types"
import { createLogger } from "loggily"
import { displayWidthAnsi, graphemeWidth, wrapText, getActiveLineHeight } from "../unicode"
import { collectPlainText as collectTextContent } from "./collect-text"
import {
  getCachedPlainText,
  setCachedPlainText,
  getCachedAnalysis,
  setCachedAnalysis,
} from "./prepared-text"
import { buildTextAnalysis, shrinkwrapWidth } from "./pretext"
import { getBorderSize, getPadding, getPaddingEntries, type PaddingEdge } from "./helpers"
import type { PipelineContext } from "./types"
import { INSTRUMENT, logPass, recordPassRing } from "../runtime/pass-cause"
import { isStrictEnabled } from "../strict-mode"

const log = createLogger("silvery:measure")

/** SILVERY_STRICT slug for the bounded measure re-settle (#30346). */
export const MEASURE_SETTLE_STRICT_SLUG = "measure-settle"
export const MEASURE_SETTLE_STRICT_MIN_TIER = 1

/** Two engine resolutions closer than this are the same value. */
const SPACING_EPSILON = 1e-9

/**
 * One spacing input an intrinsic measurement consumed, with the value it used.
 *
 * Measurement runs BEFORE layout, and a percentage padding resolves through
 * getPadding() only once the engine holds a containing-block width from a
 * previous layout. Recording the consumed value is how the orchestra tells
 * whether the layout that just ran moved the basis underneath the measurement
 * (#30346) — no string is parsed here, and no second evaluator exists.
 */
interface MeasureSpacingBase {
  node: AgNode
  /** The React prop the value came from: paddingX, paddingTop, gap, ... */
  prop: string
  /** The value this measurement consumed. */
  value: number
}

export type MeasureSpacingInput =
  | (MeasureSpacingBase & { kind: "padding"; edge: PaddingEdge })
  /** Raw gap length, re-resolved through the engine after layout. */
  | (MeasureSpacingBase & { kind: "gap"; source: string })

export type MeasureInputRecorder = (input: MeasureSpacingInput) => void

export type MeasureSpacingMismatch = MeasureSpacingInput & {
  /** What the engine resolves this input to now, after layout. */
  resolved: number
}

/**
 * Handle fit-content nodes by measuring their intrinsic content size.
 *
 * Traverses the tree and for any node with width="fit-content" or
 * height="fit-content", measures the content and sets the Yoga constraint.
 */
export function measurePhase(
  root: AgNode,
  ctx?: PipelineContext,
  record?: MeasureInputRecorder,
): void {
  traverseTree(root, (node) => {
    // Skip nodes without Yoga (raw text nodes)
    if (!node.layoutNode) return

    const props = node.props as BoxProps

    // width="fit-content" is now handled natively by Flexily (UNIT_FIT_CONTENT).
    // The reconciler calls setWidthFitContent() directly.
    // width="snug-content" uses Flexily's UNIT_SNUG_CONTENT for basic sizing,
    // but still needs the binary-search tightening pass here.
    // height="fit-content" still needs the pre-layout polyfill.
    const isSnugContent = props.width === "snug-content"
    const isHeightFitContent = props.height === "fit-content"

    if (isSnugContent || isHeightFitContent) {
      // Pass an available-width constraint to child measurement whenever a
      // definite upper bound exists — either a fixed width (height="fit-content"
      // + width:number case) or a maxWidth cap on the snug-content box itself.
      let availableWidth: number | undefined
      const widthIsFixed = typeof props.width === "number"
      let definiteUpperWidth: number | undefined =
        widthIsFixed && isHeightFitContent
          ? (props.width as number)
          : typeof props.maxWidth === "number"
            ? (props.maxWidth as number)
            : undefined
      if (definiteUpperWidth === undefined) {
        definiteUpperWidth = findAncestorDefiniteWidth(node, record)
      }
      if (definiteUpperWidth !== undefined) {
        const padding = measurePadding(node, record)
        availableWidth = definiteUpperWidth - padding.left - padding.right
        if (props.borderStyle) {
          const border = getBorderSize(props)
          availableWidth -= border.left + border.right
        }
        if (availableWidth < 1) availableWidth = 1
      }

      if (isSnugContent) {
        const intrinsicSize = measureIntrinsicSize(node, ctx, availableWidth, record)
        // Fit-snug: find the narrowest width that keeps the same line count.
        // Binary search for tightest width on top of Flexily's native fit-content.
        const shrunkWidth = computeSnugContentWidth(node, intrinsicSize.width, ctx, record)
        // setMaxWidth caps the snug-content box at the binary-searched width.
        // Flexily's UNIT_SNUG_CONTENT handles the shrink-wrap + available clamping.
        const prevWidth = node.boxRect?.width
        node.layoutNode.setMaxWidth(shrunkWidth)
        if (prevWidth !== undefined && prevWidth !== shrunkWidth) {
          // Always-on violation ring (cheap; rare fit-content measure feedback).
          recordPassRing("intrinsic-shrinkwrap", "snug-content:width")
        }
        if (INSTRUMENT && prevWidth !== undefined && prevWidth !== shrunkWidth) {
          // Width changed since last frame's layout — this measure-phase pass
          // produced a different intrinsic size. That's a feedback edge: a
          // subsequent layout pass will use the new constraint.
          logPass({
            cause: "intrinsic-shrinkwrap",
            edge: "snug-content:width",
            producerPhase: "measure",
            detail: `${prevWidth}→${shrunkWidth}`,
          })
        }
      }
      if (isHeightFitContent) {
        const intrinsicSize = measureIntrinsicSize(node, ctx, availableWidth, record)
        const prevHeight = node.boxRect?.height
        node.layoutNode.setHeight(intrinsicSize.height)
        if (prevHeight !== undefined && prevHeight !== intrinsicSize.height) {
          // Always-on violation ring (cheap; rare fit-content measure feedback).
          recordPassRing("intrinsic-shrinkwrap", "fit-content:height")
        }
        if (INSTRUMENT && prevHeight !== undefined && prevHeight !== intrinsicSize.height) {
          logPass({
            cause: "intrinsic-shrinkwrap",
            edge: "fit-content:height",
            producerPhase: "measure",
            detail: `${prevHeight}→${intrinsicSize.height}`,
          })
        }
      }
    }
  })
}

/**
 * The measure inputs that the layout which just ran invalidated: each recorded
 * input is re-resolved through the SAME evaluator the measurement used —
 * getPadding() for padding, the layout node's intrinsicSpacing for gap — and
 * compared with the value the measurement consumed.
 *
 * Padding is the input that can move: once the engine holds a containing-block
 * width, getPadding() returns its post-layout percentage resolution, while
 * before a frame's first layout it falls back to the intrinsic one. Gap is
 * recorded and re-resolved through the same engine call, but its intrinsic
 * resolution is basis-free — percentage parts are zero by the CSS
 * cyclic-percentage rule (#30346) — so layout cannot move it and that
 * comparison stays closed.
 */
export function staleMeasureInputs(
  inputs: readonly MeasureSpacingInput[],
): MeasureSpacingMismatch[] {
  if (inputs.length === 0) return []
  let stale: MeasureSpacingMismatch[] | undefined
  let paddingByNode: Map<AgNode, Map<PaddingEdge, number>> | undefined
  for (const input of inputs) {
    let resolved: number
    if (input.kind === "padding") {
      paddingByNode ??= new Map()
      let edges = paddingByNode.get(input.node)
      if (!edges) {
        edges = new Map(getPaddingEntries(input.node).map((entry) => [entry.edge, entry.value]))
        paddingByNode.set(input.node, edges)
      }
      resolved = edges.get(input.edge) ?? Number.NaN
    } else {
      resolved = intrinsicSpacingOf(input.node, input.prop, input.source)
    }
    if (!sameSpacing(input.value, resolved)) (stale ??= []).push({ ...input, resolved })
  }
  return stale ?? []
}

function sameSpacing(a: number, b: number): boolean {
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.isNaN(a) && Number.isNaN(b)
  return Math.abs(a - b) <= SPACING_EPSILON
}

function measureNodeIdent(node: AgNode): string {
  const props = node.props as BoxProps & { testID?: string; id?: string; name?: string }
  const named = props.id ?? props.testID ?? props.name
  return named === undefined ? node.type : `${node.type}#${String(named)}`
}

/**
 * The re-settle bound is exhausted and a measurement input still disagrees with
 * the layout that will be exposed. Never silent (#30346): record the pass ring,
 * then throw a TypeError naming the input under SILVERY_STRICT — and log the
 * same detail without it, keeping the settled-as-far-as-it-got layout.
 */
export function reportUnsettledMeasureInputs(
  mismatches: readonly MeasureSpacingMismatch[],
  passes: number,
): void {
  const [first] = mismatches
  if (!first) return
  const ident = measureNodeIdent(first.node)
  const detail =
    `${first.prop} on ${ident}: measure used ${first.value}, layout resolved ${first.resolved}` +
    (mismatches.length > 1 ? ` (+${mismatches.length - 1} more input(s))` : "")
  const message =
    `measure did not settle after ${passes} measure/layout passes — ${detail}. ` +
    `An intrinsic measurement is still reading a stale containing-block basis.`
  recordPassRing("intrinsic-shrinkwrap", `measure-settle:${first.prop}`, ident)
  if (isStrictEnabled(MEASURE_SETTLE_STRICT_SLUG, MEASURE_SETTLE_STRICT_MIN_TIER)) {
    throw new TypeError(`[SILVERY_STRICT] ${message}`)
  }
  log.error?.(message)
}

/**
 * Resolve one string spacing prop to the cell count intrinsic measurement
 * consumes (today the gap between children). The engine owns the grammar and
 * the CSS cyclic-percentage rule (#30346); this layer never parses the string.
 * The third argument is the container-query size, not a percentage basis —
 * measurement precedes any frozen CQ size, so NaN is passed and cq parts
 * resolve to zero.
 */
function intrinsicSpacingOf(
  node: AgNode,
  prop: string,
  value: string,
  record?: MeasureInputRecorder,
): number {
  const layoutNode = node.layoutNode
  if (!layoutNode) {
    throw new TypeError(
      `${prop}: ${JSON.stringify(value)} — measure ran before the node had a layout node`,
    )
  }
  const resolved = layoutNode.intrinsicSpacing(prop, value, Number.NaN)
  record?.({ node, kind: "gap", prop, value: resolved, source: value })
  return resolved
}

/**
 * Resolve a node's padding for intrinsic measurement, recording every edge the
 * measurement consumed. Without a recorder this is getPadding() exactly.
 */
function measurePadding(
  node: AgNode,
  record?: MeasureInputRecorder,
): { top: number; bottom: number; left: number; right: number } {
  if (!record) return getPadding(node)
  const padding = { top: 0, bottom: 0, left: 0, right: 0 }
  for (const entry of getPaddingEntries(node)) {
    padding[entry.edge] = entry.value
    record({ node, kind: "padding", prop: entry.prop, edge: entry.edge, value: entry.value })
  }
  return padding
}

/**
 * Measure the intrinsic size of a node's content.
 *
 * For text nodes: measures the text width and line count.
 * For box nodes: recursively measures children based on flex direction.
 *
 * @param availableWidth - When set, text nodes wrap at this width for height calculation.
 *   Used when a container has fixed width + fit-content height.
 */
function measureIntrinsicSize(
  node: AgNode,
  ctx?: PipelineContext,
  availableWidth?: number,
  record?: MeasureInputRecorder,
): {
  width: number
  height: number
} {
  const props = node.props as BoxProps

  // display="none" nodes have 0x0 intrinsic size
  if (props.display === "none") {
    return { width: 0, height: 0 }
  }

  if (node.type === "silvery-text") {
    const textProps = props as TextProps
    // PreparedText cache: reuse plain text from previous frames when content unchanged
    const cached = getCachedPlainText(node)
    let text: string
    if (cached) {
      text = cached.text
    } else {
      text = collectTextContent(node)
      const lineCount = (text.match(/\n/g)?.length ?? 0) + 1
      setCachedPlainText(node, text, lineCount)
    }

    // Apply internal_transform if present (used by Transform component).
    // The transform is applied per-line, which can change the width.
    const transform = textProps.internal_transform
    let lines: string[]

    if (availableWidth !== undefined && availableWidth > 0 && isWrapEnabled(textProps.wrap)) {
      // Wrap text at available width to compute correct height. For
      // `wrap-truncate`, thread the truncate-atomic-overflow flag so the
      // intrinsic line count matches what render emits (single ellipsis
      // line) instead of the char-wrap line count.
      const truncateAtomic = textProps.wrap === "wrap-truncate"
      lines = ctx
        ? ctx.measurer.wrapText(text, availableWidth, true, true, truncateAtomic)
        : wrapText(text, availableWidth, true, true, truncateAtomic)
    } else {
      lines = text.split("\n")
    }

    if (transform) {
      lines = lines.map((line, index) => transform(line, index))
    }

    const width = Math.max(...lines.map((line) => getTextWidth(line, ctx)))
    return {
      width,
      height: lines.length * getActiveLineHeight(),
    }
  }

  // For boxes, measure based on flex direction
  const isRow = props.flexDirection === "row" || props.flexDirection === "row-reverse"

  let width = 0
  let height = 0

  let childCount = 0
  for (const child of node.children) {
    const childSize = measureIntrinsicSize(child, ctx, availableWidth, record)
    childCount++

    if (isRow) {
      width += childSize.width
      height = Math.max(height, childSize.height)
    } else {
      width = Math.max(width, childSize.width)
      height += childSize.height
    }
  }

  // Add gap between children. CSS Sizing 3 cyclic-percentage rule (#30346): a
  // percentage part contributes zero to the intrinsic contribution and ch
  // resolves at the adapter's scale. The engine resolves it — this layer never
  // parses the string.
  const gap =
    typeof props.gap === "string"
      ? intrinsicSpacingOf(node, "gap", props.gap, record)
      : (props.gap ?? 0)
  if (gap > 0 && childCount > 1) {
    const totalGap = gap * (childCount - 1)
    if (isRow) {
      width += totalGap
    } else {
      height += totalGap
    }
  }

  // Add padding
  const padding = measurePadding(node, record)
  width += padding.left + padding.right
  height += padding.top + padding.bottom

  // Add border
  if (props.borderStyle) {
    const border = getBorderSize(props)
    width += border.left + border.right
    height += border.top + border.bottom
  }

  return { width, height }
}

/**
 * Check if text wrapping is enabled for a text node.
 */
function isWrapEnabled(wrap: TextProps["wrap"]): boolean {
  return (
    wrap === "wrap" ||
    wrap === "wrap-truncate" ||
    wrap === "hard" ||
    wrap === "even" ||
    wrap === true ||
    wrap === undefined
  )
}

/**
 * Compute snug-content width for a node.
 * Uses Pretext analysis to binary-search for the tightest width
 * that keeps the same line count as the fit-content width.
 */
function computeSnugContentWidth(
  node: AgNode,
  fitContentWidth: number,
  ctx?: PipelineContext,
  record?: MeasureInputRecorder,
): number {
  const props = node.props as BoxProps

  // Subtract padding + border from fitContentWidth to get CONTENT width.
  // measureIntrinsicSize includes padding+border in its result, but
  // shrinkwrapWidth operates on text content width only.
  let overhead = 0
  const padding = measurePadding(node, record)
  overhead += padding.left + padding.right
  if (props.borderStyle) {
    const border = getBorderSize(props)
    overhead += border.left + border.right
  }
  const contentWidth = fitContentWidth - overhead

  // Get or build text analysis
  let analysis = getCachedAnalysis(node)
  if (!analysis) {
    const cached = getCachedPlainText(node)
    const text = cached ? cached.text : collectTextContent(node)
    const gWidthFn = ctx?.measurer?.graphemeWidth?.bind(ctx.measurer) ?? graphemeWidth
    analysis = buildTextAnalysis(text, gWidthFn)
    setCachedAnalysis(node, analysis)
    if (!cached) {
      const lineCount = (text.match(/\n/g)?.length ?? 0) + 1
      setCachedPlainText(node, text, lineCount)
    }
  }

  // Shrinkwrap the content, then add overhead back.
  return shrinkwrapWidth(analysis, contentWidth) + overhead
}

/**
 * Walk up the tree from a node to find the nearest ancestor with a definite
 * width (a fixed number, not "fit-content" or "snug-content"). Returns the
 * ancestor's inner content width (after subtracting its own padding and border).
 * Returns undefined if no definite-width ancestor is found.
 */
function findAncestorDefiniteWidth(
  node: AgNode,
  record?: MeasureInputRecorder,
): number | undefined {
  let current = node.parent
  while (current) {
    const p = current.props as BoxProps
    if (typeof p.width === "number") {
      let inner = p.width as number
      const padding = measurePadding(current, record)
      inner -= padding.left + padding.right
      if (p.borderStyle) {
        const border = getBorderSize(p)
        inner -= border.left + border.right
      }
      return inner > 0 ? inner : 1
    }
    if (typeof p.maxWidth === "number") {
      let inner = p.maxWidth as number
      const padding = measurePadding(current, record)
      inner -= padding.left + padding.right
      if (p.borderStyle) {
        const border = getBorderSize(p)
        inner -= border.left + border.right
      }
      return inner > 0 ? inner : 1
    }
    current = current.parent
  }
  return undefined
}

/**
 * Traverse tree in depth-first order.
 */
function traverseTree(node: AgNode, callback: (node: AgNode) => void): void {
  callback(node)
  for (const child of node.children) {
    traverseTree(child, callback)
  }
}

/**
 * Get text display width (accounting for wide characters and ANSI codes).
 * Uses ANSI-aware width calculation to handle styled text.
 */
function getTextWidth(text: string, ctx?: PipelineContext): number {
  if (ctx) return ctx.measurer.displayWidthAnsi(text)
  return displayWidthAnsi(text)
}

// collectTextContent is imported from ./collect-text as collectPlainText.
// Previously duplicated here; now shared across measure-phase, render-text,
// and the reconciler's measure function.
