/**
 * Ink compat test: flex (from ink/test/flex.tsx)
 */
import React from "react";
import { test, expect, beforeAll } from "vitest";
import { Box, Text } from "../../../packages/compat/src/ink";
import { renderToString, initLayoutEngine } from "./helpers/render-to-string";

beforeAll(async () => {
  await initLayoutEngine();
});

test("grow equally", () => {
  const output = renderToString(
    <Box width={6}>
      <Box flexGrow={1}>
        <Text>A</Text>
      </Box>
      <Box flexGrow={1}>
        <Text>B</Text>
      </Box>
    </Box>,
  );
  expect(output).toBe("A  B");
});

test("grow one element", () => {
  const output = renderToString(
    <Box width={6}>
      <Box flexGrow={1}>
        <Text>A</Text>
      </Box>
      <Text>B</Text>
    </Box>,
  );
  expect(output).toBe("A    B");
});

test("do not shrink", () => {
  const output = renderToString(
    <Box width={16}>
      <Box flexShrink={0} width={6}>
        <Text>A</Text>
      </Box>
      <Box flexShrink={0} width={6}>
        <Text>B</Text>
      </Box>
      <Box width={6}>
        <Text>C</Text>
      </Box>
    </Box>,
  );
  expect(output).toBe("A     B     C");
});

test("shrink equally", () => {
  const output = renderToString(
    <Box width={10}>
      <Box flexShrink={1} width={6}>
        <Text>A</Text>
      </Box>
      <Box flexShrink={1} width={6}>
        <Text>B</Text>
      </Box>
      <Text>C</Text>
    </Box>,
  );
  expect(output).toBe("A    B   C");
});

test("set flex basis with flexDirection='row' container", () => {
  const output = renderToString(
    <Box width={6}>
      <Box flexBasis={3}>
        <Text>A</Text>
      </Box>
      <Text>B</Text>
    </Box>,
  );
  expect(output).toBe("A  B");
});

test("set flex basis in percent with flexDirection='row' container", () => {
  const output = renderToString(
    <Box width={6}>
      <Box flexBasis="50%">
        <Text>A</Text>
      </Box>
      <Text>B</Text>
    </Box>,
  );
  expect(output).toBe("A  B");
});

test("set flex basis with flexDirection='column' container", () => {
  const output = renderToString(
    <Box height={6} flexDirection="column">
      <Box flexBasis={3}>
        <Text>A</Text>
      </Box>
      <Text>B</Text>
    </Box>,
  );
  expect(output).toBe("A\n\n\nB\n\n");
});

test("set flex basis in percent with flexDirection='column' container", () => {
  const output = renderToString(
    <Box height={6} flexDirection="column">
      <Box flexBasis="50%">
        <Text>A</Text>
      </Box>
      <Text>B</Text>
    </Box>,
  );
  expect(output).toBe("A\n\n\nB\n\n");
});
