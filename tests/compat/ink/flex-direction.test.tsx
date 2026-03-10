/**
 * Ink compat test: flex-direction (from ink/test/flex-direction.tsx)
 */
import React from "react";
import { test, expect, beforeAll } from "vitest";
import { Box, Text } from "../../../packages/compat/src/ink";
import { renderToString, renderToStringAsync, initLayoutEngine } from "./helpers/render-to-string";

beforeAll(async () => {
  await initLayoutEngine();
});

test("direction row", () => {
  const output = renderToString(
    <Box flexDirection="row">
      <Text>A</Text>
      <Text>B</Text>
    </Box>,
  );
  expect(output).toBe("AB");
});

test("direction row reverse", () => {
  const output = renderToString(
    <Box flexDirection="row-reverse" width={4}>
      <Text>A</Text>
      <Text>B</Text>
    </Box>,
  );
  expect(output).toBe("  BA");
});

test("direction column", () => {
  const output = renderToString(
    <Box flexDirection="column">
      <Text>A</Text>
      <Text>B</Text>
    </Box>,
  );
  expect(output).toBe("A\nB");
});

test("direction column reverse", () => {
  const output = renderToString(
    <Box flexDirection="column-reverse" height={4}>
      <Text>A</Text>
      <Text>B</Text>
    </Box>,
  );
  expect(output).toBe("\n\nB\nA");
});

test("don't squash text nodes when column direction is applied", () => {
  const output = renderToString(
    <Box flexDirection="column">
      <Text>A</Text>
      <Text>B</Text>
    </Box>,
  );
  expect(output).toBe("A\nB");
});

test("direction row - async", async () => {
  const output = await renderToStringAsync(
    <Box flexDirection="row">
      <Text>A</Text>
      <Text>B</Text>
    </Box>,
  );
  expect(output).toBe("AB");
});

test("direction column - async", async () => {
  const output = await renderToStringAsync(
    <Box flexDirection="column">
      <Text>A</Text>
      <Text>B</Text>
    </Box>,
  );
  expect(output).toBe("A\nB");
});
