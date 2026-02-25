import { describe, expect, test } from "vitest"
import { createRenderer } from "inkx/testing"
import React from "react"

const { Box, Text } = await import("../src/index.js")

describe("debug wrap height", () => {
  test("card bounding box - no overflow", () => {
    const render = createRenderer({ cols: 80, rows: 10 })
    const app = render(
      <Box flexDirection="column" width={37}>
        <Box flexDirection="column" flexShrink={0} width={37} borderStyle="round" paddingRight={1} testID="card">
          <Box flexDirection="row" alignItems="flex-start">
            <Box width={3} flexShrink={0}>
              <Text>{"·  "}</Text>
            </Box>
            <Box flexGrow={1} flexShrink={1}>
              <Text wrap="wrap">AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH IIII JJJJ KKKK LLLL</Text>
            </Box>
          </Box>
        </Box>
      </Box>,
    )

    const box = app.getByTestId("card").boundingBox()
    // Card should be: top border (1) + 2 lines of text + bottom border (1) = 4
    expect(box?.height).toBe(4)
  })

  test("card bounding box - with overflow=scroll", () => {
    const render = createRenderer({ cols: 80, rows: 10 })
    const app = render(
      <Box flexDirection="column" width={37}>
        <Box flexDirection="column" height={8} overflow="scroll">
          <Box flexDirection="column" flexShrink={0} width={37} borderStyle="round" paddingRight={1} testID="card">
            <Box flexDirection="row" alignItems="flex-start">
              <Box width={3} flexShrink={0}>
                <Text>{"·  "}</Text>
              </Box>
              <Box flexGrow={1} flexShrink={1}>
                <Text wrap="wrap">AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH IIII JJJJ KKKK LLLL</Text>
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>,
    )

    const box = app.getByTestId("card").boundingBox()
    // Card should be: top border (1) + 2 lines of text + bottom border (1) = 4
    // BUG: this returns 3 instead of 4
    expect(box?.height).toBe(4)
  })
})
