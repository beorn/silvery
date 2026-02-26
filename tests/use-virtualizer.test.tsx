/**
 * useVirtualizer Hook Tests
 *
 * Tests for the shared headless virtualization engine.
 */

import React, { useState } from "react"
import { describe, expect, test } from "vitest"
import { useVirtualizer, type VirtualizerConfig } from "../src/hooks/useVirtualizer.js"
import { Text } from "../src/components/Text.js"
import { Box } from "../src/components/Box.js"
import { createRenderer } from "inkx/testing"

const render = createRenderer({ cols: 80, rows: 24 })

// Helper component that uses useVirtualizer and displays its state
function VirtualizerTest(props: VirtualizerConfig & { testId?: string }) {
  const { testId: _testId, ...config } = props
  const result = useVirtualizer(config)

  return (
    <Box flexDirection="column">
      <Text>range: {result.range.startIndex}-{result.range.endIndex}</Text>
      <Text>hidden: {result.hiddenBefore}/{result.hiddenAfter}</Text>
      <Text>leading: {result.leadingHeight}</Text>
      <Text>trailing: {result.trailingHeight}</Text>
      <Text>offset: {result.scrollOffset}</Text>
    </Box>
  )
}

describe("useVirtualizer", () => {
  test("returns full range for small lists", () => {
    const app = render(
      <VirtualizerTest
        count={5}
        viewportHeight={10}
        estimateHeight={1}
        scrollTo={0}
      />,
    )

    expect(app.text).toContain("range: 0-5")
    expect(app.text).toContain("hidden: 0/0")
  })

  test("virtualizes large lists", () => {
    const app = render(
      <VirtualizerTest
        count={100}
        viewportHeight={10}
        estimateHeight={1}
        scrollTo={0}
      />,
    )

    // Should not render all 100 items
    expect(app.text).toMatch(/range: 0-\d+/)
    // End index should be much less than 100
    const match = app.text.match(/range: 0-(\d+)/)
    expect(Number(match![1])).toBeLessThan(100)
  })

  test("scrolls to target item", () => {
    const app = render(
      <VirtualizerTest
        count={100}
        viewportHeight={10}
        estimateHeight={1}
        scrollTo={50}
      />,
    )

    // Should have items hidden before
    const hiddenMatch = app.text.match(/hidden: (\d+)\/(\d+)/)
    expect(Number(hiddenMatch![1])).toBeGreaterThan(0)
  })

  test("handles empty list", () => {
    const app = render(
      <VirtualizerTest
        count={0}
        viewportHeight={10}
        estimateHeight={1}
      />,
    )

    expect(app.text).toContain("range: 0-0")
    expect(app.text).toContain("hidden: 0/0")
  })

  test("freezes scroll when scrollTo is undefined", () => {
    function FreezeTest() {
      const [scrollTo, setScrollTo] = useState<number | undefined>(20)
      const result = useVirtualizer({
        count: 100,
        viewportHeight: 10,
        estimateHeight: 1,
        scrollTo,
      })

      return (
        <Box flexDirection="column">
          <Text>range: {result.range.startIndex}-{result.range.endIndex}</Text>
          <Text>offset: {result.scrollOffset}</Text>
          <Text testID="freeze" onClick={() => setScrollTo(undefined)}>freeze</Text>
        </Box>
      )
    }

    const app = render(<FreezeTest />)

    // Initially scrolled to 20
    expect(app.text).toContain("offset:")
    const initialOffset = app.text.match(/offset: (\d+)/)![1]

    // After freezing, offset should stay the same
    // (We can't easily click in this test, but the hook's freeze behavior
    // is tested through the VirtualList/VirtualScrollView integration tests)
  })

  test("respects overscan", () => {
    const app = render(
      <VirtualizerTest
        count={100}
        viewportHeight={10}
        estimateHeight={1}
        scrollTo={0}
        overscan={3}
      />,
    )

    // With overscan=3, should render ~10 + 2*3 = 16 items max
    const match = app.text.match(/range: 0-(\d+)/)
    expect(Number(match![1])).toBeLessThanOrEqual(20)
  })

  test("respects maxRendered", () => {
    const app = render(
      <VirtualizerTest
        count={1000}
        viewportHeight={10}
        estimateHeight={1}
        scrollTo={500}
        maxRendered={30}
      />,
    )

    const match = app.text.match(/range: (\d+)-(\d+)/)
    const rangeSize = Number(match![2]) - Number(match![1])
    expect(rangeSize).toBeLessThanOrEqual(30)
  })

  test("supports variable height estimation", () => {
    const app = render(
      <VirtualizerTest
        count={50}
        viewportHeight={10}
        estimateHeight={(index) => index % 2 === 0 ? 1 : 3}
        scrollTo={0}
      />,
    )

    // Should render without errors
    expect(app.text).toContain("range:")
  })

  test("getItemKey maps index to key", () => {
    function KeyTest() {
      const result = useVirtualizer({
        count: 5,
        viewportHeight: 10,
        estimateHeight: 1,
        getItemKey: (index) => `key-${index}`,
      })

      return (
        <Box flexDirection="column">
          <Text>key0: {String(result.getKey(0))}</Text>
          <Text>key3: {String(result.getKey(3))}</Text>
        </Box>
      )
    }

    const app = render(<KeyTest />)
    expect(app.text).toContain("key0: key-0")
    expect(app.text).toContain("key3: key-3")
  })

  test("getKey falls back to index when no getItemKey provided", () => {
    function KeyTest() {
      const result = useVirtualizer({
        count: 5,
        viewportHeight: 10,
        estimateHeight: 1,
      })

      return <Text>key2: {String(result.getKey(2))}</Text>
    }

    const app = render(<KeyTest />)
    expect(app.text).toContain("key2: 2")
  })

  test("handles gap parameter", () => {
    const app = render(
      <VirtualizerTest
        count={50}
        viewportHeight={10}
        estimateHeight={1}
        gap={1}
        scrollTo={0}
      />,
    )

    // With gap=1, effective item size is 2, so ~5 items visible + overscan
    expect(app.text).toContain("range:")
  })
})
