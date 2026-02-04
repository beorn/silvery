/**
 * Test that flexGrow={1} + flexGrow={0} siblings correctly recalculate
 * intrinsic width when content changes.
 *
 * Bug: When a flexGrow={0} sibling's content changes to be longer,
 * the layout cache may return stale intrinsic width, causing truncation.
 */
import { describe, expect, test } from "vitest"
import { Box, Text } from "../src/index.js"
import { createRenderer } from "../src/testing/index.js"

describe("flexGrow cache invalidation", () => {
  const render = createRenderer({ cols: 80, rows: 3 })

  function BottomBar({ viewMode }: { viewMode: string }) {
    return (
      <Box width={80} flexDirection="row">
        {/* Left side: fills remaining space */}
        <Box flexGrow={1} flexShrink={1} overflow="hidden">
          <Text>Left content</Text>
        </Box>
        {/* Right side: intrinsic width */}
        <Box flexGrow={0} flexShrink={0}>
          <Text id="right">{viewMode}</Text>
        </Box>
      </Box>
    )
  }

  test("intrinsic width updates when flexGrow={0} content changes", () => {
    // Initial render with "CARDS VIEW" (10 chars)
    const app = render(<BottomBar viewMode="CARDS VIEW" />)
    expect(app.text).toContain("CARDS VIEW")
    // Make sure right side isn't truncated (ends with W not E)
    expect(app.text.trim()).toMatch(/CARDS VIEW$/)

    // Change to longer text "COLUMNS VIEW" (12 chars)
    app.rerender(<BottomBar viewMode="COLUMNS VIEW" />)

    // The key assertion: "COLUMNS VIEW" should appear without truncation
    // Must end with "W" not "E" to prove it's not truncated
    expect(app.text).toContain("COLUMNS VIEW")
    expect(app.text.trim()).toMatch(/COLUMNS VIEW$/)
  })

  test("shorter to longer with significant difference", () => {
    // Start with short text
    const app = render(<BottomBar viewMode="A" />)
    expect(app.text.trim()).toMatch(/A$/)

    // Change to much longer text
    app.rerender(<BottomBar viewMode="MUCH LONGER TEXT HERE" />)
    expect(app.text.trim()).toMatch(/MUCH LONGER TEXT HERE$/)
  })
})
