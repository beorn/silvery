/**
 * Tests for Ink-compatible useCursor hook.
 *
 * Verifies that the compat useCursor bridges correctly to silvery's
 * cursor system: positioning, show/hide sequences, and unmount cleanup.
 */
import React, { useState } from "react";
import { describe, test, expect, beforeAll } from "vitest";
import { Box, Text, render, useInput, useCursor } from "../../packages/compat/src/ink";
import createStdout from "../compat/ink/helpers/create-stdout";
import { createStdin, emitReadable } from "../compat/ink/helpers/create-stdin";
import { isLayoutEngineInitialized, setLayoutEngine } from "@silvery/term/layout-engine";
import { createFlexilyZeroEngine } from "@silvery/term/adapters/flexily-zero-adapter";

const showCursorEscape = "\x1b[?25h";
const hideCursorEscape = "\x1b[?25l";

/** Wait for async renders to settle */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeAll(() => {
  if (!isLayoutEngineInitialized()) {
    setLayoutEngine(createFlexilyZeroEngine());
  }
});

function InputApp() {
  const [text, setText] = useState("");
  const { setCursorPosition } = useCursor();

  useInput((input, key) => {
    if (key.backspace || key.delete) {
      setText((prev) => prev.slice(0, -1));
      return;
    }

    if (!key.ctrl && !key.meta && input) {
      setText((prev) => prev + input);
    }
  });

  setCursorPosition({ x: 2 + text.length, y: 0 });

  return (
    <Box>
      <Text>{`> ${text}`}</Text>
    </Box>
  );
}

describe("cursor-compat", () => {
  test("cursor is shown after render", async () => {
    const stdout = createStdout();
    const stdin = createStdin();

    const { unmount } = render(<InputApp />, { stdout, stdin });
    await delay(50);

    const output = stdout.getWrites().join("");
    expect(output).toContain(showCursorEscape);
    unmount();
  });

  test("cursor is positioned at setCursorPosition x offset", async () => {
    const stdout = createStdout();
    const stdin = createStdin();

    const { unmount } = render(<InputApp />, { stdout, stdin });
    await delay(50);

    const output = stdout.getWrites().join("");
    // Cursor at x=2 → ESC[3G (1-indexed)
    expect(output).toContain("\x1b[3G");
    unmount();
  });

  test("last cursor visibility escape is show, not hide", async () => {
    const stdout = createStdout();
    const stdin = createStdin();

    const { unmount } = render(<InputApp />, { stdout, stdin });
    await delay(50);

    const output = stdout.getWrites().join("");
    const lastShowIndex = output.lastIndexOf(showCursorEscape);
    const lastHideIndex = output.lastIndexOf(hideCursorEscape);

    expect(lastShowIndex).toBeGreaterThan(lastHideIndex);
    unmount();
  });

  test("cursor follows text input", async () => {
    const stdout = createStdout();
    const stdin = createStdin();

    const { unmount } = render(<InputApp />, { stdout, stdin });
    await delay(50);

    emitReadable(stdin, "a");
    await delay(50);

    const output = stdout.getWrites().join("");
    // After typing 'a', cursor should be at x=3 → ESC[4G (1-indexed)
    expect(output).toContain("\x1b[4G");
    expect(output).toContain(showCursorEscape);
    unmount();
  });

  test("cursor is hidden when component using useCursor unmounts", async () => {
    const stdout = createStdout();
    const stdin = createStdin();

    function CursorChild() {
      const { setCursorPosition } = useCursor();
      setCursorPosition({ x: 5, y: 0 });
      return <Text>child</Text>;
    }

    function Parent() {
      const [showChild, setShowChild] = useState(true);

      useInput((_input, key) => {
        if (key.return) {
          setShowChild(false);
        }
      });

      return <Box>{showChild ? <CursorChild /> : <Text>no cursor</Text>}</Box>;
    }

    const { unmount } = render(<Parent />, { stdout, stdin });
    await delay(50);

    // Initially cursor should be visible
    const initialOutput = stdout.getWrites().join("");
    expect(initialOutput).toContain(showCursorEscape);

    const writesBeforeEnter = stdout.getWrites().length;

    // Unmount the child by pressing Enter
    emitReadable(stdin, "\r");
    await delay(50);

    // After child unmounts, cursor should be hidden
    const writesAfterUnmount = stdout.getWrites().slice(writesBeforeEnter);
    const outputAfterUnmount = writesAfterUnmount.join("");

    const lastShowIndex = outputAfterUnmount.lastIndexOf(showCursorEscape);
    const lastHideIndex = outputAfterUnmount.lastIndexOf(hideCursorEscape);

    expect(lastHideIndex).toBeGreaterThan(lastShowIndex);
    unmount();
  });

  test("cursor at x=0 uses bare ESC[G", async () => {
    const stdout = createStdout();
    const stdin = createStdin();

    function ZeroCursorApp() {
      const { setCursorPosition } = useCursor();
      setCursorPosition({ x: 0, y: 0 });
      return (
        <Box>
          <Text>hello</Text>
        </Box>
      );
    }

    const { unmount } = render(<ZeroCursorApp />, { stdout, stdin });
    await delay(50);

    const output = stdout.getWrites().join("");
    expect(output).toContain("\x1b[G");
    expect(output).toContain(showCursorEscape);
    unmount();
  });

  test("setCursorPosition(undefined) hides cursor", async () => {
    const stdout = createStdout();
    const stdin = createStdin();

    function ConditionalCursorApp() {
      const { setCursorPosition } = useCursor();
      // Not calling setCursorPosition → cursor should remain hidden
      return (
        <Box>
          <Text>no cursor</Text>
        </Box>
      );
    }

    const { unmount } = render(<ConditionalCursorApp />, { stdout, stdin });
    await delay(50);

    const output = stdout.getWrites().join("");
    const lastShowIndex = output.lastIndexOf(showCursorEscape);
    const lastHideIndex = output.lastIndexOf(hideCursorEscape);

    // Last cursor visibility escape should be hide (or no show at all)
    expect(lastHideIndex).toBeGreaterThan(lastShowIndex);
    unmount();
  });
});
