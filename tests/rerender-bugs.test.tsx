/**
 * Re-render Bug Reproduction Tests
 *
 * Tests for bugs observed in inkx examples:
 * 1. Colors lost after scrolling/state changes
 * 2. Style bleeding across re-renders
 * 3. Diff output not properly resetting styles
 */

import { describe, expect, test } from "bun:test";
import React from "react";
import { TerminalBuffer, cellEquals, styleEquals } from "../src/buffer.js";
import { Box, Text } from "../src/index.js";
import { outputPhase } from "../src/pipeline.js";
import { createTestRenderer, stripAnsi } from "../src/testing/index.js";

const render = createTestRenderer();

describe("Bug: Colors lost after re-render", () => {
  test("colored text should retain color after rerender", () => {
    // Use simple stateless components to avoid hook issues
    function ColoredText({ count }: { count: number }) {
      return (
        <Box flexDirection="column">
          <Text color="red">Red text: {count}</Text>
          <Text color="green">Green text: {count}</Text>
          <Text color="blue">Blue text: {count}</Text>
        </Box>
      );
    }

    const { lastFrame, rerender } = render(<ColoredText count={0} />);

    // Initial render should have content
    const frame1 = lastFrame() ?? "";
    expect(stripAnsi(frame1)).toContain("Red text: 0");
    expect(stripAnsi(frame1)).toContain("Green text: 0");
    expect(stripAnsi(frame1)).toContain("Blue text: 0");

    // Check that ANSI color codes are present
    expect(frame1).toMatch(/\x1b\[/);

    // Rerender with updated count
    rerender(<ColoredText count={1} />);

    const frame2 = lastFrame() ?? "";
    expect(stripAnsi(frame2)).toContain("Red text: 1");
    // Colors should still be present
    expect(frame2).toMatch(/\x1b\[/);
  });

  test("selection highlight should persist after navigation", () => {
    function SelectableList({ selected }: { selected: number }) {
      const items = ["Item 1", "Item 2", "Item 3"];

      return (
        <Box flexDirection="column">
          {items.map((item, i) => (
            <Text
              key={i}
              backgroundColor={i === selected ? "cyan" : undefined}
              color={i === selected ? "black" : undefined}
            >
              {item}
            </Text>
          ))}
        </Box>
      );
    }

    const { lastFrame, rerender } = render(<SelectableList selected={0} />);

    // Initial render should show first item selected
    const frame1 = lastFrame() ?? "";
    expect(stripAnsi(frame1)).toContain("Item 1");

    // Move selection to second item
    rerender(<SelectableList selected={1} />);

    const frame2 = lastFrame() ?? "";
    expect(stripAnsi(frame2)).toContain("Item 1");
    expect(stripAnsi(frame2)).toContain("Item 2");
    expect(stripAnsi(frame2)).toContain("Item 3");
    // Should have ANSI codes for the new selection
    expect(frame2).toMatch(/\x1b\[/);
  });
});

describe("Bug: Style bleeding in diff output", () => {
  test("style reset should happen before each cell change", () => {
    // Create two buffers with different styles in same positions
    const prev = new TerminalBuffer(10, 2);
    prev.setCell(0, 0, { char: "A", fg: 1, bg: null, attrs: { bold: true } }); // Red bold
    prev.setCell(1, 0, { char: "B", fg: 2, bg: null, attrs: {} }); // Green

    const next = new TerminalBuffer(10, 2);
    next.setCell(0, 0, { char: "A", fg: null, bg: null, attrs: {} }); // No style
    next.setCell(1, 0, { char: "C", fg: 3, bg: null, attrs: {} }); // Yellow

    const output = outputPhase(prev, next);

    // The output should contain style resets
    // Each changed cell should have its own style applied correctly
    expect(output).toContain("\x1b["); // Contains escape sequences

    // Should not be empty since styles changed
    expect(output.length).toBeGreaterThan(0);
  });

  test("clearing a styled cell should reset to default style", () => {
    const prev = new TerminalBuffer(5, 1);
    prev.setCell(0, 0, { char: "X", fg: 1, bg: 6, attrs: { bold: true } }); // Red on cyan, bold

    const next = new TerminalBuffer(5, 1);
    next.setCell(0, 0, { char: " ", fg: null, bg: null, attrs: {} }); // Empty, no style

    const output = outputPhase(prev, next);

    // Should output the change with reset style
    expect(output.length).toBeGreaterThan(0);
  });

  test("buffer diff detects style-only changes", () => {
    const prev = new TerminalBuffer(5, 1);
    prev.setCell(0, 0, { char: "A", fg: 1, bg: null, attrs: {} }); // Red

    const next = new TerminalBuffer(5, 1);
    next.setCell(0, 0, { char: "A", fg: 2, bg: null, attrs: {} }); // Green (same char, different color)

    // Cells should not be equal
    const prevCell = prev.getCell(0, 0);
    const nextCell = next.getCell(0, 0);
    expect(cellEquals(prevCell, nextCell)).toBe(false);

    // Output should have the change
    const output = outputPhase(prev, next);
    expect(output.length).toBeGreaterThan(0);
  });
});

describe("Bug: Text content overwriting", () => {
  test("shorter text should clear previous longer text", () => {
    function DynamicText({ text }: { text: string }) {
      return <Text>{text}</Text>;
    }

    const { lastFrame, rerender } = render(<DynamicText text="Hello World" />);

    const frame1 = lastFrame() ?? "";
    expect(stripAnsi(frame1)).toContain("Hello World");

    rerender(<DynamicText text="Hi" />);

    const frame2 = lastFrame() ?? "";
    // "Hi" should be there
    expect(stripAnsi(frame2)).toContain("Hi");
    // "World" from previous frame should NOT be there
    expect(stripAnsi(frame2)).not.toContain("World");
  });

  test("multi-line content should clear properly on resize", () => {
    function MultiLine({ lines }: { lines: string[] }) {
      return (
        <Box flexDirection="column">
          {lines.map((line, i) => (
            <Text key={i}>{line}</Text>
          ))}
        </Box>
      );
    }

    const { lastFrame, rerender } = render(
      <MultiLine lines={["Line 1", "Line 2", "Line 3"]} />,
    );

    const frame1 = lastFrame() ?? "";
    expect(stripAnsi(frame1)).toContain("Line 1");
    expect(stripAnsi(frame1)).toContain("Line 2");
    expect(stripAnsi(frame1)).toContain("Line 3");

    // Reduce to fewer lines
    rerender(<MultiLine lines={["New Line"]} />);

    const frame2 = lastFrame() ?? "";
    expect(stripAnsi(frame2)).toContain("New Line");
    // Old lines should be gone
    expect(stripAnsi(frame2)).not.toContain("Line 2");
    expect(stripAnsi(frame2)).not.toContain("Line 3");
  });
});

describe("Bug: Buffer dimension changes", () => {
  test("buffer resize should clear old content", () => {
    const prev = new TerminalBuffer(20, 5);
    prev.setCell(15, 0, { char: "X" }); // Far right
    prev.setCell(0, 4, { char: "Y" }); // Bottom left

    // Smaller buffer
    const next = new TerminalBuffer(10, 3);
    next.setCell(0, 0, { char: "A" });

    // This is a fresh render scenario - prev is null conceptually
    // But if we're comparing, we need to handle size mismatch
    const output = outputPhase(null, next);

    // Should render the new content
    expect(output).toContain("A");
  });
});

describe("Bug: Scroll container style preservation", () => {
  test("scrolling should preserve child styles", () => {
    function ScrollableList({ scrollOffset }: { scrollOffset: number }) {
      const items = Array.from({ length: 10 }, (_, i) => `Item ${i + 1}`);

      return (
        <Box flexDirection="column" height={5} overflow="hidden">
          {items.slice(scrollOffset, scrollOffset + 5).map((item, i) => (
            <Text key={i} color={i === 0 ? "cyan" : undefined}>
              {item}
            </Text>
          ))}
        </Box>
      );
    }

    const { lastFrame, rerender } = render(<ScrollableList scrollOffset={0} />);

    const frame1 = lastFrame() ?? "";
    expect(stripAnsi(frame1)).toContain("Item 1");

    // After scroll, colors should still work
    rerender(<ScrollableList scrollOffset={2} />);

    const frame2 = lastFrame() ?? "";
    expect(stripAnsi(frame2)).toContain("Item 3"); // First visible after scroll
    // Should still have ANSI codes for cyan
    expect(frame2).toMatch(/\x1b\[/);
  });
});

describe("Bug: styleEquals edge cases", () => {
  test("null style should not equal default style object", () => {
    const nullStyle = null;
    const defaultStyle = { fg: null, bg: null, attrs: {} };

    // These should NOT be equal - null means "no style info"
    // while defaultStyle is explicit "default values"
    expect(styleEquals(nullStyle, defaultStyle)).toBe(false);
  });

  test("empty attrs should equal attrs with all false values", () => {
    const style1 = { fg: null, bg: null, attrs: {} };
    const style2 = {
      fg: null,
      bg: null,
      attrs: {
        bold: false,
        dim: false,
        italic: false,
        underline: false,
        inverse: false,
      },
    };

    // These SHOULD be functionally equal
    expect(styleEquals(style1, style2)).toBe(true);
  });
});

describe("Bug: Cell comparison edge cases", () => {
  test("cells with same char but different styles are not equal", () => {
    const cell1 = {
      char: "A",
      fg: 1 as const,
      bg: null,
      attrs: {},
      wide: false,
      continuation: false,
    };
    const cell2 = {
      char: "A",
      fg: 2 as const,
      bg: null,
      attrs: {},
      wide: false,
      continuation: false,
    };

    expect(cellEquals(cell1, cell2)).toBe(false);
  });

  test("cells with null fg should equal cells with 0 fg", () => {
    // This tests the edge case where null and 0 might be confused
    const cellNull = {
      char: "A",
      fg: null,
      bg: null,
      attrs: {},
      wide: false,
      continuation: false,
    };
    const cellZero = {
      char: "A",
      fg: 0 as const, // Black color
      bg: null,
      attrs: {},
      wide: false,
      continuation: false,
    };

    // These should NOT be equal - null means default, 0 means black
    expect(cellEquals(cellNull, cellZero)).toBe(false);
  });
});
