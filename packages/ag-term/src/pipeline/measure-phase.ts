/**
 * Phase 1: Measure Phase
 *
 * Handle fit-content nodes by measuring their intrinsic content size.
 */

import type { BoxProps, AgNode, TextProps } from "@silvery/ag/types"
import { displayWidthAnsi, wrapText, getActiveLineHeight } from "../unicode"
import { collectPlainText as collectTextContent } from "./collect-text"
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

    if (props.width === "fit-content" || props.height === "fit-content") {
      // When height="fit-content" but width is fixed, pass the available width
      // so text nodes can wrap and compute correct intrinsic height.
      let availableWidth: number | undefined
      if (props.height === "fit-content" && props.width !== "fit-content" && typeof props.width === "number") {
        // Subtract padding and border from the fixed width to get content area width
        const padding = getPadding(props)
        availableWidth = props.width - padding.left - padding.right
        if (props.borderStyle) {
          const border = getBorderSize(props)
          availableWidth -= border.left + border.right
        }
        if (availableWidth < 1) availableWidth = 1
      }

      const intrinsicSize = measureIntrinsicSize(node, ctx, availableWidth)

      if (props.width === "fit-content") {
        node.layoutNode.setWidth(intrinsicSize.width)
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
    const text = collectTextContent(node)

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
  return wrap === "wrap" || wrap === true || wrap === undefined
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
