/**
 * Ink compat test: position (from ink/test/position.tsx)
 * Skips tests that use Ink's render() with {stdout, debug} options
 */
import React from "react";
import { test, expect, beforeAll } from "vitest";
import { Box, Text } from "../../../packages/compat/src/ink";
import { renderToString, renderToStringAsync, initLayoutEngine } from "./helpers/render-to-string";

beforeAll(async () => {
  await initLayoutEngine();
});

test("absolute position with top and left offsets", () => {
  const output = renderToString(
    <Box width={5} height={3}>
      <Box position="absolute" top={1} left={2}>
        <Text>X</Text>
      </Box>
    </Box>,
  );
  expect(output).toBe("\n  X\n");
});

test("absolute position with bottom and right offsets", () => {
  const output = renderToString(
    <Box width={6} height={4}>
      <Box position="absolute" bottom={1} right={1}>
        <Text>X</Text>
      </Box>
    </Box>,
  );
  expect(output).toBe("\n\n    X\n");
});

test("absolute position with percentage offsets", () => {
  const output = renderToString(
    <Box width={6} height={4}>
      <Box position="absolute" top="50%" left="50%">
        <Text>X</Text>
      </Box>
    </Box>,
  );
  expect(output).toBe("\n\n   X\n");
});

test("absolute position with percentage bottom and right offsets", () => {
  const output = renderToString(
    <Box width={6} height={4}>
      <Box position="absolute" bottom="50%" right="50%">
        <Text>X</Text>
      </Box>
    </Box>,
  );
  expect(output).toBe("\n  X\n\n");
});

test("relative position offsets visual position while keeping flow", () => {
  const output = renderToString(
    <Box width={5}>
      <Box position="relative" left={2}>
        <Text>A</Text>
      </Box>
      <Text>B</Text>
    </Box>,
  );
  expect(output).toBe(" BA");
});

test("static position ignores offsets", () => {
  const output = renderToString(
    <Box width={5}>
      <Box position="static" left={2}>
        <Text>A</Text>
      </Box>
      <Text>B</Text>
    </Box>,
  );
  expect(output).toBe("AB");
});

test("static position ignores percentage offsets", () => {
  const output = renderToString(
    <Box width={5}>
      <Box position="static" left="50%">
        <Text>A</Text>
      </Box>
      <Text>B</Text>
    </Box>,
  );
  expect(output).toBe("AB");
});

test("absolute position - async", async () => {
  const output = await renderToStringAsync(
    <Box width={5} height={3}>
      <Box position="absolute" top={1} left={2}>
        <Text>X</Text>
      </Box>
    </Box>,
  );
  expect(output).toBe("\n  X\n");
});
