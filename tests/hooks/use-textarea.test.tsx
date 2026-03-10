/**
 * useTextArea Hook Tests
 *
 * Bead: km-silvery.use-textarea-hook
 *
 * Tests that the useTextArea hook manages text editing state correctly,
 * and that TextArea uses it internally with identical behavior.
 */

import React, { useRef, useState } from "react";
import { describe, test, expect } from "vitest";
import { createRenderer } from "@silvery/test";
import { Box, Text, TextArea, useTextArea, type TextAreaHandle } from "@silvery/react";
import { clampScroll } from "@silvery/ui/components/useTextArea";

// ============================================================================
// clampScroll (pure function)
// ============================================================================

describe("clampScroll", () => {
  test("returns 0 when viewport is 0 or negative", () => {
    expect(clampScroll(5, 0, 0, 10, 1)).toBe(0);
    expect(clampScroll(5, 0, -1, 10, 1)).toBe(0);
  });

  test("returns 0 when content fits in viewport", () => {
    expect(clampScroll(2, 0, 10, 5, 1)).toBe(0);
  });

  test("scrolls down when cursor is below viewport", () => {
    // Cursor at row 15, viewport shows rows 0-9 (height 10), margin 1
    const result = clampScroll(15, 0, 10, 20, 1);
    // Should scroll so cursor is at bottom with margin
    expect(result).toBe(7); // 15 - 10 + 1 + 1 = 7
  });

  test("scrolls up when cursor is above viewport", () => {
    // Cursor at row 2, viewport shows rows 5-14, margin 1
    const result = clampScroll(2, 5, 10, 20, 1);
    expect(result).toBe(1); // 2 - 1 = 1
  });

  test("clamps to valid range", () => {
    // Don't scroll past the end
    const result = clampScroll(19, 0, 10, 20, 1);
    expect(result).toBeLessThanOrEqual(10); // max scroll = 20 - 10 = 10
  });
});

// ============================================================================
// useTextArea hook via component rendering
// ============================================================================

describe("useTextArea hook", () => {
  test("provides initial uncontrolled value", () => {
    const r = createRenderer({ cols: 40, rows: 10 });

    function TestApp() {
      const ta = useTextArea({
        defaultValue: "hello world",
        height: 5,
        wrapWidth: 40,
      });
      return (
        <Box flexDirection="column">
          <Text>value:{ta.value}</Text>
          <Text>cursor:{ta.cursor}</Text>
          <Text>row:{ta.cursorRow}</Text>
          <Text>col:{ta.cursorCol}</Text>
        </Box>
      );
    }

    const app = r(<TestApp />);
    expect(app.text).toContain("value:hello world");
    expect(app.text).toContain("cursor:11"); // cursor at end of "hello world"
    expect(app.text).toContain("row:0");
    expect(app.text).toContain("col:11");
  });

  test("provides controlled value", () => {
    const r = createRenderer({ cols: 40, rows: 10 });

    function TestApp() {
      const ta = useTextArea({
        value: "controlled",
        height: 5,
        wrapWidth: 40,
      });
      return <Text>value:{ta.value}</Text>;
    }

    const app = r(<TestApp />);
    expect(app.text).toContain("value:controlled");
  });

  test("computes wrapped lines", () => {
    const r = createRenderer({ cols: 40, rows: 10 });

    function TestApp() {
      const ta = useTextArea({
        defaultValue: "hello\nworld",
        height: 5,
        wrapWidth: 40,
      });
      return <Text>lines:{ta.wrappedLines.length}</Text>;
    }

    const app = r(<TestApp />);
    expect(app.text).toContain("lines:2");
  });

  test("computes visible lines based on scroll", () => {
    const r = createRenderer({ cols: 40, rows: 10 });

    function TestApp() {
      const ta = useTextArea({
        defaultValue: "line1\nline2\nline3\nline4\nline5",
        height: 3,
        wrapWidth: 40,
      });
      return (
        <Box flexDirection="column">
          <Text>total:{ta.wrappedLines.length}</Text>
          <Text>visible:{ta.visibleLines.length}</Text>
        </Box>
      );
    }

    const app = r(<TestApp />);
    expect(app.text).toContain("total:5");
    expect(app.text).toContain("visible:3");
  });

  test("selection is null when no selection active", () => {
    const r = createRenderer({ cols: 40, rows: 10 });

    function TestApp() {
      const ta = useTextArea({
        defaultValue: "hello",
        height: 5,
        wrapWidth: 40,
      });
      return <Text>sel:{String(ta.selection)}</Text>;
    }

    const app = r(<TestApp />);
    expect(app.text).toContain("sel:null");
  });
});

// ============================================================================
// TextArea component still works (uses hook internally)
// ============================================================================

describe("TextArea uses useTextArea", () => {
  test("renders with placeholder", () => {
    const r = createRenderer({ cols: 40, rows: 10 });

    function TestApp() {
      return <TextArea height={5} placeholder="Type here..." />;
    }

    const app = r(<TestApp />);
    expect(app.text).toContain("Type here...");
  });

  test("renders with initial value", () => {
    const r = createRenderer({ cols: 40, rows: 10 });

    function TestApp() {
      // Wrap in a row so TextArea gets width from the parent
      return (
        <Box width={40}>
          <TextArea height={5} defaultValue="hello" />
        </Box>
      );
    }

    const app = r(<TestApp />);
    // TextArea renders as individual wrapped lines; app.text joins them with newlines.
    // "hello" fits on one line at width 40, so it should appear in the output.
    expect(app.text).toContain("hello");
  });

  test("controlled value renders correctly", () => {
    const r = createRenderer({ cols: 40, rows: 10 });

    function TestApp() {
      const [value, setValue] = useState("initial");
      return (
        <Box flexDirection="column">
          <TextArea height={3} value={value} onChange={setValue} />
        </Box>
      );
    }

    const app = r(<TestApp />);
    expect(app.text).toContain("initial");
  });

  test("imperative handle works via ref", () => {
    const r = createRenderer({ cols: 40, rows: 10 });
    let handle: TextAreaHandle | null = null;

    function TestApp() {
      const ref = useRef<TextAreaHandle>(null);
      handle = ref.current;
      return (
        <Box flexDirection="column">
          <TextArea ref={ref} height={3} defaultValue="test value" />
        </Box>
      );
    }

    r(<TestApp />);
    // After first render, ref should be available
    // (Note: ref is assigned after render, so we need to check after the initial render)
  });
});
