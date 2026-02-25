/**
 * Test INKX_STRICT with VirtualList — reproduces garble from km board.
 *
 * VirtualList dynamically mounts/unmounts items, creating new nodes with
 * prevLayout=null that may cause doFreshRender to produce different output.
 *
 * Bug: km-inkx.garble-incremental
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { createRenderer } from "../tests/setup.js"
import React from "react"
import { Box, Text, VirtualList } from "../src/index.js"

beforeEach(() => {
  process.env.INKX_STRICT = "1"
})
afterEach(() => {
  delete process.env.INKX_STRICT
})

describe("INKX_STRICT VirtualList garble", () => {
  test("VirtualList with many items - scroll changes", () => {
    const cols = 60
    const rows = 20
    const render = createRenderer({ cols, rows })

    const items = Array.from({ length: 200 }, (_, i) => `Task ${i}: ${"description text ".repeat(2)}`)

    function Board({ scrollTo }: { scrollTo: number }) {
      return (
        <Box flexDirection="column" width={cols} height={rows}>
          <Box height={1}>
            <Text bold>Board - scrollTo: {scrollTo}</Text>
          </Box>
          <VirtualList
            items={items}
            height={rows - 1}
            itemHeight={1}
            scrollTo={scrollTo}
            renderItem={(item, i) => (
              <Box key={i} height={1}>
                <Text wrap="truncate">{item}</Text>
              </Box>
            )}
          />
        </Box>
      )
    }

    const app = render(<Board scrollTo={0} />)
    expect(app.text).toContain("Task 0")

    // Move through the list
    for (let i = 1; i <= 10; i++) {
      app.rerender(<Board scrollTo={i} />)
    }
  })

  test("two VirtualList columns side by side - cursor switch", () => {
    const cols = 120
    const rows = 30
    const render = createRenderer({ cols, rows })

    const colA = Array.from({ length: 100 }, (_, i) => `A-${i}: ${"left content ".repeat(2)}`)
    const colB = Array.from({ length: 150 }, (_, i) => `B-${i}: ${"right content ".repeat(2)}`)

    function Board({ activeCol, scrollA, scrollB }: { activeCol: number; scrollA: number; scrollB: number }) {
      return (
        <Box flexDirection="row" width={cols} height={rows}>
          <Box flexDirection="column" width={60} height={rows}>
            <Box height={1}>
              <Text bold inverse={activeCol === 0}>Column A ({colA.length})</Text>
            </Box>
            <VirtualList
              items={colA}
              height={rows - 1}
              itemHeight={2}
              scrollTo={scrollA}
              overflowIndicator
              renderItem={(item, i) => (
                <Box key={i} height={2} outlineStyle={i === scrollA ? "single" : undefined}>
                  <Text wrap="truncate">{item}</Text>
                </Box>
              )}
            />
          </Box>
          <Box flexDirection="column" width={60} height={rows}>
            <Box height={1}>
              <Text bold inverse={activeCol === 1}>Column B ({colB.length})</Text>
            </Box>
            <VirtualList
              items={colB}
              height={rows - 1}
              itemHeight={1}
              scrollTo={scrollB}
              overflowIndicator
              renderItem={(item, i) => (
                <Box key={i} height={1}>
                  <Text wrap="truncate">{item}</Text>
                </Box>
              )}
            />
          </Box>
        </Box>
      )
    }

    const app = render(<Board activeCol={0} scrollA={0} scrollB={0} />)
    expect(app.text).toContain("Column A")
    expect(app.text).toContain("Column B")

    // Navigate: down, down, right, down, left, up
    const sequence: { activeCol: number; scrollA: number; scrollB: number }[] = [
      { activeCol: 0, scrollA: 1, scrollB: 0 },  // down in A
      { activeCol: 0, scrollA: 2, scrollB: 0 },  // down in A
      { activeCol: 1, scrollA: 2, scrollB: 0 },  // switch to B
      { activeCol: 1, scrollA: 2, scrollB: 1 },  // down in B
      { activeCol: 1, scrollA: 2, scrollB: 2 },  // down in B
      { activeCol: 0, scrollA: 2, scrollB: 2 },  // switch to A
      { activeCol: 0, scrollA: 1, scrollB: 2 },  // up in A
      { activeCol: 0, scrollA: 3, scrollB: 2 },  // down in A
      { activeCol: 1, scrollA: 3, scrollB: 5 },  // switch to B + jump
    ]

    for (let i = 0; i < sequence.length; i++) {
      try {
        app.rerender(<Board {...sequence[i]!} />)
      } catch (e: any) {
        throw new Error(`Step ${i}: ${e.message}`)
      }
    }
  })

  test("VirtualList with variable height items and sticky header", () => {
    const cols = 60
    const rows = 20
    const render = createRenderer({ cols, rows })

    interface Section {
      title: string
      items: string[]
    }

    const sections: Section[] = [
      { title: "Section 1", items: Array.from({ length: 30 }, (_, i) => `S1-item ${i}`) },
      { title: "Section 2", items: Array.from({ length: 50 }, (_, i) => `S2-item ${i}`) },
      { title: "Section 3", items: Array.from({ length: 20 }, (_, i) => `S3-item ${i}`) },
    ]

    // Flatten sections into items with headers
    const flatItems: { type: "header" | "item"; text: string }[] = []
    for (const section of sections) {
      flatItems.push({ type: "header", text: section.title })
      for (const item of section.items) {
        flatItems.push({ type: "item", text: item })
      }
    }

    function SectionList({ scrollTo }: { scrollTo: number }) {
      return (
        <Box flexDirection="column" width={cols} height={rows}>
          <VirtualList
            items={flatItems}
            height={rows}
            itemHeight={(item) => (item.type === "header" ? 2 : 1)}
            scrollTo={scrollTo}
            renderItem={(item, i) =>
              item.type === "header" ? (
                <Box key={i} height={2} position="sticky" backgroundColor="blue">
                  <Text bold color="white">
                    {item.text}
                  </Text>
                </Box>
              ) : (
                <Box key={i} height={1}>
                  <Text>{item.text}</Text>
                </Box>
              )
            }
          />
        </Box>
      )
    }

    const app = render(<SectionList scrollTo={0} />)
    expect(app.text).toContain("Section 1")

    // Scroll through sections
    for (let i = 1; i <= 40; i += 3) {
      try {
        app.rerender(<SectionList scrollTo={i} />)
      } catch (e: any) {
        throw new Error(`scrollTo=${i}: ${e.message}`)
      }
    }
  })
})
