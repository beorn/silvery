/**
 * Ink compat test: background (from ink/test/background.tsx)
 */
import React from "react"
import { test, expect, beforeAll } from "vitest"
import chalk from "chalk"
import { Box, Text } from "../../../packages/compat/src/ink"
import {
  renderToString,
  initLayoutEngine,
  enableTestColors,
  disableTestColors,
} from "./helpers/render-to-string"

const ansi = {
  bgRed: "\u001B[41m",
  bgGreen: "\u001B[42m",
  bgYellow: "\u001B[43m",
  bgBlue: "\u001B[44m",
  bgReset: "\u001B[49m",
} as const

beforeAll(async () => {
  await initLayoutEngine()
  enableTestColors()

  return () => {
    disableTestColors()
  }
})

test("Text inherits parent Box background color", () => {
  const output = renderToString(
    <Box backgroundColor="green" alignSelf="flex-start">
      <Text>Hello World</Text>
    </Box>,
  )
  expect(output).toBe(chalk.bgGreen("Hello World"))
})

test("Text explicit background color overrides inherited", () => {
  const output = renderToString(
    <Box backgroundColor="red" alignSelf="flex-start">
      <Text backgroundColor="blue">Hello World</Text>
    </Box>,
  )
  expect(output).toBe(chalk.bgBlue("Hello World"))
})

test("Nested Box background inheritance", () => {
  const output = renderToString(
    <Box backgroundColor="red" alignSelf="flex-start">
      <Box backgroundColor="blue">
        <Text>Hello World</Text>
      </Box>
    </Box>,
  )
  expect(output).toBe(chalk.bgBlue("Hello World"))
})

test("Text without parent Box background has no inheritance", () => {
  const output = renderToString(
    <Box alignSelf="flex-start">
      <Text>Hello World</Text>
    </Box>,
  )
  expect(output).toBe("Hello World")
})

test("Multiple Text elements inherit same background", () => {
  const output = renderToString(
    <Box backgroundColor="yellow" alignSelf="flex-start">
      <Text>Hello </Text>
      <Text>World</Text>
    </Box>,
  )
  expect(output).toBe(chalk.bgYellow("Hello World"))
})

test("Mixed text with and without background inheritance", () => {
  const output = renderToString(
    <Box backgroundColor="green" alignSelf="flex-start">
      <Text>Inherited </Text>
      <Text backgroundColor="">No BG </Text>
      <Text backgroundColor="red">Red BG</Text>
    </Box>,
  )
  expect(output).toBe(chalk.bgGreen("Inherited ") + "No BG " + chalk.bgRed("Red BG"))
})

test("Complex nested structure with background inheritance", () => {
  const output = renderToString(
    <Box backgroundColor="yellow" alignSelf="flex-start">
      <Box>
        <Text>Outer: </Text>
        <Box backgroundColor="blue">
          <Text>Inner: </Text>
          <Text backgroundColor="red">Explicit</Text>
        </Box>
      </Box>
    </Box>,
  )
  expect(output).toBe(
    `${ansi.bgYellow}Outer: ${ansi.bgBlue}Inner: ${ansi.bgRed}Explicit${ansi.bgReset}`,
  )
})

test("Text-only backgroundColor colors text content but does not fill Box width", () => {
  const output = renderToString(
    <Box width={10} alignSelf="flex-start">
      <Text backgroundColor="red">Hello World!!</Text>
    </Box>,
  )
  // Text-only bg colors just the text, not the remaining space to fill Box width
  expect(output).toBe(
    `${ansi.bgRed}Hello ${ansi.bgReset}\n${ansi.bgRed}World!!${ansi.bgReset}`,
  )
})
