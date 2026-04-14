/**
 * Outside Outline — Incremental Rendering Tests
 *
 * Outlines draw OUTSIDE the box's rect (at x-1, y-1 through x+width, y+height).
 * These cells are in the parent's pixel space. The incremental pipeline must
 * track outline changes on children so the parent clears stale outline cells.
 *
 * SILVERY_STRICT=1 (set by vitest/setup.ts) verifies incremental === fresh.
 */

import React, { useState } from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"

describe("outside outline: incremental rendering", () => {
  test("toggling outlineStyle on a child does not leave stale outline cells", () => {
    const render = createRenderer({ cols: 30, rows: 12 })

    function App({ outlined }: { outlined: boolean }) {
      return (
        <Box flexDirection="column" padding={1} gap={1}>
          <Box
            id="child-a"
            outlineStyle={outlined ? "round" : undefined}
            outlineColor="yellow"
            width={10}
            height={3}
          >
            <Text>AAA</Text>
          </Box>
          <Box id="child-b" width={10} height={3}>
            <Text>BBB</Text>
          </Box>
        </Box>
      )
    }

    // Frame 1: no outline — establishes the prev buffer
    const app = render(<App outlined={false} />)
    expect(app.text).toContain("AAA")
    expect(app.text).toContain("BBB")

    // Frame 2: enable outline — outline should appear (STRICT checks incremental = fresh)
    app.rerender(<App outlined={true} />)
    expect(app.text).toContain("AAA")

    // Frame 3: disable outline — stale outline cells must be cleared
    app.rerender(<App outlined={false} />)
    expect(app.text).toContain("AAA")
  })

  test("moving outline between sibling children clears old and draws new", () => {
    const render = createRenderer({ cols: 30, rows: 14 })

    function App({ cursor }: { cursor: "a" | "b" }) {
      return (
        <Box flexDirection="column" padding={1} gap={1}>
          <Box
            id="child-a"
            outlineStyle={cursor === "a" ? "single" : undefined}
            outlineColor="cyan"
            width={10}
            height={3}
          >
            <Text>Item A</Text>
          </Box>
          <Box
            id="child-b"
            outlineStyle={cursor === "b" ? "single" : undefined}
            outlineColor="cyan"
            width={10}
            height={3}
          >
            <Text>Item B</Text>
          </Box>
        </Box>
      )
    }

    // Frame 1: outline on child-a
    const app = render(<App cursor="a" />)
    expect(app.text).toContain("Item A")
    expect(app.text).toContain("Item B")

    // Frame 2: move outline to child-b — stale outline on child-a must be cleared
    app.rerender(<App cursor="b" />)
    expect(app.text).toContain("Item A")
    expect(app.text).toContain("Item B")

    // Frame 3: move back to child-a
    app.rerender(<App cursor="a" />)
    expect(app.text).toContain("Item A")
  })

  test("outline with backgroundColor on parent clears correctly", () => {
    const render = createRenderer({ cols: 30, rows: 10 })

    function App({ outlined }: { outlined: boolean }) {
      return (
        <Box flexDirection="column" padding={1} gap={1} backgroundColor="blue">
          <Box
            id="outlined-child"
            outlineStyle={outlined ? "round" : undefined}
            width={8}
            height={3}
          >
            <Text>Hi</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App outlined={false} />)
    expect(app.text).toContain("Hi")

    app.rerender(<App outlined={true} />)
    expect(app.text).toContain("Hi")

    app.rerender(<App outlined={false} />)
    expect(app.text).toContain("Hi")
  })

  test("outline style change (single -> round) re-renders correctly", () => {
    const render = createRenderer({ cols: 30, rows: 10 })

    function App({ style }: { style: "single" | "round" }) {
      return (
        <Box flexDirection="column" padding={1}>
          <Box
            id="styled-child"
            outlineStyle={style}
            outlineColor="green"
            width={10}
            height={3}
          >
            <Text>Styled</Text>
          </Box>
        </Box>
      )
    }

    // Frame 1: single outline
    const app = render(<App style="single" />)
    expect(app.text).toContain("Styled")

    // Frame 2: change to round outline — STRICT checks incremental = fresh
    app.rerender(<App style="round" />)
    expect(app.text).toContain("Styled")
  })

  test("multiple outline toggles in sequence", () => {
    const render = createRenderer({ cols: 30, rows: 10 })

    function App({ outlined }: { outlined: boolean }) {
      return (
        <Box flexDirection="column" padding={1}>
          <Box
            id="toggle-child"
            outlineStyle={outlined ? "bold" : undefined}
            width={10}
            height={3}
          >
            <Text>Toggle</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App outlined={false} />)

    // Rapidly toggle outline on/off — each frame must match fresh render
    for (let i = 0; i < 5; i++) {
      app.rerender(<App outlined={true} />)
      expect(app.text).toContain("Toggle")
      app.rerender(<App outlined={false} />)
      expect(app.text).toContain("Toggle")
    }
  })
})

// ============================================================================
// Realistic-scale tests — synthetic 2-3 node tests miss bugs that compound
// at scale. False-positive dirty cascades cause stack overflow on large trees.
// ============================================================================

describe("outside outline: realistic scale", () => {
  test("100-node tree with outline toggle does not stack overflow", () => {
    const render = createRenderer({ cols: 80, rows: 30 })

    function App({ outlinedIdx }: { outlinedIdx: number | null }) {
      // Realistic tree: 5 columns × 20 cards = 100 nodes
      return (
        <Box flexDirection="row">
          {Array.from({ length: 5 }).map((_, colIdx) => (
            <Box key={colIdx} flexDirection="column" width={16}>
              {Array.from({ length: 20 }).map((_, cardIdx) => {
                const idx = colIdx * 20 + cardIdx
                return (
                  <Box
                    key={cardIdx}
                    id={`card-${idx}`}
                    outlineStyle={outlinedIdx === idx ? "round" : undefined}
                    outlineColor="yellow"
                    width={14}
                    height={1}
                  >
                    <Text>card-{idx}</Text>
                  </Box>
                )
              })}
            </Box>
          ))}
        </Box>
      )
    }

    // Frame 1: no outlines — establishes prev buffer with 100 nodes
    const app = render(<App outlinedIdx={null} />)
    expect(app.text).toContain("card-0")

    // Frame 2: outline appears on card 50 (middle of tree)
    app.rerender(<App outlinedIdx={50} />)
    expect(app.text).toContain("card-50")

    // Frame 3: outline moves to card 75
    app.rerender(<App outlinedIdx={75} />)
    expect(app.text).toContain("card-75")

    // Frame 4: outline removed — STRICT verifies stale corners cleared
    app.rerender(<App outlinedIdx={null} />)
    expect(app.text).toContain("card-50")
  })
})

// ============================================================================
// Edge overflow tests — outlines that extend beyond the parent's rect into
// the grandparent's space. Reproduces km-tui (41,4) mismatch.
// ============================================================================

describe("outside outline: edge overflow clears stale pixels", () => {
  test("outline at parent edge — toggle off clears corner beyond parent rect", () => {
    const render = createRenderer({ cols: 50, rows: 15 })

    function App({ outlined }: { outlined: boolean }) {
      return (
        <Box flexDirection="column" width={50} height={15}>
          <Box id="body-col" flexDirection="column" width={42} paddingLeft={1} paddingTop={2}>
            <Box
              id="card"
              width={40}
              height={3}
              borderStyle="round"
              borderColor={outlined ? "yellow" : undefined}
              outlineStyle={outlined ? "round" : undefined}
              outlineColor="yellow"
            >
              <Text>Card content</Text>
            </Box>
            <Box id="card2" width={40} height={2}>
              <Text>Second card</Text>
            </Box>
          </Box>
        </Box>
      )
    }

    const app = render(<App outlined={true} />)
    expect(app.text).toContain("Card content")
    app.rerender(<App outlined={false} />)
    expect(app.text).toContain("Card content")
  })

  test("outline extends beyond parent rect into grandparent space", () => {
    // Critical case: child fills parent width, outline right edge is 1 cell
    // beyond parent's right edge. Parent's clearNodeRegion can't clear that
    // pixel — grandparent must detect and clear it.
    const render = createRenderer({ cols: 50, rows: 15 })

    function App({ outlined }: { outlined: boolean }) {
      return (
        <Box id="grandparent" flexDirection="column" width={50} height={15}>
          <Box id="parent" flexDirection="column" width={41} paddingLeft={1} paddingTop={2}>
            <Box
              id="card"
              width={40}
              height={3}
              outlineStyle={outlined ? "round" : undefined}
              outlineColor="yellow"
            >
              <Text>Card A</Text>
            </Box>
            <Box id="card-b" width={40} height={2} marginTop={1}>
              <Text>Card B</Text>
            </Box>
          </Box>
        </Box>
      )
    }

    const app = render(<App outlined={true} />)
    expect(app.text).toContain("Card A")
    app.rerender(<App outlined={false} />)
    expect(app.text).toContain("Card A")
  })

  test("card border color change with outline at parent edge", () => {
    // Simulates km-tui scenario: card with borderStyle="round" and
    // selection-dependent borderColor. Border top-right corner at parent edge.
    const render = createRenderer({ cols: 50, rows: 15 })

    function App({ selected }: { selected: boolean }) {
      return (
        <Box id="grandparent" flexDirection="column" width={50} height={15}>
          <Box id="body-col" flexDirection="column" width={41} paddingLeft={1} paddingTop={2}>
            <Box
              id="card-wrapper"
              width={40}
              height={3}
              borderStyle="round"
              borderColor={selected ? "yellow" : undefined}
            >
              <Text>Task item</Text>
            </Box>
          </Box>
        </Box>
      )
    }

    const app = render(<App selected={true} />)
    expect(app.text).toContain("Task item")
    app.rerender(<App selected={false} />)
    expect(app.text).toContain("Task item")
  })
})
