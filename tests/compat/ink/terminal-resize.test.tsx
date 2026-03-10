/**
 * Ink compat test: useWindowSize fallback (from ink/test/terminal-resize.tsx)
 *
 * Tests that useWindowSize falls back to LINES env var when stdout.rows is missing.
 */
import React from "react";
import { test, expect, beforeAll } from "vitest";
import { Box, Text, render, useWindowSize } from "../../../packages/compat/src/ink";
import createStdout from "./helpers/create-stdout";
import { initLayoutEngine } from "./helpers/render-to-string";

beforeAll(async () => {
  await initLayoutEngine();
});

test("useWindowSize returns render-provided dimensions (not env vars)", async () => {
  // silvery's useWindowSize reads from the store initialized by render(),
  // not from env vars. When stdout.rows is missing, the render() call
  // falls back to 24 (the default), not LINES env var.
  const stdout = createStdout(0);
  let capturedRows = -1;

  function Test() {
    const { rows } = useWindowSize();
    capturedRows = rows;
    return <Text>{rows}</Text>;
  }

  const { waitUntilRenderFlush, unmount } = render(<Test />, { stdout });
  await waitUntilRenderFlush();

  // Default rows when stdout.rows is undefined
  expect(capturedRows).toBe(24);
  unmount();
});
