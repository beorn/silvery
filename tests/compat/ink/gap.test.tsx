/**
 * Ink compat test: gap (from ink/test/gap.tsx)
 */
import React from "react";
import { test, expect, beforeAll } from "vitest";
import { Box, Text } from "../../../packages/compat/src/ink";
import { renderToString, renderToStringAsync, initLayoutEngine } from "./helpers/render-to-string";

beforeAll(async () => {
  await initLayoutEngine();
});

test("gap", () => {
  const output = renderToString(
    <Box gap={1} width={3} flexWrap="wrap">
      <Text>A</Text>
      <Text>B</Text>
      <Text>C</Text>
    </Box>,
  );
  expect(output).toBe("A B\n\nC");
});

test("column gap", () => {
  const output = renderToString(
    <Box gap={1}>
      <Text>A</Text>
      <Text>B</Text>
    </Box>,
  );
  expect(output).toBe("A B");
});

test("row gap", () => {
  const output = renderToString(
    <Box flexDirection="column" gap={1}>
      <Text>A</Text>
      <Text>B</Text>
    </Box>,
  );
  expect(output).toBe("A\n\nB");
});

test("gap - async", async () => {
  const output = await renderToStringAsync(
    <Box gap={1} width={3} flexWrap="wrap">
      <Text>A</Text>
      <Text>B</Text>
      <Text>C</Text>
    </Box>,
  );
  expect(output).toBe("A B\n\nC");
});

test("column gap - async", async () => {
  const output = await renderToStringAsync(
    <Box gap={1}>
      <Text>A</Text>
      <Text>B</Text>
    </Box>,
  );
  expect(output).toBe("A B");
});

test("row gap - async", async () => {
  const output = await renderToStringAsync(
    <Box flexDirection="column" gap={1}>
      <Text>A</Text>
      <Text>B</Text>
    </Box>,
  );
  expect(output).toBe("A\n\nB");
});
