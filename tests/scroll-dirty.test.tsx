import React from "react"
/**
 * Test that scroll offset changes mark nodes dirty for incremental rendering.
 *
 * This test verifies the fix for a bug where changing scroll position didn't
 * mark nodes dirty, causing incremental renders to skip re-rendering and
 * leave stale content in the cloned buffer.
 */
import { describe, expect, test } from "vitest"
import { Box, Text } from "../src/index.js"
import { createRenderer } from "../src/testing/index.js"

// Create renderer with incremental enabled (default)
const render = createRenderer({ cols: 40, rows: 10 })

describe("scroll dirty flags", () => {
  test("scroll offset change marks container dirty", async () => {
    // Component with scrollable list that can change scrollTo
    function ScrollList({ scrollTo }: { scrollTo: number }) {
      return (
        <Box
          height={5}
          overflow="scroll"
          scrollTo={scrollTo}
          borderStyle="single"
        >
          <Text>Item 0</Text>
          <Text>Item 1</Text>
          <Text>Item 2</Text>
          <Text>Item 3</Text>
          <Text>Item 4</Text>
          <Text>Item 5</Text>
          <Text>Item 6</Text>
          <Text>Item 7</Text>
        </Box>
      )
    }

    // Initial render with scrollTo=0
    const app = render(<ScrollList scrollTo={0} />)
    const text1 = app.text
    expect(text1).toContain("Item 0")

    // Rerender with scrollTo=5 (scroll down)
    app.rerender(<ScrollList scrollTo={5} />)
    const text2 = app.text

    // Should now show Item 5 (scrolled into view)
    expect(text2).toContain("Item 5")

    // The critical check: border should still be present
    // Before the fix, the border would be missing because the scroll
    // container wasn't marked dirty and wasn't re-rendered
    expect(text2).toContain("┌") // single border style
    expect(text2).toContain("┘")
  })

  test("incremental render matches fresh after scroll change", async () => {
    function ScrollList({ scrollTo }: { scrollTo: number }) {
      return (
        <Box
          height={5}
          overflow="scroll"
          scrollTo={scrollTo}
          borderStyle="round"
        >
          {Array.from({ length: 20 }, (_, i) => (
            <Text key={i}>Line {i}</Text>
          ))}
        </Box>
      )
    }

    const app = render(<ScrollList scrollTo={0} />)

    // Rerender with different scroll position
    app.rerender(<ScrollList scrollTo={10} />)

    // Get incremental result
    const incrementalText = app.text

    // Get fresh render result
    const freshBuffer = app.freshRender()
    const freshText = Array.from({ length: freshBuffer.height }, (_, y) =>
      Array.from(
        { length: freshBuffer.width },
        (_, x) => freshBuffer.getCell(x, y).char,
      ).join(""),
    ).join("\n")

    // They should match
    expect(incrementalText.trim()).toBe(freshText.trim())
  })

  test("INKX_STRICT catches mismatches in test renderer", async () => {
    // This test verifies the test renderer now checks on every render
    // like the scheduler does when INKX_STRICT is set.
    // The actual check happens inside doRender() - this test just
    // confirms the mechanism works by running with INKX_STRICT and
    // ensuring no error is thrown (because the fix is in place).

    function Counter({ count }: { count: number }) {
      return (
        <Box height={3} overflow="scroll" scrollTo={count % 5}>
          {Array.from({ length: 10 }, (_, i) => (
            <Text key={i}>Count {i}</Text>
          ))}
        </Box>
      )
    }

    const app = render(<Counter count={0} />)

    // Multiple rerenders that change scroll position
    // Before the fix, these would cause mismatches
    for (let i = 1; i <= 5; i++) {
      app.rerender(<Counter count={i} />)
    }

    // If we get here without throwing, incremental matches fresh
    expect(app.text).toContain("Count")
  })
})
