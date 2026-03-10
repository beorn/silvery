/**
 * Ink compat test: text (from ink/test/text.tsx)
 * Tests Text component styling, color, and ANSI handling
 */
import React from "react";
import { test, expect, beforeAll } from "vitest";
import chalk from "chalk";
import { stripAnsi } from "../../../packages/term/src/ansi/utils";
import { Box, Text } from "../../../packages/compat/src/ink";
import { renderToString, renderToStringAsync, initLayoutEngine } from "./helpers/render-to-string";

beforeAll(async () => {
  await initLayoutEngine();
  chalk.level = 3;
});

const renderText = (text: string): string =>
  renderToString(
    <Box>
      <Text>{text}</Text>
    </Box>,
  );

test("<Text> with undefined children", () => {
  const output = renderToString(<Text />);
  expect(output).toBe("");
});

test("<Text> with null children", () => {
  const output = renderToString(<Text>{null}</Text>);
  expect(output).toBe("");
});

test("text with standard color", () => {
  const output = renderToString(<Text color="green">Test</Text>);
  expect(output).toBe(chalk.green("Test"));
});

test("text with dim+bold", () => {
  const output = renderToString(
    <Text dimColor bold>
      Test
    </Text>,
  );
  expect(stripAnsi(output)).toBe("Test");
  expect(output).not.toBe("Test"); // Ensure ANSI codes are present
});

test("text with dimmed color", () => {
  const output = renderToString(
    <Text dimColor color="green">
      Test
    </Text>,
  );
  expect(output).toBe(chalk.green.dim("Test"));
});

test("text with hex color", () => {
  const output = renderToString(<Text color="#FF8800">Test</Text>);
  expect(output).toBe(chalk.hex("#FF8800")("Test"));
});

test("text with rgb color", () => {
  const output = renderToString(<Text color="rgb(255, 136, 0)">Test</Text>);
  expect(output).toBe(chalk.rgb(255, 136, 0)("Test"));
});

test("text with ansi256 color", () => {
  const output = renderToString(<Text color="ansi256(194)">Test</Text>);
  expect(output).toBe(chalk.ansi256(194)("Test"));
});

test("text with standard background color", () => {
  const output = renderToString(<Text backgroundColor="green">Test</Text>);
  expect(output).toBe(chalk.bgGreen("Test"));
});

test("text with hex background color", () => {
  const output = renderToString(<Text backgroundColor="#FF8800">Test</Text>);
  expect(output).toBe(chalk.bgHex("#FF8800")("Test"));
});

test("text with rgb background color", () => {
  const output = renderToString(<Text backgroundColor="rgb(255, 136, 0)">Test</Text>);
  expect(output).toBe(chalk.bgRgb(255, 136, 0)("Test"));
});

test("text with ansi256 background color", () => {
  const output = renderToString(<Text backgroundColor="ansi256(194)">Test</Text>);
  expect(output).toBe(chalk.bgAnsi256(194)("Test"));
});

test("text with inversion", () => {
  const output = renderToString(<Text inverse>Test</Text>);
  expect(output).toBe(chalk.inverse("Test"));
});

test("text with content 'constructor' wraps correctly", () => {
  const output = renderToString(<Text>constructor</Text>);
  expect(output).toBe("constructor");
});

test("strip ANSI cursor movement sequences from text", () => {
  const input = "\u001B[1A\u001B[2KStarting client ... \u001B[32mdone\u001B[0m\u001B[1B";
  const output = renderToString(
    <Box>
      <Text>{input}</Text>
    </Box>,
  );
  expect(output.includes("\u001B[1A")).toBe(false);
  expect(output.includes("\u001B[2K")).toBe(false);
  expect(output.includes("\u001B[1B")).toBe(false);
  expect(stripAnsi(output)).toBe("Starting client ... done");
});

test("strip ANSI cursor position and erase sequences from text", () => {
  const output = renderToString(
    <Box>
      <Text>{"Hello\u001B[5;10HWorld\u001B[2J!"}</Text>
    </Box>,
  );
  expect(output.includes("\u001B[5;10H")).toBe(false);
  expect(output.includes("\u001B[2J")).toBe(false);
  expect(stripAnsi(output)).toBe("HelloWorld!");
});

test("preserve SGR color sequences in text", () => {
  const output = renderToString(
    <Box>
      <Text>{"\u001B[32mgreen\u001B[0m normal"}</Text>
    </Box>,
  );
  expect(output.includes("\u001B[")).toBe(true);
  expect(stripAnsi(output)).toBe("green normal");
});

// Async tests
test("<Text> with undefined children - async", async () => {
  const output = await renderToStringAsync(<Text />);
  expect(output).toBe("");
});

test("<Text> with null children - async", async () => {
  const output = await renderToStringAsync(<Text>{null}</Text>);
  expect(output).toBe("");
});

test("text with standard color - async", async () => {
  const output = await renderToStringAsync(<Text color="green">Test</Text>);
  expect(output).toBe(chalk.green("Test"));
});

test("text with hex color - async", async () => {
  const output = await renderToStringAsync(<Text color="#FF8800">Test</Text>);
  expect(output).toBe(chalk.hex("#FF8800")("Test"));
});

test("text with inversion - async", async () => {
  const output = await renderToStringAsync(<Text inverse>Test</Text>);
  expect(output).toBe(chalk.inverse("Test"));
});
