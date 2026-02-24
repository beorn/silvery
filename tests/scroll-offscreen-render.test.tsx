/**
 * Test: Content initially off-screen in a scroll container renders correctly
 * when scrolled into view.
 *
 * Bug: content-phase.ts line 222-225 used to call clearDirtyFlags() on nodes
 * below the buffer height. This caused blank content when scrolled into view
 * because the nodes had no dirty flags to trigger rendering.
 *
 * Fix: Don't clear dirty flags on off-screen nodes — just skip rendering them.
 * They keep their creation dirty flags and render correctly when scrolled
 * into view.
 *
 * Bead: km-inkx.scroll-offscreen-render
 */
import React from "react"
import { describe, expect, test } from "vitest"
import { Box, Text } from "../src/index.js"
import { createRenderer } from "inkx/testing"

describe("scroll offscreen render", () => {
  test("content scrolled into view renders correctly (basic)", () => {
    // Basic: scroll container with items, scroll to bottom
    function ScrollList({ scrollTo }: { scrollTo: number }) {
      return (
        <Box width={30} height={10}>
          <Box overflow="scroll" height={10} scrollTo={scrollTo}>
            {Array.from({ length: 20 }, (_, i) => (
              <Box key={i} flexDirection="column">
                <Text>{`Item ${i}`}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      )
    }

    const incRender = createRenderer({ cols: 30, rows: 10, incremental: true })
    const app = incRender(<ScrollList scrollTo={0} />)
    expect(app.text).toContain("Item 0")

    app.rerender(<ScrollList scrollTo={19} />)
    expect(app.text).toContain("Item 19")

    const freshApp = createRenderer({ cols: 30, rows: 10 })(<ScrollList scrollTo={19} />)
    expect(app.text).toBe(freshApp.text)
  })

  test("deeply nested content renders when scrolled into view", () => {
    // Cards with nested structure — inner content may be below buffer
    function Card({ id }: { id: number }) {
      return (
        <Box flexDirection="column" borderStyle="single" width={26}>
          <Text bold>{`Card ${id}`}</Text>
          <Box flexDirection="column" paddingLeft={1}>
            <Text>{`Detail A-${id}`}</Text>
            <Text>{`Detail B-${id}`}</Text>
            <Text dimColor>{`Note: ${id}`}</Text>
          </Box>
        </Box>
      )
    }

    function App({ scrollOffset }: { scrollOffset: number }) {
      return (
        <Box width={30} height={10}>
          <Box overflow="scroll" height={10} scrollOffset={scrollOffset}>
            <Box flexDirection="column">
              <Text>Header</Text>
              <Text>Intro line</Text>
            </Box>
            <Card id={1} />
            <Card id={2} />
            <Card id={3} />
          </Box>
        </Box>
      )
    }

    const incRender = createRenderer({ cols: 30, rows: 10, incremental: true })
    const app = incRender(<App scrollOffset={0} />)

    expect(app.text).toContain("Header")
    expect(app.text).toContain("Card 1")

    // Scroll to reveal Card 2 and 3
    app.rerender(<App scrollOffset={8} />)
    expect(app.text).toContain("Card 2")
    expect(app.text).toContain("Detail A-2")

    const freshApp = createRenderer({ cols: 30, rows: 10 })(<App scrollOffset={8} />)
    expect(app.text).toBe(freshApp.text)

    // Scroll further — at offset 16, Card 3's title may have scrolled past
    // the viewport top. The important check is incremental == fresh.
    app.rerender(<App scrollOffset={16} />)
    expect(app.text).toContain("Detail A-3")

    const freshApp2 = createRenderer({ cols: 30, rows: 10 })(<App scrollOffset={16} />)
    expect(app.text).toBe(freshApp2.text)
  })

  test("gradual scroll — each step matches fresh render", () => {
    // Scroll one row at a time and verify each matches fresh
    function App({ scrollOffset }: { scrollOffset: number }) {
      return (
        <Box width={30} height={8}>
          <Box overflow="scroll" height={8} scrollOffset={scrollOffset}>
            <Box flexDirection="column">
              {Array.from({ length: 20 }, (_, i) => (
                <Text key={i}>{`Row ${i.toString().padStart(2, "0")}: content`}</Text>
              ))}
            </Box>
          </Box>
        </Box>
      )
    }

    const incRender = createRenderer({ cols: 30, rows: 8, incremental: true })
    const app = incRender(<App scrollOffset={0} />)

    for (let offset = 1; offset <= 12; offset++) {
      app.rerender(<App scrollOffset={offset} />)
      const freshApp = createRenderer({ cols: 30, rows: 8 })(<App scrollOffset={offset} />)
      expect(app.text).toBe(freshApp.text)
    }
  })

  test("tall child with nested content — wasFullyVisible transition", () => {
    // Tests the specific scenario where a scroll container child is taller
    // than the viewport. Nested content at the bottom of the child is below
    // the buffer on initial render. After scrolling, the child may transition
    // to wasFullyVisible=true, and its content must still render.
    function App({ scrollOffset }: { scrollOffset: number }) {
      return (
        <Box width={30} height={10}>
          <Box overflow="scroll" height={10} scrollOffset={scrollOffset}>
            {/* Spacer child to push content down */}
            <Box height={2}>
              <Text>Header</Text>
            </Box>
            {/* Tall child: extends beyond buffer at scrollOffset=0 */}
            <Box flexDirection="column" height={12} borderStyle="single" width={28}>
              <Text bold>Card Title</Text>
              <Text>Line 1</Text>
              <Text>Line 2</Text>
              <Text>Line 3</Text>
              <Text>Line 4</Text>
              <Text>Line 5</Text>
              <Text>Line 6</Text>
              <Text>Line 7</Text>
              <Text>Line 8 (near bottom)</Text>
              <Text>Line 9 (bottom)</Text>
            </Box>
          </Box>
        </Box>
      )
    }

    const incRender = createRenderer({ cols: 30, rows: 10, incremental: true })
    const app = incRender(<App scrollOffset={0} />)

    // Initially: header + top of card visible
    expect(app.text).toContain("Card Title")
    expect(app.text).toContain("Line 1")

    // Scroll step by step, verifying each
    for (let offset = 1; offset <= 6; offset++) {
      app.rerender(<App scrollOffset={offset} />)
      const freshApp = createRenderer({ cols: 30, rows: 10 })(<App scrollOffset={offset} />)
      expect(app.text).toBe(freshApp.text)
    }

    // At this point, bottom content should be visible
    expect(app.text).toContain("Line 9 (bottom)")
  })

  test("storybook-like layout — sections with nested boards", () => {
    // Simulates the storybook pattern: scroll container wrapping multiple
    // view boxes, each containing a board-like structure

    function ViewBox({ title, children }: { title: string; children: React.ReactNode }) {
      return (
        <Box flexDirection="column" borderStyle="double" width={38} paddingX={1}>
          <Text bold color="magenta">
            {title}
          </Text>
          <Box marginTop={1} flexDirection="column">
            {children}
          </Box>
        </Box>
      )
    }

    function MockBoard({ id }: { id: number }) {
      return (
        <Box flexDirection="row">
          <Box flexDirection="column" width={18} borderStyle="single">
            <Text inverse>{`Col A (Board ${id})`}</Text>
            <Text>{`Task A1-${id}`}</Text>
            <Text>{`Task A2-${id}`}</Text>
          </Box>
          <Box flexDirection="column" width={18} borderStyle="single">
            <Text inverse>{`Col B (Board ${id})`}</Text>
            <Text>{`Task B1-${id}`}</Text>
            <Text>{`Task B2-${id}`}</Text>
          </Box>
        </Box>
      )
    }

    function AllViews({ scrollOffset }: { scrollOffset: number }) {
      return (
        <Box width={40} height={12}>
          <Box overflow="scroll" height={12} scrollOffset={scrollOffset} flexDirection="column">
            <Text>All View Modes</Text>
            <Text dimColor>Description</Text>

            <ViewBox title="View 1: Cards">
              <MockBoard id={1} />
            </ViewBox>

            <ViewBox title="View 2: Columns">
              <MockBoard id={2} />
            </ViewBox>

            <ViewBox title="View 3: Tabs">
              <MockBoard id={3} />
            </ViewBox>

            <ViewBox title="View 4: List">
              <MockBoard id={4} />
            </ViewBox>
          </Box>
        </Box>
      )
    }

    const incRender = createRenderer({ cols: 40, rows: 12, incremental: true })
    const app = incRender(<AllViews scrollOffset={0} />)

    // Scroll through all views, verifying each step
    for (let offset = 0; offset <= 40; offset += 3) {
      app.rerender(<AllViews scrollOffset={offset} />)
      const freshApp = createRenderer({ cols: 40, rows: 12 })(<AllViews scrollOffset={offset} />)
      expect(app.text).toBe(freshApp.text)
    }
  })
})
