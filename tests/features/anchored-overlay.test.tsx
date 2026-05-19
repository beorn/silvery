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

  test("overlay placed left of anchor in a right-column container resolves to screen-absolute position", () => {
    // Regression coverage for @km/code/15390 Bug 3 — silvercode SidePanel
    // cmd-hover popovers (account-row quota panel, agents panel, model
    // selector) when the anchor sits inside a right-side flex column.
    //
    // The AnchoredOverlay wrapper is `position="absolute"` inside the
    // right-side column; in flexily, absolute children's containing block
    // is the immediate parent's padding box (no "nearest positioned
    // ancestor" search). The wrapper takes the right-column's rect.
    // Decoration rects are screen-absolute; AnchoredOverlayContent
    // subtracts the wrapper's hostRect so the inner Box ends up at the
    // correct screen-absolute position, even when placement="left-start"
    // pushes the popover OUTSIDE the right column (negative left).
    //
    // This test pins the right-column scenario at steady state so a
    // future regression in either layout-signals decoration math or
    // AnchoredOverlay's hostRect-subtraction is caught.
    const render = createRenderer({ cols: 60, rows: 14 })

    const app = render(
      <Box width={60} height={14} flexDirection="row">
        <Box flexGrow={1} minWidth={0}>
          <Text>chat</Text>
        </Box>
        <Box width={24} flexShrink={0} flexDirection="column" padding={1}>
          <Box marginTop={4} anchorRef="right-col-trigger" width={10} height={1}>
            <Text>trigger</Text>
          </Box>
          <AnchoredOverlay
            anchorId="right-col-trigger"
            placement="left-start"
            size={{ width: 20, height: 4 }}
            id="overlay"
          >
            <Text>menu-body</Text>
          </AnchoredOverlay>
        </Box>
      </Box>,
    )

    expect(app.text).toContain("menu-body")
    const overlay = findById(getRoot(app), "overlay")
    expect(overlay).not.toBeNull()
    // Right-side panel starts at screen x = 36 (60 - 24). With
    // placement="left-start" the popover must render to the LEFT of the
    // panel, in the chat-area space.
    expect(overlay!.boxRect.x, "popover screen-x must be left of the side panel").toBeLessThan(36)
    expect(overlay!.boxRect.x).toBeGreaterThanOrEqual(0)
    expect(overlay!.boxRect.width).toBe(20)
    expect(overlay!.boxRect.height).toBe(4)
  })

  test("sizing=max popover in right-side panel with left-start placement renders left of the panel", () => {
    // Mirrors the silvercode SidePanel.tsx popover shape: sizing="max"
    // with size collision footprint up to panel height, placement
    // "left-start", inside an AsideLayout right column.
    // Pins behavior at a realistic terminal size + panel width.
    const COLS = 200
    const ROWS = 30
    const PANEL_W = 40
    const render = createRenderer({ cols: COLS, rows: ROWS })

    const app = render(
      <Box width={COLS} height={ROWS} flexDirection="row">
        <Box flexGrow={1} minWidth={0}>
          <Text>{"chat area".padEnd(COLS - PANEL_W - 1, " ")}</Text>
        </Box>
        <Box width={PANEL_W} flexShrink={0} flexDirection="column" padding={1}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Box key={i} height={1}>
              <Text>{`panel-row-${i}`.padEnd(PANEL_W - 3)}</Text>
            </Box>
          ))}
          <Box anchorRef="quota-trigger" width={PANEL_W - 3} height={1}>
            <Text>{"quota-row".padEnd(PANEL_W - 3)}</Text>
          </Box>
          <AnchoredOverlay
            anchorId="quota-trigger"
            placement="left-start"
            sizing="max"
            size={{ width: 48, height: ROWS - 2 }}
            id="quota-overlay"
          >
            <Text>QUOTA-DETAIL</Text>
          </AnchoredOverlay>
        </Box>
      </Box>,
    )

    expect(app.text).toContain("QUOTA-DETAIL")
    const overlay = findById(getRoot(app), "quota-overlay")
    expect(overlay).not.toBeNull()
    expect(overlay!.boxRect.x, "popover screen-x must be left of the side panel").toBeLessThan(COLS - PANEL_W)
    expect(overlay!.boxRect.x).toBeGreaterThanOrEqual(0)
    expect(overlay!.boxRect.y).toBeGreaterThanOrEqual(0)
    expect(overlay!.boxRect.y + overlay!.boxRect.height).toBeLessThanOrEqual(ROWS)
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
