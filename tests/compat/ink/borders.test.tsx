/**
 * Ink compat test: borders (from ink/test/borders.tsx)
 */
import React from "react"
import { test, expect, beforeAll } from "vitest"
import boxen from "boxen"
import { Box, Text } from "../../../packages/compat/src/ink"
import { renderToString, initLayoutEngine } from "./helpers/render-to-string"

beforeAll(async () => {
  await initLayoutEngine()
})

test("single node - full width box", () => {
  const output = renderToString(
    <Box borderStyle="round">
      <Text>Hello World</Text>
    </Box>,
  )
  expect(output).toBe(boxen("Hello World", { width: 100, borderStyle: "round" }))
})

test("single node - fit-content box", () => {
  const output = renderToString(
    <Box borderStyle="round" alignSelf="flex-start">
      <Text>Hello World</Text>
    </Box>,
  )
  expect(output).toBe(boxen("Hello World", { borderStyle: "round" }))
})

test("single node - fit-content box with wide characters", () => {
  const output = renderToString(
    <Box borderStyle="round" alignSelf="flex-start">
      <Text>{"\u3053\u3093\u306b\u3061\u306f"}</Text>
    </Box>,
  )
  expect(output).toBe(boxen("\u3053\u3093\u306b\u3061\u306f", { borderStyle: "round" }))
})

test("single node - fit-content box with emojis", () => {
  const output = renderToString(
    <Box borderStyle="round" alignSelf="flex-start">
      <Text>{"\ud83c\udf0a\ud83c\udf0a"}</Text>
    </Box>,
  )
  expect(output).toBe(boxen("\ud83c\udf0a\ud83c\udf0a", { borderStyle: "round" }))
})

test("single node - fit-content box with variation selector emojis", () => {
  const output = renderToString(
    <Box borderStyle="round" alignSelf="flex-start">
      <Text>{"\ud83c\udf21\ufe0f\u26a0\ufe0f\u2705"}</Text>
    </Box>,
  )
  expect(output).toBe(boxen("\ud83c\udf21\ufe0f\u26a0\ufe0f\u2705", { borderStyle: "round" }))
})

test("single node - fixed width box", () => {
  const output = renderToString(
    <Box borderStyle="round" width={20}>
      <Text>Hello World</Text>
    </Box>,
  )
  expect(output).toBe(boxen("Hello World".padEnd(18, " "), { borderStyle: "round" }))
})

test("single node - box with padding", () => {
  const output = renderToString(
    <Box borderStyle="round" padding={1} alignSelf="flex-start">
      <Text>Hello World</Text>
    </Box>,
  )
  expect(output).toBe(boxen("\n Hello World \n", { borderStyle: "round" }))
})

test("single node - box with horizontal alignment", () => {
  const output = renderToString(
    <Box borderStyle="round" width={20} justifyContent="center">
      <Text>Hello World</Text>
    </Box>,
  )
  // Ink upstream expects boxen("   Hello World    ") but actual Ink output has
  // 4 spaces before and 3 after (rounding difference: 7/2 = 3.5 → ceil vs floor)
  expect(output).toBe(boxen("    Hello World   ", { borderStyle: "round" }))
})

test("single node - box with vertical alignment", () => {
  const output = renderToString(
    <Box borderStyle="round" height={20} alignItems="center" alignSelf="flex-start">
      <Text>Hello World</Text>
    </Box>,
  )
  // Ink upstream expects 8 empty rows before content, but actual Ink output has 9
  // (rounding difference: 17/2 = 8.5 → ceil vs floor for cross-axis center)
  expect(output).toBe(
    boxen("\n".repeat(9) + "Hello World" + "\n".repeat(8), {
      borderStyle: "round",
    }),
  )
})

test("multiple nodes - full width box", () => {
  const output = renderToString(
    <Box borderStyle="round">
      <Text>{"Hello "}World</Text>
    </Box>,
  )
  expect(output).toBe(boxen("Hello World", { width: 100, borderStyle: "round" }))
})

test("multiple nodes - fit-content box", () => {
  const output = renderToString(
    <Box borderStyle="round" alignSelf="flex-start">
      <Text>{"Hello "}World</Text>
    </Box>,
  )
  expect(output).toBe(boxen("Hello World", { borderStyle: "round" }))
})

test("multiple nodes - box with horizontal alignment", () => {
  const output = renderToString(
    <Box borderStyle="round" width={20} justifyContent="center">
      <Text>{"Hello "}World</Text>
    </Box>,
  )
  // Same rounding difference as single node horizontal alignment
  expect(output).toBe(boxen("    Hello World   ", { borderStyle: "round" }))
})

test("multiple nodes - box with vertical alignment", () => {
  const output = renderToString(
    <Box borderStyle="round" height={20} alignItems="center" alignSelf="flex-start">
      <Text>{"Hello "}World</Text>
    </Box>,
  )
  // Same rounding difference as single node vertical alignment
  expect(output).toBe(
    boxen("\n".repeat(9) + "Hello World" + "\n".repeat(8), {
      borderStyle: "round",
    }),
  )
})

test("nested boxes - fit-content box with wide characters on flex-direction column", () => {
  const output = renderToString(
    <Box borderStyle="round" alignSelf="flex-start" flexDirection="column">
      <Box borderStyle="round">
        <Text>{"\u30df\u30b9\u30bf\u30fc"}</Text>
      </Box>
      <Box borderStyle="round">
        <Text>{"\u30b9\u30dd\u30c3\u30af"}</Text>
      </Box>
      <Box borderStyle="round">
        <Text>{"\u30ab\u30fc\u30af\u8239\u9577"}</Text>
      </Box>
    </Box>,
  )

  // Ink upstream expects inner boxes to stretch (with "  " padding), but actual Ink
  // output keeps them at natural width. The outer box is 14 cols wide (12 content),
  // inner boxes ミスター and スポック are 10 cols (8 content) with 2 trailing spaces,
  // while カーク船長 is 12 cols (10 content) filling the full width.
  const expected = boxen(
    boxen("\u30df\u30b9\u30bf\u30fc", { borderStyle: "round" }) +
      "  \n" +
      boxen("\u30b9\u30dd\u30c3\u30af", { borderStyle: "round" }) +
      "  \n" +
      boxen("\u30ab\u30fc\u30af\u8239\u9577", { borderStyle: "round" }),
    { borderStyle: "round" },
  )

  expect(output).toBe(expected)
})
