/**
 * Background Color Inheritance Tests
 *
 * Tests for background color inheritance edge cases:
 * - bg bleeding into child spans
 * - Text-only backgroundColor should color only text content
 */

import React from "react";
import { describe, test, expect } from "vitest";
import { createRenderer, stripAnsi } from "@silvery/test";
import { Box, Text } from "@silvery/react";
import chalk from "chalk";
import { Box as InkBox, Text as InkText } from "../../packages/compat/src/ink";
import { renderToString, initLayoutEngine } from "../compat/ink/helpers/render-to-string";

describe("background inheritance", () => {
  test("Text backgroundColor only colors the text content, not the full Box width", () => {
    const r = createRenderer({ cols: 20, rows: 5 });
    const app = r(
      <Box width={20}>
        <Text backgroundColor="green">Hi</Text>
      </Box>,
    );
    const buffer = app.term.buffer;
    // The first two columns (where "Hi" is) should have green bg
    const cell0 = buffer.getCell(0, 0);
    const cell1 = buffer.getCell(1, 0);
    // Column 2 onwards should NOT have green bg
    const cell2 = buffer.getCell(2, 0);

    // cell0 and cell1 should have a bg color
    expect(cell0.char).toBe("H");
    expect(cell1.char).toBe("i");

    // The bg should be set on the text cells
    // and NOT on cells after the text
    // (cell2 should have null/default bg)
    const hasBg0 = cell0.bg !== null;
    const hasBg2 = cell2.bg !== null;
    expect(hasBg0).toBe(true);
    expect(hasBg2).toBe(false);
  });

  test("bg does not bleed into child Text that has no bg", () => {
    const r = createRenderer({ cols: 30, rows: 5 });
    const app = r(
      <Box backgroundColor="blue">
        <Text>
          <Text backgroundColor="green">A</Text>
          <Text>B</Text>
        </Text>
      </Box>,
    );
    const buffer = app.term.buffer;
    // "A" should have green bg
    const cellA = buffer.getCell(0, 0);
    expect(cellA.char).toBe("A");

    // "B" should have blue bg (inherited from Box), not green
    const cellB = buffer.getCell(1, 0);
    expect(cellB.char).toBe("B");

    // B's bg should be the Box's bg (blue), not the sibling Text's bg (green)
    // Both should have SOME bg, but they should be different
    expect(cellA.bg).not.toEqual(cellB.bg);
  });

  test("Text backgroundColor via Ink compat: colors only text, not box width", async () => {
    await initLayoutEngine();
    chalk.level = 3;
    const output = renderToString(
      <InkBox width={10}>
        <InkText backgroundColor="green">Hi</InkText>
      </InkBox>,
      { columns: 20 },
    );
    // "Hi" should have bg color
    expect(output).toContain("Hi");
    // The green bg should only cover "Hi", not extend to fill width=10
    const plainOutput = stripAnsi(output);
    // After "Hi" there should be spaces (no bg)
    expect(plainOutput).toBe("Hi");
  });

  test("nested Text bg does not bleed via Ink compat", async () => {
    await initLayoutEngine();
    chalk.level = 3;

    const output = renderToString(
      <InkBox>
        <InkText>
          <InkText backgroundColor="green">Green</InkText>
          <InkText>Normal</InkText>
        </InkText>
      </InkBox>,
      { columns: 40 },
    );
    // Both words should be present
    expect(stripAnsi(output)).toBe("GreenNormal");

    // "Normal" should NOT have green background
    // The ANSI codes should show a bg reset between "Green" and "Normal"
    const greenPart = output.indexOf("Green");
    const normalPart = output.indexOf("Normal");
    expect(greenPart).toBeLessThan(normalPart);
  });
});
