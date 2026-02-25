/**
 * Minimal reproduction for INKX_STRICT garble in scroll containers.
 *
 * Bug: km-inkx.garble-incremental
 *
 * The fresh render (doFreshRender with prevBuffer=null) produces text bleeding
 * in scroll containers — off-screen item text leaks into visible items.
 * The incremental render is correct.
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { createRenderer } from "../tests/setup.js"
import React, { useState } from "react"
import { Box, Text } from "../src/index.js"

beforeEach(() => {
  process.env.INKX_STRICT = "1"
})
afterEach(() => {
  delete process.env.INKX_STRICT
})

function ScrollBoard({ selectedCol }: { selectedCol: number }) {
  // Create a board with columns, each containing a scroll container with many items
  const cols = [
    { name: "Column A", items: Array.from({ length: 50 }, (_, i) => `Task A-${i}: ${"-".repeat(20)}`) },
    { name: "Column B", items: Array.from({ length: 100 }, (_, i) => `Task B-${i}: ${"=".repeat(20)}`) },
  ]

  return (
    <Box flexDirection="row" width={80} height={20}>
      {cols.map((col, colIdx) => (
        <Box key={colIdx} flexDirection="column" width={40} height={20}>
          <Box height={1}>
            <Text bold inverse={colIdx === selectedCol}>
              {col.name}
            </Text>
          </Box>
          <Box overflow="scroll" flexDirection="column" height={19}>
            {col.items.map((item, i) => (
              <Box key={i} height={1}>
                <Text>{item}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  )
}

describe("INKX_STRICT scroll container garble", () => {
  test("scroll container with many items - cursor move triggers garble", async () => {
    const cols = 80
    const rows = 20
    const render = createRenderer({ cols, rows })

    const app = render(<ScrollBoard selectedCol={0} />)
    expect(app.text).toContain("Column A")

    // Re-render with a change (simulates cursor move)
    app.rerender(<ScrollBoard selectedCol={1} />)
    expect(app.text).toContain("Column B")
    // INKX_STRICT auto-checks incremental vs fresh after this render
  })

  test("large scroll container - multiple rerenders", () => {
    const cols = 80
    const rows = 20
    const render = createRenderer({ cols, rows })

    function App({ step }: { step: number }) {
      const items = Array.from({ length: 200 }, (_, i) => `Item ${i}: ${"x".repeat(30)}`)

      return (
        <Box flexDirection="column" width={cols} height={rows}>
          <Box height={1}>
            <Text bold>Step {step}</Text>
          </Box>
          <Box overflow="scroll" flexDirection="column" height={rows - 1}>
            {items.map((item, i) => (
              <Box key={i} height={1} backgroundColor={i === step ? "blue" : undefined}>
                <Text color={i === step ? "white" : undefined}>{item}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      )
    }

    const app = render(<App step={0} />)
    expect(app.text).toContain("Step 0")

    for (let i = 1; i <= 5; i++) {
      app.rerender(<App step={i} />)
      expect(app.text).toContain(`Step ${i}`)
      // INKX_STRICT auto-checks on each render
    }
  })

  test("scroll container with cards and outlines - board-like layout", () => {
    const cols = 120
    const rows = 30
    const render = createRenderer({ cols, rows })

    function Card({ title, items, selected }: { title: string; items: string[]; selected: boolean }) {
      return (
        <Box
          flexDirection="column"
          width={56}
          outlineStyle={selected ? "single" : undefined}
          outlineColor={selected ? "yellow" : undefined}
        >
          <Box height={1}>
            <Text bold>{title}</Text>
            <Text> {items.length}</Text>
          </Box>
          <Box overflow="scroll" flexDirection="column" height={20}>
            {items.map((item, i) => (
              <Box key={i} height={2}>
                <Text wrap="truncate">{item}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      )
    }

    function Board({ cursor }: { cursor: [number, number] }) {
      const columns = [
        {
          name: "Backlog",
          cards: Array.from({ length: 40 }, (_, i) => ({
            title: `Backlog item ${i}: ${"description text ".repeat(3)}`,
          })),
        },
        {
          name: "In Progress",
          cards: Array.from({ length: 80 }, (_, i) => ({
            title: `WIP task ${i}: ${"progress details ".repeat(2)}`,
          })),
        },
      ]

      return (
        <Box flexDirection="column" width={cols} height={rows}>
          <Box height={1}>
            <Text bold>Board View</Text>
          </Box>
          <Box flexDirection="row" height={rows - 2}>
            {columns.map((col, colIdx) => (
              <Card
                key={colIdx}
                title={col.name}
                items={col.cards.map((c) => c.title)}
                selected={cursor[0] === colIdx}
              />
            ))}
          </Box>
          <Box height={1}>
            <Text dimColor>Status bar</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<Board cursor={[0, 0]} />)
    expect(app.text).toContain("Board View")

    // Simulate navigation
    const moves: [number, number][] = [
      [1, 0], // Move to column 2
      [1, 1], // Move down
      [0, 1], // Move back to column 1
      [0, 2], // Move down
      [1, 2], // Move to column 2
    ]

    for (const cursor of moves) {
      app.rerender(<Board cursor={cursor} />)
      // INKX_STRICT auto-checks
    }
  })

  test("nested scroll containers", async () => {
    const cols = 120
    const rows = 30
    const render = createRenderer({ cols, rows })

    function NestedBoard({ cursor }: { cursor: number }) {
      return (
        <Box flexDirection="row" width={cols} height={rows}>
          <Box flexDirection="column" width={60} height={rows}>
            <Text bold>Left Panel</Text>
            <Box overflow="scroll" flexDirection="column" height={rows - 1}>
              {Array.from({ length: 80 }, (_, i) => (
                <Box key={i} height={2} outlineStyle={i === cursor ? "single" : undefined}>
                  <Text>
                    Card {i}: {"some content text ".repeat(2)}
                  </Text>
                </Box>
              ))}
            </Box>
          </Box>
          <Box flexDirection="column" width={60} height={rows}>
            <Text bold>Right Panel</Text>
            <Box overflow="scroll" flexDirection="column" height={rows - 1}>
              {Array.from({ length: 150 }, (_, i) => (
                <Box key={i} height={1}>
                  <Text>
                    {"§ "}Detail {i}: {"description text ".repeat(3)}
                  </Text>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      )
    }

    const app = render(<NestedBoard cursor={0} />)
    expect(app.text).toContain("Left Panel")

    // Simulate cursor moves
    for (let i = 1; i <= 5; i++) {
      app.rerender(<NestedBoard cursor={i} />)
      // INKX_STRICT auto-checks
    }
  })
})
