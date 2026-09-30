import React, { useMemo, useState } from "react"
import { describe, expect, test } from "vitest"
import { createRenderer, createTermless } from "@silvery/test"
import "@termless/test/matchers"
import { run, useInput } from "../../packages/ag-term/src/runtime/run"
import { AnchoredOverlay, Box, Text } from "@silvery/ag-react"
import type { AgNode, BoxProps, Placement } from "@silvery/ag/types"

const settle = (ms = 80) => new Promise<void>((resolve) => setTimeout(resolve, ms))

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
    const rect = overlay!.boxRect
    expect(rect).not.toBeNull()
    // Right-side panel starts at screen x = 36 (60 - 24). With
    // placement="left-start" the popover must render to the LEFT of the
    // panel, in the chat-area space.
    expect(rect!.x, "popover screen-x must be left of the side panel").toBeLessThan(36)
    expect(rect!.x).toBeGreaterThanOrEqual(0)
    expect(rect!.width).toBe(20)
    expect(rect!.height).toBe(4)
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
    const rect = overlay!.boxRect
    expect(rect).not.toBeNull()
    expect(rect!.x, "popover screen-x must be left of the side panel").toBeLessThan(COLS - PANEL_W)
    expect(rect!.x).toBeGreaterThanOrEqual(0)
    expect(rect!.y).toBeGreaterThanOrEqual(0)
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(ROWS)
  })

  test("sizing=max popover anchored low places below the anchor without top-clipping", async () => {
    // Regression for @km/code/v0.2/19777 (origin 19624): a `sizing="max"`
    // popover declares a near-full-viewport collision footprint, but its
    // CONTENT is short. The old behavior treated the footprint as the real
    // size, so the bottom-placed popover "overflowed" the viewport bottom and
    // the shift step dragged it UP — its leading lines clipped above the
    // visible top (under surrounding chrome). The footprint is refined to the
    // measured content height (one frame late — the measure→re-place settle),
    // so the popover stays just below the anchor with its full content visible.
    //
    // Driven through the live runtime (`createTermless` + `run`) rather than the
    // static `createRenderer`: the content-height measurement settles on the
    // following event-batch commit, which only the runtime's commit boundary
    // advances. The header rows above the anchor stand in for the dialog chrome
    // that the leading popover lines were clipping under.
    const COLS = 60
    const ROWS = 24
    using term = createTermless({ cols: COLS, rows: ROWS })

    function Tree(): React.ReactElement {
      return (
        <Box width={COLS} height={ROWS} flexDirection="column">
          {Array.from({ length: 6 }).map((_, i) => (
            <Box key={i} height={1}>
              <Text>{`header-${i}`}</Text>
            </Box>
          ))}
          <Box anchorRef="trigger" width={20} height={1}>
            <Text>trigger</Text>
          </Box>
          <AnchoredOverlay
            anchorId="trigger"
            placement="bottom-start"
            sizing="max"
            size={{ width: 40, height: ROWS - 2 }}
            id="overlay"
          >
            <Box flexDirection="column">
              <Text>POPOVER-FIRST-LINE</Text>
              <Text>middle line</Text>
              <Text>POPOVER-LAST-LINE</Text>
            </Box>
          </AnchoredOverlay>
        </Box>
      )
    }

    const handle = await run(<Tree />, term)
    await settle()

    // Both the leading and trailing popover lines must be on-screen: the top is
    // not clipped above the popover, and the content is not clipped at the
    // bottom. Before the fix, "POPOVER-FIRST-LINE" was dragged above row 0.
    expect(term.screen).toContainText("POPOVER-FIRST-LINE")
    expect(term.screen).toContainText("POPOVER-LAST-LINE")
    // The header rows above the anchor remain visible (the popover did not get
    // dragged up over them).
    expect(term.screen).toContainText("header-0")

    await handle.unmount?.()
  })

  // #26660: an overlay whose only change is its decoration (placement, footprint)
  // must be re-placed. The decoration rect is written by the notify step of the
  // layout phase, and a `decorations` change leaves every Flexily node clean, so
  // the layout-on-demand gate used to skip that step and the overlay kept its old
  // rect. Driven through the live runtime with a root the size of the terminal:
  // a content-sized root changes size between frames and relays out every frame,
  // which hid the skip.
  test("a decorations-only change re-places a fixed overlay (placement flips to top)", async () => {
    const SIZE = { width: 10, height: 2 }
    using term = createTermless({ cols: 40, rows: 20 })

    function Tree(): React.ReactElement {
      const [placement, setPlacement] = useState<Placement>("bottom-start")
      useInput((input) => {
        if (input === "t") setPlacement("top-start")
      })
      return (
        <Box width={40} height={20} flexDirection="column" paddingTop={9}>
          <Box anchorRef="trigger" width={10} height={2}>
            <Text>trigger</Text>
          </Box>
          <AnchoredOverlay anchorId="trigger" placement={placement} size={SIZE} id="overlay">
            <Text>menu</Text>
          </AnchoredOverlay>
        </Box>
      )
    }

    const handle = await run(<Tree />, term)
    await handle.waitForLayoutStable()
    expect(findById(handle.root, "overlay")?.boxRect).toMatchObject({ y: 11, height: 2 })

    await handle.press("t")
    await handle.waitForLayoutStable()
    expect(
      findById(handle.root, "overlay")?.boxRect,
      "top-start sits above the anchor",
    ).toMatchObject({ y: 7, height: 2 })
    expect(term.screen).toContainText("menu")

    handle.unmount()
  })

  test("a decorations-only change re-places a max-sized overlay (footprint narrows)", async () => {
    // The content is wider than both footprints, so the box is as wide as the
    // footprint under either sizing order in Flexily; no width is measured here.
    using term = createTermless({ cols: 80, rows: 20 })

    function Tree(): React.ReactElement {
      const [width, setWidth] = useState(30)
      useInput((input) => {
        if (input === "n") setWidth(12)
      })
      const size = useMemo(() => ({ width, height: 10 }), [width])
      return (
        <Box width={80} height={20} paddingLeft={10} paddingTop={1} flexDirection="column">
          <Box anchorRef="trigger" width={40} height={1}>
            <Text>trigger</Text>
          </Box>
          <AnchoredOverlay
            anchorId="trigger"
            placement="bottom-end"
            sizing="max"
            size={size}
            id="overlay"
          >
            <Text>OVERLAY-CONTENT-WIDER-THAN-BOTH-CAPS</Text>
          </AnchoredOverlay>
        </Box>
      )
    }

    const handle = await run(<Tree />, term)
    await handle.waitForLayoutStable()
    // bottom-end: the overlay's right edge meets the anchor's (10 + 40 = 50).
    expect(findById(handle.root, "overlay")?.boxRect).toMatchObject({ x: 20, width: 30 })

    await handle.press("n")
    await handle.waitForLayoutStable()
    expect(findById(handle.root, "overlay")?.boxRect, "12-wide footprint ends at 50").toMatchObject(
      {
        x: 38,
        width: 12,
      },
    )

    handle.unmount()
  })

  // #26660: the collision footprint is the overlay's border box. The height
  // probe reported the content box (padding excluded), so a padded overlay
  // whose content fit below its anchor was placed there and its box ran past
  // the bottom of the screen by its padding. The column overlay with a column
  // body is the AnchoredPopoverTarget shape; its height follows its content.
  test("a sizing=max footprint is the overlay's border box (padding included)", async () => {
    using term = createTermless({ cols: 40, rows: 12 })

    function Tree(): React.ReactElement {
      return (
        <Box width={40} height={12} flexDirection="column" paddingTop={8}>
          <Box anchorRef="trigger" width={10} height={1}>
            <Text>trigger</Text>
          </Box>
          <AnchoredOverlay
            anchorId="trigger"
            placement="bottom-start"
            sizing="max"
            size={{ width: 20, height: 10 }}
            flexDirection="column"
            paddingY={1}
            id="overlay"
          >
            <Box flexDirection="column">
              <Text>FIRST</Text>
              <Text>middle</Text>
              <Text>LAST</Text>
            </Box>
          </AnchoredOverlay>
        </Box>
      )
    }

    const handle = await run(<Tree />, term)
    // The measured height reaches the footprint on a later commit (see 19777).
    await settle()
    await handle.waitForLayoutStable()
    // Three lines and a row of padding above and below make a 5-row box. Only
    // 3 rows remain below the anchor (row 8), so the policy flips it above,
    // flush with the anchor's top edge.
    expect(findById(handle.root, "overlay")?.boxRect).toMatchObject({ y: 3, height: 5 })
    expect(term.screen).toContainText("LAST")

    handle.unmount()
  })

  // #26660, seen and filed separately: an overlay paints in its host's absolute
  // pass (renderNormalChildren's third pass in render-phase.ts), so a later
  // sibling of one of its host's ancestors paints over it. A full-width anchor
  // leaves no room on either side, the policy shifts the overlay over the rows
  // below, and the footer painted after it covers them. This row pins today's
  // behavior and fails until an overlay paints above later rows of the tree.
  test.fails("an overlay shifted over later rows is painted over by them (paint order)", () => {
    const render = createRenderer({ cols: 40, rows: 12 })

    const app = render(
      <Box width={40} height={12} flexDirection="column">
        <Box height={9} flexDirection="column" justifyContent="flex-end">
          <Box anchorRef="row" width={40} height={1}>
            <Text>anchor row</Text>
          </Box>
          <AnchoredOverlay
            anchorId="row"
            placement="left-start"
            size={{ width: 20, height: 4 }}
            flexDirection="column"
            id="overlay"
          >
            <Text>OVERLAY-LINE-1</Text>
            <Text>OVERLAY-LINE-2</Text>
            <Text>OVERLAY-LINE-3</Text>
            <Text>OVERLAY-LINE-4</Text>
          </AnchoredOverlay>
        </Box>
        <Box flexDirection="column">
          <Text>FOOTER-1</Text>
          <Text>FOOTER-2</Text>
          <Text>FOOTER-3</Text>
        </Box>
      </Box>,
    )

    // Shifted to x 0 at the anchor's row, over the footer's three rows.
    expect(findById(getRoot(app), "overlay")?.boxRect).toEqual({ x: 0, y: 8, width: 20, height: 4 })
    // Today the footer's text overwrites the overlay's lines 2 to 4.
    expect(app.text).toContain("OVERLAY-LINE-4")
  })

  // #26660: under content-first sizing (#26388) a `sizing="max"` box is as
  // wide as its content, so the collision footprint must learn the measured
  // width the way it learns the measured height; placements that subtract the
  // footprint width (`*-end`, `left-*`) otherwise leave a cap-wide gap.
  // Both rows hold on cap-first layout too, where content fills the cap.
  function NarrowContent({ label }: { label: string }): React.ReactElement {
    return (
      <Box flexDirection="column">
        <Text>{label}</Text>
      </Box>
    )
  }

  // The measured size reaches the footprint on a later commit, which only the
  // live runtime advances (see the 19777 row below).
  async function settledRect(tree: React.ReactElement, cols: number, rows: number, id: string) {
    using term = createTermless({ cols, rows })
    const handle = await run(tree, term)
    await settle()
    await handle.waitForLayoutStable()
    await settle()
    const rect = findById(handle.root, id)?.boxRect ?? null
    await handle.unmount?.()
    return rect
  }

  test("sizing=max footprint width follows the measured content (bottom-end is flush)", async () => {
    const rect = await settledRect(
      <Box width={80} height={20} paddingLeft={10} paddingTop={1} flexDirection="column">
        <Box anchorRef="trigger" width={40} height={1}>
          <Text>trigger</Text>
        </Box>
        <AnchoredOverlay
          anchorId="trigger"
          placement="bottom-end"
          sizing="max"
          size={{ width: 30, height: 10 }}
          id="overlay"
        >
          <NarrowContent label="NARROW-12ch!" />
        </AnchoredOverlay>
      </Box>,
      80,
      20,
      "overlay",
    )
    expect(rect).toBeTruthy()
    expect(rect!.width).toBeLessThanOrEqual(30)
    expect(rect!.x + rect!.width, "overlay right edge is flush with the anchor's").toBe(10 + 40)
  })

  test("sizing=max left-start overlay ends flush against its anchor", async () => {
    // The side-panel account popover shape (ag-chat-ui SidePanel.tsx).
    const rect = await settledRect(
      <Box width={120} height={20} flexDirection="row">
        <Box flexGrow={1} minWidth={0}>
          <Text>chat</Text>
        </Box>
        <Box width={40} flexShrink={0} flexDirection="column" paddingTop={2}>
          <Box anchorRef="account" width={40} height={1}>
            <Text>account-row</Text>
          </Box>
          <AnchoredOverlay
            anchorId="account"
            placement="left-start"
            sizing="max"
            size={{ width: 48, height: 18 }}
            id="account-overlay"
          >
            <NarrowContent label="ACCOUNT-DETAIL" />
          </AnchoredOverlay>
        </Box>
      </Box>,
      120,
      20,
      "account-overlay",
    )
    expect(rect).toBeTruthy()
    expect(rect!.x + rect!.width, "overlay right edge touches the anchor's left edge").toBe(
      120 - 40,
    )
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
