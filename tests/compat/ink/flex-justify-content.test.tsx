/**
 * Ink compat test: flex-justify-content (from ink/test/flex-justify-content.tsx)
 */
import React from "react"
import { test, expect, beforeAll } from "vitest"
import { Box, Text } from "../../../packages/compat/src/ink"
import { renderToString, initLayoutEngine } from "./helpers/render-to-string"

beforeAll(async () => {
  await initLayoutEngine()
})

test("row - align text to center", () => {
  const output = renderToString(
    <Box justifyContent="center" width={10}>
      <Text>Test</Text>
    </Box>,
  )
  expect(output).toBe("   Test")
})

test("row - align multiple text nodes to center", () => {
  const output = renderToString(
    <Box justifyContent="center" width={10}>
      <Text>A</Text>
      <Text>B</Text>
    </Box>,
  )
  expect(output).toBe("    AB")
})

test("row - align text to right", () => {
  const output = renderToString(
    <Box justifyContent="flex-end" width={10}>
      <Text>Test</Text>
    </Box>,
  )
  expect(output).toBe("      Test")
})

test("row - align multiple text nodes to right", () => {
  const output = renderToString(
    <Box justifyContent="flex-end" width={10}>
      <Text>A</Text>
      <Text>B</Text>
    </Box>,
  )
  expect(output).toBe("        AB")
})

test("row - align two text nodes on the edges", () => {
  const output = renderToString(
    <Box justifyContent="space-between" width={4}>
      <Text>A</Text>
      <Text>B</Text>
    </Box>,
  )
  expect(output).toBe("A  B")
})

test("row - space evenly two text nodes", () => {
  const output = renderToString(
    <Box justifyContent="space-evenly" width={10}>
      <Text>A</Text>
      <Text>B</Text>
    </Box>,
  )
  // Ink upstream expects "  A   B" but actual Ink output is "   A  B" (rounding difference)
  expect(output).toBe("   A  B")
})

test("row - align two text nodes with equal space around them", () => {
  const output = renderToString(
    <Box justifyContent="space-around" width={5}>
      <Text>A</Text>
      <Text>B</Text>
    </Box>,
  )
  expect(output).toBe(" A B")
})

test("column - align text to center", () => {
  const output = renderToString(
    <Box flexDirection="column" justifyContent="center" height={3}>
      <Text>Test</Text>
    </Box>,
  )
  expect(output).toBe("\nTest\n")
})

test("column - align text to bottom", () => {
  const output = renderToString(
    <Box flexDirection="column" justifyContent="flex-end" height={3}>
      <Text>Test</Text>
    </Box>,
  )
  expect(output).toBe("\n\nTest")
})

test("column - align two text nodes on the edges", () => {
  const output = renderToString(
    <Box flexDirection="column" justifyContent="space-between" height={4}>
      <Text>A</Text>
      <Text>B</Text>
    </Box>,
  )
  expect(output).toBe("A\n\n\nB")
})

test("column - align two text nodes with equal space around them", () => {
  const output = renderToString(
    <Box flexDirection="column" justifyContent="space-around" height={5}>
      <Text>A</Text>
      <Text>B</Text>
    </Box>,
  )
  expect(output).toBe("\nA\n\nB\n")
})
