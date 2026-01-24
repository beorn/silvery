/**
 * Phase 1: Measure Phase
 *
 * Handle fit-content nodes by measuring their intrinsic content size.
 */

import type { BoxProps, InkxNode } from "../types.js";
import { displayWidthAnsi } from "../unicode.js";
import { getBorderSize, getPadding } from "./helpers.js";

/**
 * Handle fit-content nodes by measuring their intrinsic content size.
 *
 * Traverses the tree and for any node with width="fit-content" or
 * height="fit-content", measures the content and sets the Yoga constraint.
 */
export function measurePhase(root: InkxNode): void {
  traverseTree(root, (node) => {
    // Skip nodes without Yoga (raw text nodes)
    if (!node.layoutNode) return;

    const props = node.props as BoxProps;

    if (props.width === "fit-content" || props.height === "fit-content") {
      const intrinsicSize = measureIntrinsicSize(node);

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
function measureIntrinsicSize(node: InkxNode): {
  width: number;
  height: number;
} {
  const props = node.props as BoxProps;

  // display="none" nodes have 0x0 intrinsic size
  if (props.display === "none") {
    return { width: 0, height: 0 };
  }

  if (node.type === "inkx-text") {
    const text = node.textContent ?? "";
    const lines = text.split("\n");
    const width = Math.max(...lines.map((line) => getTextWidth(line)));
    return {
      width,
      height: lines.length,
    };
  }

  // For boxes, measure based on flex direction
  const isRow =
    props.flexDirection === "row" || props.flexDirection === "row-reverse";

  let width = 0;
  let height = 0;

  for (const child of node.children) {
    const childSize = measureIntrinsicSize(child);

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
function traverseTree(
  node: InkxNode,
  callback: (node: InkxNode) => void,
): void {
  callback(node);
  for (const child of node.children) {
    traverseTree(child, callback);
  }
}

/**
 * Get text display width (accounting for wide characters and ANSI codes).
 * Uses ANSI-aware width calculation to handle styled text.
 */
function getTextWidth(text: string): number {
  return displayWidthAnsi(text);
}
