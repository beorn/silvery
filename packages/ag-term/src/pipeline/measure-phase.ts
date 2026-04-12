/**
 * Phase 1: Measure Phase
 *
 * Handle fit-content nodes by measuring their intrinsic content size.
 */

import type { BoxProps, AgNode, TextProps } from "@silvery/ag/types"
import { displayWidthAnsi, graphemeWidth, wrapText, getActiveLineHeight } from "../unicode"
import { collectPlainText as collectTextContent } from "./collect-text"
import { getCachedPlainText, setCachedPlainText, getCachedAnalysis, setCachedAnalysis } from "./prepared-text"
import { buildTextAnalysis, shrinkwrapWidth } from "./pretext"
import { getBorderSize, getPadding } from "./helpers"
import type { PipelineContext } from "./types"

/**
 * Handle fit-content nodes by measuring their intrinsic content size.
 *
 * Traverses the tree and for any node with width="fit-content" or
 * height="fit-content", measures the content and sets the Yoga constraint.
 */
export function measurePhase(root: AgNode, ctx?: PipelineContext): void {
  traverseTree(root, (node) => {
    // Skip nodes without Yoga (raw text nodes)
    if (!node.layoutNode) return

    const props = node.props as BoxProps

    const isFitContent = props.width === "fit-content" || props.height === "fit-content"
    const isSnugContent = props.width === "snug-content"

    if (isFitContent || isSnugContent) {
      // Pass an available-width constraint to child measurement whenever a
      // definite upper bound exists — either a fixed width (height="fit-content"
      // + width:number case) or a maxWidth cap on the fit-content/snug-content
      // box itself. Without this, text nodes measure their full intrinsic
      // unwrapped width, which:
      //   - inflates fit-content boxes beyond maxWidth (measure phase then
      //     uses intrinsic instead of maxWidth as the content bound)
      //   - defeats snug-content's binary search (it starts from an unclamped
      //     upper bound where everything fits on one line, so shrunk ≈ intrinsic)
      let availableWidth: number | undefined
      const widthIsFixed = typeof props.width === "number"
      // Find a definite upper bound for child measurement:
      //   1. Fixed width on this node (height="fit-content" case)
      //   2. Explicit maxWidth on this node
      //   3. Nearest ancestor with a definite width (walk up the tree)
      let definiteUpperWidth: number | undefined =
        widthIsFixed && props.height === "fit-content"
          ? (props.width as number)
          : typeof props.maxWidth === "number"
            ? (props.maxWidth as number)
            : undefined
      if (definiteUpperWidth === undefined) {
        definiteUpperWidth = findAncestorDefiniteWidth(node)
      }
      if (definiteUpperWidth !== undefined) {
        const padding = getPadding(props)
        availableWidth = definiteUpperWidth - padding.left - padding.right
        if (props.borderStyle) {
          const border = getBorderSize(props)
          availableWidth -= border.left + border.right
        }
        if (availableWidth < 1) availableWidth = 1
      }

      const intrinsicSize = measureIntrinsicSize(node, ctx, availableWidth)

      if (isSnugContent) {
        // Fit-snug: find the narrowest width that keeps the same line count.
        // First get the text for analysis, then binary search for tightest width.
        const shrunkWidth = computeSnugContentWidth(node, intrinsicSize.width, ctx)
        // Use setMaxWidth (not setWidth) so the box can shrink below its
        // intrinsic via flex cross-axis stretch or parent constraints.
        // CSS fit-content = min(max-content, available) — setMaxWidth provides
        // the max-content ceiling while leaving width=auto for flex resolution.
        node.layoutNode.setMaxWidth(shrunkWidth)
      } else if (props.width === "fit-content") {
        // CSS fit-content = min(max-content, max(min-content, available)).
        // setMaxWidth caps at intrinsic (max-content), leaving width=auto
        // so flex stretch/shrink can clamp it to the parent's available width.
        node.layoutNode.setMaxWidth(intrinsicSize.width)
      }
      if (props.height === "fit-content") {
        node.layoutNode.setHeight(intrinsicSize.height)
      }
    }
  })
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
      // Wrap text at available width to compute correct height
      lines = ctx ? ctx.measurer.wrapText(text, availableWidth, true, true) : wrapText(text, availableWidth, true, true)
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
    const childSize = measureIntrinsicSize(child, ctx, availableWidth)
    childCount++

    if (isRow) {
      width += childSize.width
      height = Math.max(height, childSize.height)
    } else {
      width = Math.max(width, childSize.width)
      height += childSize.height
    }
  }

  // Add gap between children
  const gap = (props.gap as number) ?? 0
  if (gap > 0 && childCount > 1) {
    const totalGap = gap * (childCount - 1)
    if (isRow) {
      width += totalGap
    } else {
      height += totalGap
    }
  }

  // Add padding
  const padding = getPadding(props)
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
  return wrap === "wrap" || wrap === "hard" || wrap === "even" || wrap === true || wrap === undefined
}

