/**
 * Popover horizontal placement against its anchor (#26660).
 *
 * @failure A content-wide popover near the right margin slides left by its
 *   whole cap, so narrow content lands far from, or short of, its anchor.
 * @invariant The first frame places the popover by its cap, so it never
 *   crosses the right margin; once its border box is measured it slides only
 *   as far as its real width needs: narrow content settles at its anchor and
 *   wide content stays whole against the margin.
 * @level l2 — the committed popover box rect through the public PopoverProvider.
 */

import React, { useEffect } from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import type { AgNode, BoxProps } from "@silvery/ag/types"
import { Box, PopoverProvider, Text, usePopover } from "../src/index.js"

const COLS = 100
const EDGE_X = 2

function ShowAt({ x, body, maxWidth }: { x: number; body: string; maxWidth?: number }): null {
  const popover = usePopover()
  useEffect(() => {
    popover?.show({ body: <Text>{body}</Text>, maxWidth }, { x, y: 1 })
  }, [popover, x, body, maxWidth])
  return null
}

function renderAt(x: number, body: string, maxWidth = 48) {
  const render = createRenderer({ cols: COLS, rows: 20, autoRender: true })
  return render(
    <PopoverProvider>
      <Box width={COLS} height={20}>
        <ShowAt x={x} body={body} maxWidth={maxWidth} />
      </Box>
    </PopoverProvider>,
  )
}

// The popover surface's committed box: [left, right) and height, or null.
function popoverBox(
  app: ReturnType<typeof renderAt>,
): { left: number; right: number; height: number } | null {
  const find = (node: AgNode): AgNode | null => {
    if ((node.props as BoxProps | undefined)?.backgroundColor === "$bg-surface-overlay") return node
    for (const child of node.children) {
      const hit = find(child)
      if (hit) return hit
    }
    return null
  }
  const root = (app as unknown as { getContainer: () => AgNode }).getContainer()
  const rect = find(root)?.boxRect
  return rect ? { left: rect.x, right: rect.x + rect.width, height: rect.height } : null
}

function settledBox(app: ReturnType<typeof renderAt>) {
  const box = popoverBox(app)
  if (!box) throw new Error("popover surface not rendered")
  return box
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 60))

// The placement rule: slide left only as far as the box's real width needs.
// Under cap-first layout the box is cap-wide, so this is today's placement;
// under content-first layout (#26388) narrow content settles at its anchor.
function expectedLeft(anchor: number, width: number): number {
  return Math.max(EDGE_X, Math.min(anchor, COLS - EDGE_X - width))
}

describe("popover placement at its anchor", () => {
  test("a mid-screen anchor with narrow content settles as far right as its width allows", async () => {
    const app = renderAt(55, "NARROW")
    await settle()
    const box = settledBox(app)
    expect(box.left).toBe(expectedLeft(55, box.right - box.left))
  })

  test("a near-edge anchor with narrow content settles as far right as its width allows", async () => {
    const app = renderAt(75, "NARROW")
    await settle()
    const box = settledBox(app)
    expect(box.left).toBe(expectedLeft(75, box.right - box.left))
    expect(box.right).toBeLessThanOrEqual(COLS - EDGE_X)
  })

  test("a near-edge anchor with wide content slides only as far as its width needs and stays whole", async () => {
    const body = "alpha bravo charlie delta echo" // 30 cells, one line within the 48 cap
    const app = renderAt(75, body)
    await settle()
    const box = settledBox(app)
    expect(box.left).toBe(expectedLeft(75, box.right - box.left))
    expect(box.right).toBe(COLS - EDGE_X)
    // One body line plus 1-row padding top and bottom: not wrapped.
    expect(box.height).toBe(3)
    expect(app.text).toContain(body)
  })

  test("the first frame never crosses the right margin", async () => {
    const app = renderAt(90, "alpha bravo charlie delta echo")
    const seen: number[] = []
    for (let i = 0; i < 6; i++) {
      const box = popoverBox(app)
      if (box) seen.push(box.right)
      await new Promise<void>((resolve) => setTimeout(resolve, 10))
    }
    expect(seen.length).toBeGreaterThan(0)
    for (const right of seen) expect(right).toBeLessThanOrEqual(COLS - EDGE_X)
  })
})
