/**
 * Ink compat test: margin (from ink/test/margin.tsx)
 */
import React from "react";
import { test, expect, beforeAll } from "vitest";
import { Box, Text } from "../../../packages/compat/src/ink";
import { renderToString, renderToStringAsync, initLayoutEngine } from "./helpers/render-to-string";

beforeAll(async () => {
  await initLayoutEngine();
});

test("margin", () => {
  const output = renderToString(
    <Box margin={2}>
      <Text>X</Text>
    </Box>,
  );
  expect(output).toBe("\n\n  X\n\n");
});

test("margin X", () => {
  const output = renderToString(
    <Box>
      <Box marginX={2}>
        <Text>X</Text>
      </Box>
      <Text>Y</Text>
    </Box>,
  );
  expect(output).toBe("  X  Y");
});

test("margin Y", () => {
  const output = renderToString(
    <Box marginY={2}>
      <Text>X</Text>
    </Box>,
  );
  expect(output).toBe("\n\nX\n\n");
});

test("margin top", () => {
  const output = renderToString(
    <Box marginTop={2}>
      <Text>X</Text>
    </Box>,
  );
  expect(output).toBe("\n\nX");
});

test("margin bottom", () => {
  const output = renderToString(
    <Box marginBottom={2}>
      <Text>X</Text>
    </Box>,
  );
  expect(output).toBe("X\n\n");
});

test("margin left", () => {
  const output = renderToString(
    <Box marginLeft={2}>
      <Text>X</Text>
    </Box>,
  );
  expect(output).toBe("  X");
});

test("margin right", () => {
  const output = renderToString(
    <Box>
      <Box marginRight={2}>
        <Text>X</Text>
      </Box>
      <Text>Y</Text>
    </Box>,
  );
  expect(output).toBe("X  Y");
});

test("nested margin", () => {
  const output = renderToString(
    <Box margin={2}>
      <Box margin={2}>
        <Text>X</Text>
      </Box>
    </Box>,
  );
  expect(output).toBe("\n\n\n\n    X\n\n\n\n");
});

test("margin with multiline string", () => {
  const output = renderToString(
    <Box margin={2}>
      <Text>{"A\nB"}</Text>
    </Box>,
  );
  expect(output).toBe("\n\n  A\n  B\n\n");
});

test("apply margin to text with newlines", () => {
  const output = renderToString(
    <Box margin={1}>
      <Text>Hello{"\n"}World</Text>
    </Box>,
  );
  expect(output).toBe("\n Hello\n World\n");
});

test("apply margin to wrapped text", () => {
  const output = renderToString(
    <Box margin={1} width={6}>
      <Text>Hello World</Text>
    </Box>,
  );
  expect(output).toBe("\n Hello\n World\n");
});

test("margin - async", async () => {
  const output = await renderToStringAsync(
    <Box margin={2}>
      <Text>X</Text>
    </Box>,
  );
  expect(output).toBe("\n\n  X\n\n");
});

test("nested margin - async", async () => {
  const output = await renderToStringAsync(
    <Box margin={2}>
      <Box margin={2}>
        <Text>X</Text>
      </Box>
    </Box>,
  );
  expect(output).toBe("\n\n\n\n    X\n\n\n\n");
});