/**
 * Compute snug-content width for a node.
 * Uses Pretext analysis to binary-search for the tightest width
 * that keeps the same line count as the fit-content width.
 */
function computeSnugContentWidth(node: AgNode, fitContentWidth: number, ctx?: PipelineContext): number {
  const props = node.props as BoxProps

  // Subtract padding + border from fitContentWidth to get CONTENT width.
  // measureIntrinsicSize includes padding+border in its result, but
  // shrinkwrapWidth operates on text content width only.
  let overhead = 0
  const padding = getPadding(props)
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

  // Shrinkwrap the content, then add overhead back
  return shrinkwrapWidth(analysis, contentWidth) + overhead
}

/**
 * Post-layout correction for fit-content/snug-content nodes that overflow
 * their parent's computed width. After layout resolves flex sizing, some
 * fit-content boxes may exceed the parent's actual content area (because
 * the parent's width was only determined by flex — no definite width existed
 * at measure time). This pass detects overflow, clamps maxWidth to the
 * parent's computed inner width, and returns true if any correction was made
 * (caller should re-run layout).
 */
export function fitContentCorrectionPass(root: AgNode, ctx?: PipelineContext): boolean {
  let corrected = false
  traverseTree(root, (node) => {
    if (!node.layoutNode || !node.parent?.boxRect || !node.boxRect) return
    const props = node.props as BoxProps
    if (props.width !== "fit-content" && props.width !== "snug-content") return

    const parentProps = node.parent.props as BoxProps
    let parentInner = node.parent.boxRect.width
    const parentPadding = getPadding(parentProps)
    parentInner -= parentPadding.left + parentPadding.right
    if (parentProps.borderStyle) {
      const parentBorder = getBorderSize(parentProps)
      parentInner -= parentBorder.left + parentBorder.right
    }
    if (parentInner < 1) parentInner = 1

    if (node.boxRect.width > parentInner) {
      // Node overflows parent — clamp and re-measure
      const padding = getPadding(props)
      let contentWidth = parentInner - padding.left - padding.right
      if (props.borderStyle) {
        const border = getBorderSize(props)
        contentWidth -= border.left + border.right
      }
      if (contentWidth < 1) contentWidth = 1

      const intrinsicSize = measureIntrinsicSize(node, ctx, contentWidth)
      if (props.width === "snug-content") {
        const shrunkWidth = computeSnugContentWidth(node, intrinsicSize.width, ctx)
        node.layoutNode.setMaxWidth(shrunkWidth)
      } else {
        node.layoutNode.setMaxWidth(intrinsicSize.width)
      }
      node.layoutNode.markDirty()
      corrected = true
    }
  })
  return corrected
}

/**
 * Walk up the tree from a node to find the nearest ancestor with a definite
 * width (a fixed number, not "fit-content" or "snug-content"). Returns the
 * ancestor's inner content width (after subtracting its own padding and border).
 * Returns undefined if no definite-width ancestor is found.
 */
function findAncestorDefiniteWidth(node: AgNode): number | undefined {
  let current = node.parent
  while (current) {
    const p = current.props as BoxProps
    if (typeof p.width === "number") {
      let inner = p.width as number
      const padding = getPadding(p)
      inner -= padding.left + padding.right
      if (p.borderStyle) {
        const border = getBorderSize(p)
        inner -= border.left + border.right
      }
      return inner > 0 ? inner : 1
    }
    if (typeof p.maxWidth === "number") {
      let inner = p.maxWidth as number
      const padding = getPadding(p)
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
