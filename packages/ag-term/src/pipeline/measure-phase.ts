/**
 * Phase 1: Measure Phase
 *
 * Handle fit-content nodes by measuring their intrinsic content size.
 */

import type { BoxProps, AgNode, TextProps } from "@silvery/ag/types"
import { displayWidthAnsi, graphemeWidth, wrapText, getActiveLineHeight } from "../unicode"
import { collectPlainText as collectTextContent } from "./collect-text"
import {
  getCachedPlainText,
  setCachedPlainText,
  getCachedAnalysis,
  setCachedAnalysis,
} from "./prepared-text"
import { buildTextAnalysis, shrinkwrapWidth } from "./pretext"
import { getBorderSize, getPadding } from "./helpers"
import type { PipelineContext } from "./types"
import { INSTRUMENT, recordPassCause } from "../runtime/pass-cause"

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

      if (isSnugContent) {
        const intrinsicSize = measureIntrinsicSize(node, ctx, availableWidth)
        // Fit-snug: find the narrowest width that keeps the same line count.
        // Binary search for tightest width on top of Flexily's native fit-content.
        const shrunkWidth = computeSnugContentWidth(node, intrinsicSize.width, ctx)
        // setMaxWidth caps the snug-content box at the binary-searched width.
        // Flexily's UNIT_SNUG_CONTENT handles the shrink-wrap + available clamping.
        const prevWidth = node.boxRect?.width
        node.layoutNode.setMaxWidth(shrunkWidth)
        if (INSTRUMENT && prevWidth !== undefined && prevWidth !== shrunkWidth) {
          // Width changed since last frame's layout — this measure-phase pass
          // produced a different intrinsic size. That's a feedback edge: a
          // subsequent layout pass will use the new constraint.
          recordPassCause({
            cause: "intrinsic-shrinkwrap",
            edge: "snug-content:width",
            producerPhase: "measure",
            detail: `${prevWidth}→${shrunkWidth}`,
          })
        }
      }
      if (isHeightFitContent) {
        const intrinsicSize = measureIntrinsicSize(node, ctx, availableWidth)
        const prevHeight = node.boxRect?.height
        node.layoutNode.setHeight(intrinsicSize.height)
        if (INSTRUMENT && prevHeight !== undefined && prevHeight !== intrinsicSize.height) {
          recordPassCause({
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
      lines = ctx
        ? ctx.measurer.wrapText(text, availableWidth, true, true)
        : wrapText(text, availableWidth, true, true)
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
  return (
    wrap === "wrap" || wrap === "hard" || wrap === "even" || wrap === true || wrap === undefined
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
): number {
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
