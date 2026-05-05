/**
 * Regression: Scroll offset change not dirtying render phase (km-rpv0n)
 *
 * When scrollTo prop changes on a scroll container but layout rect stays the
 * same, the render phase must re-render the scroll container's children at
 * their new positions. Without proper dirty flag propagation, the fast-path
 * skip in canSkipEntireSubtree would keep stale pixels from the cloned buffer.
 */

import React from "react"
import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { createRenderer, stripAnsi } from "@silvery/test"
import { Box, Text } from "silvery"

// Enable STRICT mode to catch incremental vs fresh render mismatches
let origStrict: string | undefined

beforeEach(() => {
  origStrict = process.env.SILVERY_STRICT
  process.env.SILVERY_STRICT = "1"
})

afterEach(() => {
  if (origStrict === undefined) {
    delete process.env.SILVERY_STRICT
  } else {
    process.env.SILVERY_STRICT = origStrict
  }
})

describe("scroll offset dirty propagation (km-rpv0n)", () => {
  test("scrollTo change updates visible content in incremental render", () => {
    const render = createRenderer({ cols: 30, rows: 12 })

    // 10 items, scroll container shows ~5
    function App({ scrollTo }: { scrollTo: number }) {
      return (
        <Box flexDirection="column" height={12}>
          <Text>Header</Text>
          <Box overflow="scroll" height={6} scrollTo={scrollTo} flexDirection="column">
            {Array.from({ length: 10 }, (_, i) => (
              <Box key={i}>
                <Text>Item {i}</Text>
              </Box>
            ))}
          </Box>
          <Text>Footer</Text>
        </Box>
      )
    }

    // Initial render with scrollTo=0
    const app = render(<App scrollTo={0} />)
    const text0 = stripAnsi(app.text)
    expect(text0).toContain("Item 0")
    expect(text0).toContain("Header")
    expect(text0).toContain("Footer")

    // Change scrollTo — should show different items
    app.rerender(<App scrollTo={8} />)
    const text1 = stripAnsi(app.text)
    // Item 8 should now be visible
    expect(text1).toContain("Item 8")
    // STRICT mode will throw if incremental doesn't match fresh
  })

  test("scrollTo change with border preserves correct rendering", () => {
    const render = createRenderer({ cols: 30, rows: 14 })

    // Scroll container with border — the "borders overwrite content" scenario
    function App({ scrollTo }: { scrollTo: number }) {
      return (
        <Box flexDirection="column" height={14}>
          <Text>Title</Text>
          <Box
            overflow="scroll"
            height={8}
            scrollTo={scrollTo}
            flexDirection="column"
            borderStyle="single"
          >
            {Array.from({ length: 15 }, (_, i) => (
              <Box key={i}>
                <Text>Row {i}</Text>
              </Box>
            ))}
          </Box>
          <Text>Status</Text>
        </Box>
      )
    }

    const app = render(<App scrollTo={0} />)
    const text0 = stripAnsi(app.text)
    expect(text0).toContain("Row 0")
    expect(text0).toContain("Title")

    // Scroll down — content should update, borders should not overwrite content
    app.rerender(<App scrollTo={10} />)
    const text1 = stripAnsi(app.text)
    expect(text1).toContain("Row 10")
    expect(text1).toContain("Title")
    expect(text1).toContain("Status")
  })

  test("scrollTo change inside nested container propagates dirty to ancestors", () => {
    const render = createRenderer({ cols: 40, rows: 14 })

    // Scroll container nested inside multiple wrapper boxes
    // This tests that subtreeDirty propagates upward through ancestors
    function App({ scrollTo }: { scrollTo: number }) {
      return (
        <Box flexDirection="column" height={14}>
          <Box flexDirection="row">
            <Box flexDirection="column" width={20}>
              <Text>Left Panel</Text>
              <Box overflow="scroll" height={8} scrollTo={scrollTo} flexDirection="column">
                {Array.from({ length: 20 }, (_, i) => (
                  <Box key={i}>
                    <Text>Entry {i}</Text>
                  </Box>
                ))}
              </Box>
            </Box>
            <Box flexDirection="column" width={20}>
              <Text>Right Panel</Text>
            </Box>
          </Box>
        </Box>
      )
    }

    const app = render(<App scrollTo={0} />)
    expect(stripAnsi(app.text)).toContain("Entry 0")

    // Scroll down - must update even though wrapper boxes have no dirty flags
    app.rerender(<App scrollTo={15} />)
    const text = stripAnsi(app.text)
    expect(text).toContain("Entry 15")
    expect(text).toContain("Left Panel")
    expect(text).toContain("Right Panel")
  })

  test("scrollOffset prop change updates visible content", () => {
    const render = createRenderer({ cols: 30, rows: 10 })

    // Use scrollOffset (explicit offset) instead of scrollTo
    function App({ offset }: { offset: number }) {
      return (
        <Box flexDirection="column" height={10}>
          <Text>Top</Text>
          <Box overflow="scroll" height={5} scrollOffset={offset} flexDirection="column">
            {Array.from({ length: 20 }, (_, i) => (
              <Box key={i}>
                <Text>Line {i}</Text>
              </Box>
            ))}
          </Box>
          <Text>Bottom</Text>
        </Box>
      )
    }

    const app = render(<App offset={0} />)
    expect(stripAnsi(app.text)).toContain("Line 0")

    // Change explicit scroll offset
    app.rerender(<App offset={10} />)
    const text = stripAnsi(app.text)
    expect(text).toContain("Line 10")
    expect(text).toContain("Top")
    expect(text).toContain("Bottom")
  })

  test("fractional scrollOffset is normalized to a terminal row", () => {
    const render = createRenderer({ cols: 30, rows: 10 })

    function App({ offset }: { offset: number }) {
      return (
        <Box flexDirection="column" height={10}>
          <Text>Top</Text>
          <Box overflow="scroll" height={5} scrollOffset={offset} flexDirection="column">
            {Array.from({ length: 20 }, (_, i) => (
              <Box key={i}>
                <Text>Line {i}</Text>
              </Box>
            ))}
          </Box>
          <Text>Bottom</Text>
        </Box>
      )
    }

    const app = render(<App offset={2.6} />)
    const text = stripAnsi(app.text)
    expect(text).toContain("Line 3")
    expect(text).not.toContain("Line 2")
    expect(text).toContain("Top")
    expect(text).toContain("Bottom")
  })

  test("scroll offset change with backgroundColor triggers correct repaint", () => {
    const render = createRenderer({ cols: 30, rows: 10 })

    // Scroll container with bg color — tests bgRefillNeeded interaction
    function App({ scrollTo }: { scrollTo: number }) {
      return (
        <Box flexDirection="column" height={10}>
          <Box
            overflow="scroll"
            height={6}
            scrollTo={scrollTo}
            flexDirection="column"
            backgroundColor="blue"
          >
            {Array.from({ length: 15 }, (_, i) => (
              <Box key={i}>
                <Text>Item {i}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      )
    }

    const app = render(<App scrollTo={0} />)
    expect(stripAnsi(app.text)).toContain("Item 0")

    app.rerender(<App scrollTo={10} />)
    expect(stripAnsi(app.text)).toContain("Item 10")
  })

  test("needsOwnRepaint false when only scroll offset changes (no border redraw)", () => {
    const render = createRenderer({ cols: 30, rows: 10 })

    // Border should NOT be redrawn when only scroll offset changes
    // (needsOwnRepaint should be false, preventing border from overwriting content)
    function App({ scrollTo }: { scrollTo: number }) {
      return (
        <Box
          overflow="scroll"
          height={8}
          scrollTo={scrollTo}
          flexDirection="column"
          borderStyle="round"
          borderColor="green"
        >
          {Array.from({ length: 20 }, (_, i) => (
            <Box key={i}>
              <Text>{`>>> Item ${i} <<<`}</Text>
            </Box>
          ))}
        </Box>
      )
    }

    const app = render(<App scrollTo={0} />)
    const text0 = stripAnsi(app.text)
    expect(text0).toContain("Item 0")

    // Scroll — content changes but border stays same. STRICT verifies
    // incremental matches fresh, catching any border-overwrites-content bugs.
    app.rerender(<App scrollTo={15} />)
    const text1 = stripAnsi(app.text)
    expect(text1).toContain("Item 15")
    expect(text1).not.toContain("Item 0")
  })
})
