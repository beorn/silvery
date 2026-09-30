/**
 * Popover horizontal placement against its anchor (#26660).
 *
 * @failure A content-wide popover near the right margin slides left by its
 *   whole cap, so narrow content lands far from, or short of, its anchor.
 * @invariant The popover stays at its anchor with its cap limited to the room
 *   before the right margin; only when that room is below 20 columns is it
 *   placed flush against the right margin. It never crosses the margin.
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

// The popover surface's committed box: [left, right) and height.
function popoverBox(app: ReturnType<typeof renderAt>): { left: number; right: number; height: number } {
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
  if (!rect) throw new Error("popover surface not rendered")
  return { left: rect.x, right: rect.x + rect.width, height: rect.height }
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 30))

describe("popover placement at its anchor", () => {
  test("a mid-screen anchor with narrow content sits at its anchor", async () => {
    const app = renderAt(55, "NARROW")
    await settle()
    expect(popoverBox(app).left).toBe(55)
  })

  test("a near-edge anchor with narrow content sits at its anchor inside the margin", async () => {
    const app = renderAt(75, "NARROW")
    await settle()
    const box = popoverBox(app)
    expect(box.left).toBe(75)
    expect(box.right).toBeLessThanOrEqual(COLS - EDGE_X)
  })

  test("a near-edge anchor with wide content wraps within the room", async () => {
    const words = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel"]
    const app = renderAt(75, words.join(" "))
    await settle()
    const box = popoverBox(app)
    expect(box.left).toBe(75)
    expect(box.right).toBeLessThanOrEqual(COLS - EDGE_X)
    // One line of body plus 1-row padding top and bottom would be 3 rows.
    expect(box.height).toBeGreaterThan(3)
  })

  test("an anchor within 20 columns of the margin is placed flush right", async () => {
    const app = renderAt(85, "NARROW")
    await settle()
    expect(popoverBox(app).right).toBe(COLS - EDGE_X)
  })
})
