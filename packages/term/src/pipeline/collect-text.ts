/**
 * Shared text content collection primitives.
 *
 * Multiple pipeline phases need to collect plain text from node trees:
 * - Measure phase: to compute intrinsic size for fit-content nodes
 * - Render phase: to compute DOM-level truncation budget before ANSI serialization
 * - Reconciler: to feed text to the Yoga measure function
 *
 * All share the same traversal logic: walk children, apply internal_transform,
 * concatenate text. The only difference is whether hidden nodes are skipped
 * (the reconciler skips them because Suspense hides the primary tree;
 * the render phases don't because hidden nodes are already laid out with 0 size).
 *
 * The ANSI-styled variants (collectTextContent in render-text.ts) and the
 * styled-segment variants (collectStyledSegments in content-phase-adapter.ts)
 * have fundamentally different output shapes and child processing logic,
 * so they remain separate.
 */

import type { TeaNode } from "@silvery/tea/types"

/**
 * Collect plain text from a node tree, applying internal_transform.
 *
 * This is the base traversal used by:
 * - measure-phase.ts (fit-content measurement)
 * - render-text.ts (DOM-level truncation budget)
 *
 * Does NOT filter hidden or display:none nodes — those are handled by
 * the layout engine (display:none gets 0x0 size) or by other phases.
 */
export function collectPlainText(node: TeaNode): string {
  if (node.textContent !== undefined) return node.textContent
  let result = ""
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]!
    let childText = collectPlainText(child)
    if (childText.length > 0 && (child.props as any).internal_transform) {
      childText = (child.props as any).internal_transform(childText, i)
    }
    result += childText
  }
  return result
}

/**
 * Collect plain text from a node tree, skipping hidden children.
 *
 * Used by the reconciler's Yoga measure function where hidden nodes
 * (from Suspense) must not contribute to measured size.
 *
 * Identical to collectPlainText except for the hidden check.
 */
export function collectPlainTextSkipHidden(node: TeaNode): string {
  if (node.textContent !== undefined) return node.textContent
  let result = ""
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]!
    if (child.hidden) continue
    let childText = collectPlainTextSkipHidden(child)
    if (childText.length > 0 && (child.props as any).internal_transform) {
      childText = (child.props as any).internal_transform(childText, i)
    }
    result += childText
  }
  return result
}
