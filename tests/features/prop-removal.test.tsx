/**
 * Prop Removal Tests
 *
 * Tests that layout props are properly reset when removed on rerender.
 * Bug: applyBoxProps only set layout properties when they were defined,
 * but never reset them when they became undefined on rerender.
 * Fix: wasRemoved() helper detects when a prop was in oldProps but not newProps.
 */

import React from "react";
import { describe, test, expect } from "vitest";
import { createRenderer, stripAnsi } from "@silvery/test";
import { Box, Text } from "@silvery/react";
import { Box as InkBox, Text as InkText, render } from "../../packages/compat/src/ink";
import createStdout from "../compat/ink/helpers/create-stdout";

describe("prop removal on rerender", () => {
  test("marginLeft is removed", () => {
    const r = createRenderer({ cols: 20, rows: 5 });
    const app = r(
      <Box marginLeft={1}>
        <Text>X</Text>
      </Box>,
    );
    expect(stripAnsi(app.text)).toBe(" X");

    app.rerender(
      <Box>
        <Text>X</Text>
      </Box>,
    );
    expect(stripAnsi(app.text)).toBe("X");
  });

  test("marginLeft is removed (ink compat render)", () => {
    const stdout = createStdout(100);
    const instance = render(
      <InkBox marginLeft={1}>
        <InkText>X</InkText>
      </InkBox>,
      { stdout },
    );
    expect(stripAnsi(stdout.get())).toBe(" X");

    instance.rerender(
      <InkBox>
        <InkText>X</InkText>
      </InkBox>,
    );
    expect(stripAnsi(stdout.get())).toBe("X");
    instance.unmount();
  });

  test("paddingLeft is removed", () => {
    const r = createRenderer({ cols: 20, rows: 5 });
    const app = r(
      <Box paddingLeft={2}>
        <Text>X</Text>
      </Box>,
    );
    expect(stripAnsi(app.text)).toBe("  X");

    app.rerender(
      <Box>
        <Text>X</Text>
      </Box>,
    );
    expect(stripAnsi(app.text)).toBe("X");
  });

  test("flexGrow removal resets to default", () => {
    const stdout = createStdout(20);
    const instance = render(
      <InkBox>
        <InkBox flexGrow={1}>
          <InkText>X</InkText>
        </InkBox>
        <InkText>Y</InkText>
      </InkBox>,
      { stdout },
    );

    instance.rerender(
      <InkBox>
        <InkBox>
          <InkText>X</InkText>
        </InkBox>
        <InkText>Y</InkText>
      </InkBox>,
    );
    expect(stripAnsi(stdout.get())).toBe("XY");
    instance.unmount();
  });

  test("width removal resets to auto sizing", () => {
    const r = createRenderer({ cols: 20, rows: 5 });
    const app = r(
      <Box flexDirection="column">
        <Box width={15}>
          <Text>ABCDE</Text>
        </Box>
      </Box>,
    );

    app.rerender(
      <Box flexDirection="column">
        <Box>
          <Text>ABCDE</Text>
        </Box>
      </Box>,
    );
    expect(stripAnsi(app.text)).toBe("ABCDE");
  });

  test("height removal resets to auto sizing", () => {
    const r = createRenderer({ cols: 20, rows: 10 });
    const app = r(
      <Box height={3}>
        <Text>X</Text>
      </Box>,
    );

    app.rerender(
      <Box>
        <Text>X</Text>
      </Box>,
    );
    expect(stripAnsi(app.text)).toBe("X");
  });
});
