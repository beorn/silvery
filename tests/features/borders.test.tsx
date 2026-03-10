/**
 * Border Rendering Tests
 *
 * Tests for border rendering correctness including:
 * - Alignment inside borders
 * - Hiding specific border sides
 * - Custom border styles with distinct per-side characters
 * - Wide characters with borders
 */

import React from "react";
import { describe, test, expect } from "vitest";
import { createRenderer, stripAnsi } from "@silvery/test";
import { Box, Text } from "@silvery/react";

describe("border rendering", () => {
  // =========================================================================
  // Alignment inside borders
  // =========================================================================

  test("justifyContent center with border", () => {
    const r = createRenderer({ cols: 20, rows: 5 });
    const app = r(
      <Box borderStyle="single" width={20} justifyContent="center">
        <Text>Hi</Text>
      </Box>,
    );
    const text = stripAnsi(app.text);
    const lines = text.split("\n");
    expect(lines[0]).toContain("┌");
    expect(lines[0]).toContain("┐");
    expect(text).toContain("Hi");
  });

  test("alignItems center with border in column direction", () => {
    const r = createRenderer({ cols: 20, rows: 10 });
    const app = r(
      <Box borderStyle="single" width={20} height={5} flexDirection="column" alignItems="center">
        <Text>Centered</Text>
      </Box>,
    );
    const text = stripAnsi(app.text);
    expect(text).toContain("Centered");
    const lines = text.split("\n");
    // All border rows present
    expect(lines[0]).toContain("┌");
    expect(lines[0]).toContain("┐");
    expect(lines[lines.length - 1]).toContain("└");
    expect(lines[lines.length - 1]).toContain("┘");
  });

  test("justifyContent flex-end with border", () => {
    const r = createRenderer({ cols: 20, rows: 5 });
    const app = r(
      <Box borderStyle="single" width={20} justifyContent="flex-end">
        <Text>End</Text>
      </Box>,
    );
    const text = stripAnsi(app.text);
    expect(text).toContain("End");
    const lines = text.split("\n");
    expect(lines[0]).toContain("┌");
    expect(lines[0]).toContain("┐");
  });

  // =========================================================================
  // Hidden border sides
  // =========================================================================

  test("hide left border - leading space and correct width", () => {
    const r = createRenderer({ cols: 20, rows: 5 });
    const app = r(
      <Box borderStyle="round" borderLeft={false} width={10}>
        <Text>Content</Text>
      </Box>,
    );
    const buffer = app.term.buffer;
    const topRow = Array.from({ length: 10 }, (_, x) => buffer.getCell(x, 0).char).join("");
    const botRow = Array.from({ length: 10 }, (_, x) => buffer.getCell(x, 2).char).join("");

    // Top/bottom rows: space at col 0 (where left border would be), horizontal, right corner
    expect(topRow[0]).toBe(" ");
    expect(topRow).toContain("─");
    expect(topRow).toContain("╮");
    expect(topRow).not.toContain("╭");

    expect(botRow[0]).toBe(" ");
    expect(botRow).toContain("╯");
    expect(botRow).not.toContain("╰");

    // Side borders: no left border on content rows
    const midRow = Array.from({ length: 10 }, (_, x) => buffer.getCell(x, 1).char).join("");
    expect(midRow).toContain("│"); // right border
    expect(midRow[0]).not.toBe("│"); // no left border character
  });

  test("hide right border", () => {
    const r = createRenderer({ cols: 20, rows: 5 });
    const app = r(
      <Box borderStyle="round" borderRight={false} width={10}>
        <Text>Content</Text>
      </Box>,
    );
    const buffer = app.term.buffer;
    const topRow = Array.from({ length: 10 }, (_, x) => buffer.getCell(x, 0).char).join("");

    expect(topRow).toContain("╭");
    expect(topRow).not.toContain("╮");
    expect(topRow).toContain("─");
  });

  test("hide left and right borders", () => {
    const r = createRenderer({ cols: 20, rows: 5 });
    const app = r(
      <Box borderStyle="round" borderLeft={false} borderRight={false} width={10}>
        <Text>Content</Text>
      </Box>,
    );
    const text = stripAnsi(app.text);
    const lines = text.split("\n");

    // No corners
    expect(lines[0]).not.toContain("╭");
    expect(lines[0]).not.toContain("╮");
    expect(lines[0]).toContain("─");

    expect(lines[lines.length - 1]).not.toContain("╰");
    expect(lines[lines.length - 1]).not.toContain("╯");
    expect(lines[lines.length - 1]).toContain("─");
  });

  test("hide top border", () => {
    const r = createRenderer({ cols: 20, rows: 5 });
    const app = r(
      <Box borderStyle="single" borderTop={false} width={10}>
        <Text>Test</Text>
      </Box>,
    );
    const buffer = app.term.buffer;
    // First row should be content with side borders, not top border
    const firstRow = Array.from({ length: 10 }, (_, x) => buffer.getCell(x, 0).char).join("");
    expect(firstRow).not.toContain("┌");
    expect(firstRow).not.toContain("┐");
    expect(firstRow).toContain("│"); // side borders extend to cover top border space
  });

  test("hide bottom border", () => {
    const r = createRenderer({ cols: 20, rows: 5 });
    const app = r(
      <Box borderStyle="single" borderBottom={false} width={10}>
        <Text>Test</Text>
      </Box>,
    );
    const text = stripAnsi(app.text);
    expect(text).toContain("Test");
    // Should have top border but no bottom
    const lines = text.split("\n");
    expect(lines[0]).toContain("┌");
    expect(lines[0]).toContain("┐");
    // Last content line should not have bottom corners
    const lastLine = lines[lines.length - 1]!;
    expect(lastLine).not.toContain("└");
    expect(lastLine).not.toContain("┘");
  });

  // =========================================================================
  // Custom border styles
  // =========================================================================

  test("custom border style with distinct top/bottom/left/right chars", () => {
    const arrowBorder = {
      topLeft: "↘",
      top: "↓",
      topRight: "↙",
      bottomLeft: "↗",
      bottom: "↑",
      bottomRight: "↖",
      left: "→",
      right: "←",
    };

    const r = createRenderer({ cols: 20, rows: 5 });
    const app = r(
      <Box borderStyle={arrowBorder as any} width={10}>
        <Text>Test</Text>
      </Box>,
    );
    const text = stripAnsi(app.text);
    const lines = text.split("\n");

    // Top row uses top chars
    expect(lines[0]).toContain("↘");
    expect(lines[0]).toContain("↓");
    expect(lines[0]).toContain("↙");

    // Bottom row uses bottom chars (NOT top chars)
    expect(lines[lines.length - 1]).toContain("↗");
    expect(lines[lines.length - 1]).toContain("↑");
    expect(lines[lines.length - 1]).toContain("↖");

    // Side borders use left/right chars (NOT same char for both)
    const middleLine = lines[1]!;
    expect(middleLine.startsWith("→")).toBe(true);
    expect(middleLine).toContain("←");
  });

  // =========================================================================
  // Wide characters with borders
  // =========================================================================

  test("wide characters with border in column direction", () => {
    const r = createRenderer({ cols: 20, rows: 10 });
    const app = r(
      <Box borderStyle="single" flexDirection="column">
        <Text>古</Text>
      </Box>,
    );
    const text = stripAnsi(app.text);
    expect(text).toContain("古");
    const lines = text.split("\n");
    expect(lines[0]).toContain("┌");
    expect(lines[0]).toContain("┐");
  });

  test("wide characters with border maintains correct width", () => {
    const r = createRenderer({ cols: 20, rows: 5 });
    const app = r(
      <Box borderStyle="single" width={8}>
        <Text>日本</Text>
      </Box>,
    );
    const text = stripAnsi(app.text);
    expect(text).toContain("日本");
    const lines = text.split("\n");
    // Box width is 8: left border (1) + content (6) + right border (1) = 8
    expect(lines[0]).toContain("┌");
    expect(lines[0]).toContain("┐");
    // Content row should have both wide characters
    expect(lines[1]).toContain("日本");
  });
});
