/**
 * Ink compat test: width-height (from ink/test/width-height.tsx)
 * Skips tests that use Ink's render() with {stdout, debug} options (incompatible API)
 */
import React from "react";
import { test, expect, beforeAll } from "vitest";
import { Box, Text } from "../../../packages/compat/src/ink";
import { renderToString, renderToStringAsync, initLayoutEngine } from "./helpers/render-to-string";

beforeAll(async () => {
  await initLayoutEngine();
});

test("set width", () => {
  const output = renderToString(
    <Box>
      <Box width={5}>
        <Text>A</Text>
      </Box>
      <Text>B</Text>
    </Box>,
  );
  expect(output).toBe("A    B");
});

test("set width in percent", () => {
  const output = renderToString(
    <Box width={10}>
      <Box width="50%">
        <Text>A</Text>
      </Box>
      <Text>B</Text>
    </Box>,
  );
  expect(output).toBe("A    B");
});

test("set min width", () => {
  const smallerOutput = renderToString(
    <Box>
      <Box minWidth={5}>
        <Text>A</Text>
      </Box>
      <Text>B</Text>
    </Box>,
  );
  expect(smallerOutput).toBe("A    B");

  const largerOutput = renderToString(
    <Box>
      <Box minWidth={2}>
        <Text>AAAAA</Text>
      </Box>
      <Text>B</Text>
    </Box>,
  );
  expect(largerOutput).toBe("AAAAAB");
});

test("set height", () => {
  const output = renderToString(
    <Box height={4}>
      <Text>A</Text>
      <Text>B</Text>
    </Box>,
  );
  expect(output).toBe("AB\n\n\n");
});

test("set height in percent", () => {
  const output = renderToString(
    <Box height={6} flexDirection="column">
      <Box height="50%">
        <Text>A</Text>
      </Box>
      <Text>B</Text>
    </Box>,
  );
  expect(output).toBe("A\n\n\nB\n\n");
});

test("cut text over the set height", () => {
  const output = renderToString(
    <Box height={2}>
      <Text>AAAABBBBCCCC</Text>
    </Box>,
    { columns: 4 },
  );
  expect(output).toBe("AAAA\nBBBB");
});

test("set min height", () => {
  const smallerOutput = renderToString(
    <Box minHeight={4}>
      <Text>A</Text>
    </Box>,
  );
  expect(smallerOutput).toBe("A\n\n\n");

  const largerOutput = renderToString(
    <Box minHeight={2}>
      <Box height={4}>
        <Text>A</Text>
      </Box>
    </Box>,
  );
  expect(largerOutput).toBe("A\n\n\n");
});

test("set min height in percent", () => {
  const output = renderToString(
    <Box height={6} flexDirection="column">
      <Box minHeight="50%">
        <Text>A</Text>
      </Box>
      <Text>B</Text>
    </Box>,
  );
  expect(output).toBe("A\n\n\nB\n\n");
});

test("set max width", () => {
  const constrainedOutput = renderToString(
    <Box>
      <Box maxWidth={3}>
        <Text>AAAAA</Text>
      </Box>
      <Text>B</Text>
    </Box>,
    { columns: 10 },
  );
  expect(constrainedOutput).toBe("AAAB\nAA");

  const unconstrainedOutput = renderToString(
    <Box>
      <Box maxWidth={10}>
        <Text>AAA</Text>
      </Box>
      <Text>B</Text>
    </Box>,
  );
  expect(unconstrainedOutput).toBe("AAAB");
});

test("set max height", () => {
  const constrainedOutput = renderToString(
    <Box maxHeight={2}>
      <Box height={4}>
        <Text>A</Text>
      </Box>
    </Box>,
  );
  expect(constrainedOutput).toBe("A\n");

  const unconstrainedOutput = renderToString(
    <Box maxHeight={4}>
      <Text>A</Text>
    </Box>,
  );
  expect(unconstrainedOutput).toBe("A");
});

test("set max height in percent", () => {
  const output = renderToString(
    <Box height={6} flexDirection="column">
      <Box maxHeight="50%">
        <Box height={6}>
          <Text>A</Text>
        </Box>
      </Box>
      <Text>B</Text>
    </Box>,
  );
  expect(output).toBe("A\n\n\nB\n\n");
});

test("set width - async", async () => {
  const output = await renderToStringAsync(
    <Box>
      <Box width={5}>
        <Text>A</Text>
      </Box>
      <Text>B</Text>
    </Box>,
  );
  expect(output).toBe("A    B");
});

test("set height - async", async () => {
  const output = await renderToStringAsync(
    <Box height={4}>
      <Text>A</Text>
      <Text>B</Text>
    </Box>,
  );
  expect(output).toBe("AB\n\n\n");
});
