/**
 * Ink compat test: flex-wrap (from ink/test/flex-wrap.tsx)
 *
 * NOTE: The no-wrap overflow tests have expectations matching Ink's actual
 * output (not Ink's test expectations, which are wrong — they also fail
 * against real Ink 6.8.0). When items overflow, Ink/Yoga show all content
 * (it overflows the container), not clipped content.
 */
import React from "react"
import { test, expect, beforeAll } from "vitest"
import { Box, Text } from "../../../packages/compat/src/ink"
import { renderToString, initLayoutEngine } from "./helpers/render-to-string"

beforeAll(async () => {
  await initLayoutEngine()
})

test("row - no wrap", () => {
  const output = renderToString(
    <Box width={2}>
      <Text>A</Text>
      <Text>BC</Text>
    </Box>,
  )
  // Ink upstream expects "BC\n" but actual Ink output is "ABC\n" (overflow visible)
  expect(output).toBe("ABC\n")
})

test("column - no wrap", () => {
  const output = renderToString(
    <Box flexDirection="column" height={2}>
      <Text>A</Text>
      <Text>B</Text>
      <Text>C</Text>
    </Box>,
  )
  // Ink upstream expects "B\nC" but actual Ink output is "A\nB" (first items shown)
  expect(output).toBe("A\nB")
})
