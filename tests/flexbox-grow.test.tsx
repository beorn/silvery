/**
 * Test flexGrow behavior for status bar layouts.
 */
import { describe, expect, test } from "vitest"
import { Box, Text } from "../src/index.js"
import { createRenderer } from "inkx/testing"

describe("flexGrow layout", () => {
  const render = createRenderer({ cols: 80, rows: 5 })

  test("flexGrow={1} left + flexGrow={0} right preserves right content", () => {
    const app = render(
      <Box width={80} flexDirection="row">
        <Box flexGrow={1} flexShrink={1} overflow="hidden">
          <Text>Left side content</Text>
        </Box>
        <Box flexGrow={0} flexShrink={0}>
          <Text> Right side COLUMNS VIEW </Text>
        </Box>
      </Box>,
    )

    const text = app.text

    expect(text).toContain("Left side")
    expect(text).toContain("COLUMNS VIEW")
  })

  test("nested Text inside flexGrow={0} Box", () => {
    const app = render(
      <Box width={80} flexDirection="row">
        <Box flexGrow={1} flexShrink={1}>
          <Text>Left</Text>
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
})
