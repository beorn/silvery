import { describe, test, expect } from "vitest"
import { createRenderer } from "inkx/testing"
import { Box, Text } from "inkx"
import React from "react"

describe("border rendering with borderBottom=false", () => {
  test("inner box with borderBottom=false fills parent width", () => {
    const render = createRenderer({ cols: 50, rows: 10 })
    const width = 49

    function TestApp() {
      return (
        <Box flexDirection="column" flexShrink={0} width={width}>
          <Box
            flexDirection="column"
            borderStyle="round"
            borderBottom={false}
          >
            <Text>line-a</Text>
            <Text>line-b</Text>
          </Box>
          <Text>bottom-text</Text>
        </Box>
      )
    }

    const app = render(<TestApp />)
    const text = app.text
    const rows = text.split("\n")

    // The top border should span the full parent width
    const topRow = rows.find(r => r.includes("\u256d"))!
    const topStart = topRow.indexOf("\u256d")
    const topEnd = topRow.indexOf("\u256e")
    expect(topEnd - topStart + 1, "inner box top border should span full parent width").toBe(width)
  })

  test("inside scroll container — inner box with borderBottom=false fills parent width", () => {
    const render = createRenderer({ cols: 50, rows: 30 })
    const containerWidth = 49

    function TestApp() {
      return (
        <Box flexDirection="column" width={containerWidth} height={25} overflow="scroll">
          {/* Card with overflow (borderBottom=false + custom bottom border) */}
          <Box flexDirection="column" flexShrink={0} width={containerWidth}>
            <Box
              flexDirection="column"
              borderStyle="round"
              borderBottom={false}
            >
              <Text>card-a</Text>
              <Text>a-child1</Text>
            </Box>
            <Text wrap="truncate">
              {"\u2570"}{"\u2500".repeat(containerWidth - 2)}{"\u256f"}
            </Text>
          </Box>
          {/* Normal card */}
          <Box
            flexDirection="column"
            flexShrink={0}
            width={containerWidth}
            borderStyle="round"
          >
            <Text>card-b</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<TestApp />)
    const text = app.text
    const rows = text.split("\n")

    // Find the overflow card's top border
    const topRows = rows.filter(r => r.includes("\u256d") && r.includes("\u256e"))
    expect(topRows.length).toBeGreaterThanOrEqual(2) // overflow card + normal card

    // First top border (overflow card) should start at col 0
    const overflowTop = topRows[0]!
    const topStart = overflowTop.indexOf("\u256d")
    expect(topStart, "overflow card border should start at column 0").toBe(0)

    // Border should span full width
    const topEnd = overflowTop.indexOf("\u256e")
    expect(topEnd - topStart + 1, "overflow card border should span full container width").toBe(containerWidth)

    // Custom bottom border should contain ╯ (not truncated)
    expect(text, "custom bottom border should contain closing corner").toContain("\u256f")
  })

  test("inside overflow=hidden + scroll — matches real board structure", () => {
    const render = createRenderer({ cols: 50, rows: 30 })
    const colWidth = 50
    const cardWidth = colWidth - 1

    function TestApp() {
      return (
        <Box flexDirection="column" width={colWidth} height={27} overflow="hidden">
          {/* Column header */}
          <Box height={1} flexShrink={0} width={cardWidth}>
            <Text>col1</Text>
          </Box>
          {/* Separator */}
          <Box height={1} flexShrink={0} width={cardWidth}>
            <Text>{"\u2500".repeat(cardWidth)}</Text>
          </Box>
          {/* VirtualList area */}
          <Box flexDirection="column" width={cardWidth} height={25} overflow="scroll">
            {/* Overflow card */}
            <Box flexDirection="column" flexShrink={0} width={cardWidth}>
              <Box
                flexDirection="column"
                borderStyle="round"
                borderBottom={false}
              >
                <Text>card-a</Text>
                <Text>a-child1</Text>
              </Box>
              <Text wrap="truncate">
                {"\u2570"}{"\u2500".repeat(cardWidth - 2)}{"\u256f"}
              </Text>
            </Box>
            {/* Normal card */}
            <Box
              flexDirection="column"
              flexShrink={0}
              width={cardWidth}
              borderStyle="round"
            >
              <Text>card-b</Text>
            </Box>
          </Box>
        </Box>
      )
    }

    const app = render(<TestApp />)
    const text = app.text
    const rows = text.split("\n")

    // Check that overflow card top border starts at correct position
    const topRows = rows.filter(r => r.includes("\u256d") && r.includes("\u256e"))
    expect(topRows.length).toBeGreaterThanOrEqual(2)

    // Both cards' top borders should start at the same column
    const overflowTopStart = topRows[0]!.indexOf("\u256d")
    const normalTopStart = topRows[1]!.indexOf("\u256e") - (cardWidth - 1)

    // Both should start at same x position
    const overflowBorderStart = topRows[0]!.indexOf("\u256d")
    const normalBorderStart = topRows[1]!.indexOf("\u256d")
    expect(overflowBorderStart, "overflow and normal card borders should align").toBe(normalBorderStart)

    // Custom bottom border should NOT be truncated
    expect(text).toContain("\u256f")
  })
})
