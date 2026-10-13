/**
 * A bare `silvery-box` AgNode for tests that read a tree's props and rects
 * without laying it out: no layout node, no parent links, zeroed dirty state.
 * The backdrop plan tests build their marker trees from it.
 *
 * `rect` lands on `boxRect`; pass `overrides` for any other field a test needs
 * (a different `type`, `scrollRect`/`screenRect`, `hidden`, …). Children are not
 * linked or epoch-adopted — a test that needs a real tree assembles that itself.
 *
 * @fakes @silvery/ag
 */
import { createEpochOwner } from "../../src/epoch"
import type { AgNode, Rect } from "../../src/types"

export function fakeNode(
  props: Record<string, unknown> = {},
  rect: Rect | null = null,
  children: AgNode[] = [],
  overrides: Partial<AgNode> = {},
): AgNode {
  return {
    type: "silvery-box",
    props,
    children,
    parent: null,
    epochOwner: createEpochOwner(),
    layoutNode: null,
    prevLayout: null,
    boxRect: rect,
    scrollRect: null,
    prevScrollRect: null,
    screenRect: null,
    prevScreenRect: null,
    layoutChangedThisFrame: 0,
    dirtyBits: 0,
    dirtyEpoch: 0,
    ...overrides,
  }
}
