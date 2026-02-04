/**
 * Exact replication of the km-tui bottom bar structure that fails.
 */
import { describe, expect, test } from "vitest"
import { Box, Text } from "../src/index.js"
import { createRenderer } from "../src/testing/index.js"

describe("flexGrow exact replication", () => {
  const render = createRenderer({ cols: 80, rows: 1 })

  test("CARDS VIEW fits (shorter text)", () => {
    const viewModeStr = "CARDS VIEW"
    const nodeCount = 3

    const app = render(
      <Box flexDirection="row" flexShrink={0} width={80}>
        <Box flexGrow={1} flexShrink={1} flexDirection="row" overflow="hidden">
          <Text dimColor>MEM</Text>
          <Text dimColor>{" 📁"}</Text>
        </Box>
        <Box flexGrow={0} flexShrink={0}>
          <Text dimColor>
            {" "}
            <Text>📋{nodeCount}</Text>
            {"   "}
            <Text>{viewModeStr}</Text>{" "}
          </Text>
        </Box>
      </Box>,
    )

    const text = app.text

    expect(text).toContain("CARDS VIEW")
  })

  test("COLUMNS VIEW truncates (longer text)", () => {
    const viewModeStr = "COLUMNS VIEW"
    const nodeCount = 3

    const app = render(
      <Box flexDirection="row" flexShrink={0} width={80}>
        <Box flexGrow={1} flexShrink={1} flexDirection="row" overflow="hidden">
          <Text dimColor>MEM</Text>
          <Text dimColor>{" 📁"}</Text>
        </Box>
        <Box flexGrow={0} flexShrink={0}>
          <Text dimColor>
            {" "}
            <Text>📋{nodeCount}</Text>
            {"   "}
            <Text>{viewModeStr}</Text>{" "}
          </Text>
        </Box>
      </Box>,
    )

    const text = app.text

    // This should NOT truncate
    expect(text).toContain("COLUMNS VIEW")
  })

  test("without nested Text - simpler structure", () => {
    const app = render(
      <Box flexDirection="row" flexShrink={0} width={80}>
        <Box flexGrow={1} flexShrink={1} overflow="hidden">
          <Text>MEM 📁</Text>
        </Box>
        <Box flexGrow={0} flexShrink={0}>
          <Text> 📋3 COLUMNS VIEW </Text>
        </Box>
      </Box>,
    )

    const text = app.text

    expect(text).toContain("COLUMNS VIEW")
  })
})
