/**
 * Phase 1: Measure Phase
 *
 * Handle fit-content nodes by measuring their intrinsic content size.
 */

import type { BoxProps, TeaNode } from "@silvery/tea/types";
import { displayWidthAnsi } from "../unicode";
import { getBorderSize, getPadding } from "./helpers";
import type { PipelineContext } from "./types";

/**
 * Handle fit-content nodes by measuring their intrinsic content size.
 *
 * Traverses the tree and for any node with width="fit-content" or
 * height="fit-content", measures the content and sets the Yoga constraint.
 */
export function measurePhase(root: TeaNode, ctx?: PipelineContext): void {
  traverseTree(root, (node) => {
    // Skip nodes without Yoga (raw text nodes)
    if (!node.layoutNode) return;

    const props = node.props as BoxProps;

    if (props.width === "fit-content" || props.height === "fit-content") {
      const intrinsicSize = measureIntrinsicSize(node, ctx);

      if (props.width === "fit-content") {
        node.layoutNode.setWidth(intrinsicSize.width);
      }
      if (props.height === "fit-content") {
        node.layoutNode.setHeight(intrinsicSize.height);
      }
    }
  });
}

/**
 * Measure the intrinsic size of a node's content.
 *
 * For text nodes: measures the text width and line count.
 * For box nodes: recursively measures children based on flex direction.
 */
function measureIntrinsicSize(
  node: TeaNode,
  ctx?: PipelineContext,
): {
  width: number;
  height: number;
} {
  const props = node.props as BoxProps;

  // display="none" nodes have 0x0 intrinsic size
  if (props.display === "none") {
    return { width: 0, height: 0 };
  }

  if (node.type === "silvery-text") {
    const text = collectTextContent(node);
    const lines = text.split("\n");
    const width = Math.max(...lines.map((line) => getTextWidth(line, ctx)));
    return {
      width,
      height: lines.length,
    };
  }

  // For boxes, measure based on flex direction
  const isRow = props.flexDirection === "row" || props.flexDirection === "row-reverse";

  let width = 0;
  let height = 0;

  for (const child of node.children) {
    const childSize = measureIntrinsicSize(child, ctx);

    if (isRow) {
      width += childSize.width;
      height = Math.max(height, childSize.height);
    } else {
      width = Math.max(width, childSize.width);
      height += childSize.height;
    }
  }

  // Add padding
  const padding = getPadding(props);
  width += padding.left + padding.right;
  height += padding.top + padding.bottom;

  // Add border
  if (props.borderStyle) {
    const border = getBorderSize(props);
    width += border.left + border.right;
    height += border.top + border.bottom;
  }

  return { width, height };
}

/**
 * Traverse tree in depth-first order.
 */
function traverseTree(node: TeaNode, callback: (node: TeaNode) => void): void {
  callback(node);
  for (const child of node.children) {
    traverseTree(child, callback);
  }
}

/**
 * Get text display width (accounting for wide characters and ANSI codes).
 * Uses ANSI-aware width calculation to handle styled text.
 */
function getTextWidth(text: string, ctx?: PipelineContext): number {
  if (ctx) return ctx.measurer.displayWidthAnsi(text);
  return displayWidthAnsi(text);
}

/**
 * Collect text content from a node and its children.
 * Used for measuring Text nodes that have nested Text children.
 */
function collectTextContent(node: TeaNode): string {
  if (node.textContent !== undefined) {
    return node.textContent;
  }
  let result = "";
  for (const child of node.children) {
    result += collectTextContent(child);
  }
  return result;
}
