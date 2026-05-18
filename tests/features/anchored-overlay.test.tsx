import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { AnchoredOverlay, Box, Text } from "@silvery/ag-react"
import type { AgNode, BoxProps, Placement } from "@silvery/ag/types"

function getRoot(app: ReturnType<ReturnType<typeof createRenderer>>): AgNode {
  return (app as unknown as { getContainer: () => AgNode }).getContainer()
}

function findById(node: AgNode, id: string): AgNode | null {
  const props = node.props as BoxProps | undefined
  if (props?.id === id) return node
  for (const child of node.children) {
    const hit = findById(child, id)
    if (hit !== null) return hit
  }
  return null
}

describe("AnchoredOverlay", () => {
  test("renders overlay content at the anchor decoration rect", () => {
    const render = createRenderer({ cols: 40, rows: 14 })

    const app = render(
      <Box width={40} height={14} padding={1}>
        <Box anchorRef="trigger" width={10} height={2}>
          <Text>trigger</Text>
        </Box>
        <AnchoredOverlay anchorId="trigger" size={{ width: 8, height: 2 }} id="overlay">
          <Text>menu</Text>
        </AnchoredOverlay>
      </Box>,
    )

    expect(app.text).toContain("menu")
    expect(findById(getRoot(app), "overlay")?.boxRect).toEqual({
      x: 1,
      y: 3,
      width: 8,
      height: 2,
    })
  })

  test("positions correctly when rendered from a nested host", () => {
    const render = createRenderer({ cols: 40, rows: 14 })

    const app = render(
      <Box width={40} height={14} padding={1}>
        <Box marginTop={3} marginLeft={5} width={20} height={8} position="relative">
          <Box anchorRef="nested-trigger" width={10} height={2}>
            <Text>trigger</Text>
          </Box>
          <AnchoredOverlay anchorId="nested-trigger" size={{ width: 8, height: 2 }} id="overlay">
            <Text>menu</Text>
          </AnchoredOverlay>
        </Box>
      </Box>,
    )

    expect(app.text).toContain("menu")
    expect(findById(getRoot(app), "overlay")?.boxRect).toEqual({
      x: 6,
      y: 6,
      width: 8,
      height: 2,
    })
  })

  test("uses flip-then-shift collision by default", () => {
    const render = createRenderer({ cols: 20, rows: 10 })

    const app = render(
      <Box width={20} height={10}>
        <Box marginTop={8} marginLeft={14} anchorRef="edge" width={4} height={1}>
          <Text>btn</Text>
        </Box>
        <AnchoredOverlay
          anchorId="edge"
          placement="bottom-end"
          alignOffset={6}
          size={{ width: 8, height: 3 }}
          id="overlay"
        >
          <Text>menu</Text>
        </AnchoredOverlay>
      </Box>,
    )

    expect(findById(getRoot(app), "overlay")?.boxRect).toEqual({
      x: 12,
      y: 5,
      width: 8,
      height: 3,
    })
  })

  test("can use size as a maximum collision footprint", () => {
    const render = createRenderer({ cols: 40, rows: 14 })

    const app = render(
      <Box width={40} height={14} padding={1}>
        <Box anchorRef="trigger" width={10} height={1}>
          <Text>trigger</Text>
        </Box>
        <AnchoredOverlay
          anchorId="trigger"
          sizing="max"
          size={{ width: 20, height: 5 }}
          id="overlay"
        >
          <Text>menu</Text>
        </AnchoredOverlay>
      </Box>,
    )

    expect(findById(getRoot(app), "overlay")?.boxRect).toEqual({
      x: 1,
      y: 2,
      width: 4,
      height: 1,
    })
  })

  test("flip-then-shift keeps overlays inside the viewport", () => {
    const placements: Placement[] = [
      "top-start",
      "top-center",
      "top-end",
      "bottom-start",
      "bottom-center",
      "bottom-end",
      "left-start",
      "left-center",
      "left-end",
      "right-start",
      "right-center",
      "right-end",
    ]
    const anchors = [
      { x: 0, y: 0 },
      { x: 18, y: 6 },
      { x: 38, y: 13 },
    ]

    for (const placement of placements) {
      for (const anchor of anchors) {
        const render = createRenderer({ cols: 40, rows: 14 })
        const app = render(
          <Box width={40} height={14}>
            <Box marginLeft={anchor.x} marginTop={anchor.y} anchorRef="edge" width={1} height={1}>
              <Text>x</Text>
            </Box>
            <AnchoredOverlay
              anchorId="edge"
              placement={placement}
              size={{ width: 8, height: 3 }}
              id="overlay"
            >
              <Text>menu</Text>
            </AnchoredOverlay>
          </Box>,
        )

        const rect = findById(getRoot(app), "overlay")?.boxRect
        expect(rect, `${placement} at ${JSON.stringify(anchor)}`).toBeDefined()
        expect(rect!.x, `${placement} x`).toBeGreaterThanOrEqual(0)
        expect(rect!.y, `${placement} y`).toBeGreaterThanOrEqual(0)
        expect(rect!.x + rect!.width, `${placement} right`).toBeLessThanOrEqual(40)
        expect(rect!.y + rect!.height, `${placement} bottom`).toBeLessThanOrEqual(14)
      }
    }
  })

  test("removes overlay content when closed", () => {
    const render = createRenderer({ cols: 40, rows: 14 })

    const app = render(
      <Box width={40} height={14} padding={1}>
        <Box anchorRef="trigger" width={10} height={2}>
          <Text>trigger</Text>
        </Box>
        <AnchoredOverlay
          anchorId="trigger"
          open={false}
          size={{ width: 8, height: 2 }}
          id="overlay"
        >
          <Text>menu</Text>
        </AnchoredOverlay>
      </Box>,
    )

    expect(app.text).not.toContain("menu")
    expect(findById(getRoot(app), "overlay")).toBeNull()
  })
})
