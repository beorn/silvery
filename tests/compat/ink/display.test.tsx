/**
 * Ink compat test: display (from ink/test/display.tsx)
 */
import React from "react";
import { test, expect, beforeAll } from "vitest";
import { Box, Text } from "../../../packages/compat/src/ink";
import { renderToString, renderToStringAsync, initLayoutEngine } from "./helpers/render-to-string";

beforeAll(async () => {
  await initLayoutEngine();
});

test("display flex", () => {
  const output = renderToString(
    <Box display="flex">
      <Text>X</Text>
    </Box>,
  );
  expect(output).toBe("X");
});

test("display none", () => {
  const output = renderToString(
    <Box flexDirection="column">
      <Box display="none">
        <Text>Kitty!</Text>
      </Box>
      <Text>Doggo</Text>
    </Box>,
  );
  expect(output).toBe("Doggo");
});

test("display flex - async", async () => {
  const output = await renderToStringAsync(
    <Box display="flex">
      <Text>X</Text>
    </Box>,
  );
  expect(output).toBe("X");
});

test("display none - async", async () => {
  const output = await renderToStringAsync(
    <Box flexDirection="column">
      <Box display="none">
        <Text>Kitty!</Text>
      </Box>
      <Text>Doggo</Text>
    </Box>,
  );
  expect(output).toBe("Doggo");
});
