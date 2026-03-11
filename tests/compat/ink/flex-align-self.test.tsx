/**
 * Ink compat test: flex-align-self (from ink/test/flex-align-self.tsx)
 */
import React from "react"
import { test, expect, beforeAll } from "vitest"
import { Box, Text, Newline } from "../../../packages/compat/src/ink"
import { renderToString, initLayoutEngine } from "./helpers/render-to-string"

beforeAll(async () => {
  await initLayoutEngine()
})

test("row - align text to center", () => {
  const output = renderToString(
    <Box height={3}>
      <Box alignSelf="center">
        <Text>Test</Text>
      </Box>
    </Box>,
  )
  expect(output).toBe("\nTest\n")
})

test("row - align multiple text nodes to center", () => {
  const output = renderToString(
    <Box height={3}>
      <Box alignSelf="center">
        <Text>A</Text>
        <Text>B</Text>
      </Box>
    </Box>,
  )
  expect(output).toBe("\nAB\n")
})

test("row - align text to bottom", () => {
  const output = renderToString(
    <Box height={3}>
      <Box alignSelf="flex-end">
        <Text>Test</Text>
      </Box>
    </Box>,
  )
  expect(output).toBe("\n\nTest")
})

test("row - align multiple text nodes to bottom", () => {
  const output = renderToString(
    <Box height={3}>
      <Box alignSelf="flex-end">
        <Text>A</Text>
        <Text>B</Text>
      </Box>
    </Box>,
  )
  expect(output).toBe("\n\nAB")
})

test("column - align text to center", () => {
  const output = renderToString(
    <Box flexDirection="column" width={10}>
      <Box alignSelf="center">
        <Text>Test</Text>
      </Box>
    </Box>,
  )
  expect(output).toBe("   Test")
})

test("column - align text to right", () => {
  const output = renderToString(
    <Box flexDirection="column" width={10}>
      <Box alignSelf="flex-end">
        <Text>Test</Text>
      </Box>
    </Box>,
  )
  expect(output).toBe("      Test")
})

test("column - align self stretch", () => {
  const output = renderToString(
    <Box flexDirection="column" width={7}>
      <Box alignSelf="stretch" borderStyle="single">
        <Text>X</Text>
      </Box>
    </Box>,
  )
  expect(output).toBe("\u250c\u2500\u2500\u2500\u2500\u2500\u2510\n\u2502X    \u2502\n\u2514\u2500\u2500\u2500\u2500\u2500\u2518")
})

test("row - align self stretch", () => {
  const output = renderToString(
    <Box height={5}>
      <Box alignSelf="stretch" borderStyle="single">
        <Text>X</Text>
      </Box>
    </Box>,
  )
  expect(output).toBe("\u250c\u2500\u2510\n\u2502X\u2502\n\u2502 \u2502\n\u2502 \u2502\n\u2514\u2500\u2518")
})

test("row - align self baseline", () => {
  const output = renderToString(
    <Box alignItems="flex-end" height={3}>
      <Text>
        A
        <Newline />B
      </Text>
      <Box alignSelf="baseline">
        <Text>X</Text>
      </Box>
    </Box>,
  )
  // Ink upstream expects "AX\nB\n" but actual Ink output is "\nAX\nB" (rounding difference)
  expect(output).toBe("\nAX\nB")
})
