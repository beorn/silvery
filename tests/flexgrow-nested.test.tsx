/**
 * Test flexGrow with nested Text (replicating actual bottom bar structure).
 */
import { describe, expect, test } from "vitest"
import { Box, Text } from "../src/index.js"
import { createRenderer } from "inkx/testing"

describe("flexGrow nested structure", () => {
  const render = createRenderer({ cols: 80, rows: 5 })

  test("nested Text inside flexGrow={0} Box (status bar pattern)", () => {
    // Replicate exact structure from board-bottom-bar.tsx
    const app = render(
      <Box width={80} flexDirection="row">
        {/* Left side: fills remaining space, truncates overflow */}
        <Box flexGrow={1} flexShrink={1} flexDirection="row" overflow="hidden">
          <Text dimColor>MEM</Text>
          <Text dimColor>{" 📁"}</Text>
          <Text dimColor>~/some/path</Text>
        </Box>
        {/* Right side: intrinsic width, nested Text for testable IDs */}
        <Box flexGrow={0} flexShrink={0}>
          <Text dimColor>
            {" "}
            <Text>📋3</Text>
            {"   "}
            <Text>COLUMNS VIEW</Text>{" "}
          </Text>
        </Box>
      </Box>,
    )

    const text = app.text

    expect(text).toContain("COLUMNS VIEW")
    // Should not be truncated (ends with W, not E)
    expect(text).toMatch(/COLUMNS VIEW\s*$/)
  })

  test("multiple nested Text inside flexGrow={0} Box", () => {
    // More complex nesting
    const app = render(
      <Box width={80} flexDirection="row">
        <Box flexGrow={1} flexShrink={1} overflow="hidden">
          <Text>Left content</Text>
        </Box>
        <Box flexGrow={0} flexShrink={0}>
          <Text>
            {" "}
            <Text>📋21</Text>
            {"   "}
            <Text>col 1/3</Text>
            {"   "}
            <Text>COLUMNS VIEW</Text>{" "}
          </Text>
        </Box>
      </Box>,
    )

    const text = app.text

    expect(text).toContain("📋21")
    expect(text).toContain("col 1/3")
    expect(text).toContain("COLUMNS VIEW")
  })

  test("parent Box has explicit width on row direction", () => {
    // Container with explicit termWidth
    const termWidth = 80
    const app = render(
      <Box flexDirection="row" flexShrink={0} width={termWidth}>
        <Box flexGrow={1} flexShrink={1} flexDirection="row" overflow="hidden">
          <Text>Left</Text>
        </Box>
        <Box flexGrow={0} flexShrink={0}>
          <Text>
            {" "}
            <Text>📋3</Text>
            {"   "}
            <Text>COLUMNS VIEW</Text>{" "}
          </Text>
        </Box>
      </Box>,
    )

    const text = app.text

    expect(text).toContain("COLUMNS VIEW")
  })
})
