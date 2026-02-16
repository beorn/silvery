/**
 * Test: zero-height children should not produce spurious overflow indicators
 *
 * A zero-height child in a scroll container at position 0 has top=0, bottom=0.
 * The old check `cp.bottom <= visibleTop` counted it as "hidden above" since
 * 0 <= 0 is true, producing a spurious ▲1 indicator.
 *
 * Fix: skip zero-height children from hidden counts entirely.
 */
import { describe, test, expect } from "vitest"
import { createRenderer } from "inkx/testing"
import { Box, Text, VirtualList } from "inkx"
import React from "react"

describe("overflow indicator: no spurious ▲ for zero-height children", () => {
  test("zero-height child at top should not count as hidden above", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    const app = render(
      <Box flexDirection="column" height={5} overflow="scroll" scrollTo={0} overflowIndicator>
        {/* Zero-height child — should NOT count as hidden */}
        <Box height={0} flexShrink={0} />
        <Box height={1} flexShrink={0}>
          <Text>Item 0</Text>
        </Box>
        <Box height={1} flexShrink={0}>
          <Text>Item 1</Text>
        </Box>
        <Box height={1} flexShrink={0}>
          <Text>Item 2</Text>
        </Box>
        <Box height={1} flexShrink={0}>
          <Text>Item 3</Text>
        </Box>
        <Box height={1} flexShrink={0}>
          <Text>Item 4</Text>
        </Box>
        <Box height={1} flexShrink={0}>
          <Text>Item 5</Text>
        </Box>
      </Box>,
    )

    expect(app.text).toContain("Item 0") // first item visible
    expect(app.text).not.toContain("\u25b2") // no ▲ indicator
    expect(app.text).toContain("\u25bc") // ▼ for items below
  })

  test("zero-height child at bottom should not count as hidden below", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    const app = render(
      <Box flexDirection="column" height={5} overflow="scroll" scrollTo={0} overflowIndicator>
        <Box height={1} flexShrink={0}>
          <Text>Item 0</Text>
        </Box>
        <Box height={1} flexShrink={0}>
          <Text>Item 1</Text>
        </Box>
        <Box height={1} flexShrink={0}>
          <Text>Item 2</Text>
        </Box>
        <Box height={1} flexShrink={0}>
          <Text>Item 3</Text>
        </Box>
        <Box height={1} flexShrink={0}>
          <Text>Item 4</Text>
        </Box>
        {/* Zero-height trailing element */}
        <Box height={0} flexShrink={0} />
      </Box>,
    )

    // 5 items of height 1 in viewport of height 5 = all visible
    // The zero-height trailing element should NOT count as hidden below
    expect(app.text).not.toContain("\u25b2")
    expect(app.text).not.toContain("\u25bc")
  })

  test("VirtualList at scrollTo=0 has no ▲", () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const items = Array.from({ length: 20 }, (_, i) => `Item ${i}`)

    const app = render(
      <VirtualList
        items={items}
        height={5}
        itemHeight={1}
        scrollTo={0}
        overflowIndicator
        renderItem={(item, index) => <Text key={index}>{item}</Text>}
      />,
    )

    expect(app.text).toContain("Item 0")
    expect(app.text).not.toContain("\u25b2")
    expect(app.text).toContain("\u25bc")
  })

  test("VirtualList: ▲ shows correctly when scrolled, disappears when back at top", () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const items = Array.from({ length: 20 }, (_, i) => `Item ${i}`)

    function App({ scrollTo }: { scrollTo: number }) {
      return (
        <VirtualList
          items={items}
          height={5}
          itemHeight={1}
          scrollTo={scrollTo}
          overflowIndicator
          renderItem={(item, index) => <Text key={index}>{item}</Text>}
        />
      )
    }

    const app = render(<App scrollTo={0} />)
    expect(app.text).not.toContain("\u25b2")

    // Scroll to middle
    app.rerender(<App scrollTo={10} />)
    expect(app.text).toContain("\u25b2")
    expect(app.text).toContain("\u25bc")

    // Back to top
    app.rerender(<App scrollTo={0} />)
    expect(app.text).not.toContain("\u25b2")
  })
})
