import { describe, test, expect } from "vitest";
import { createRenderer } from "@silvery/test";
import { Box, Text } from "silvery";

describe("position offsets (top/left/bottom/right)", () => {
  const render = createRenderer({ cols: 20, rows: 10 });

  test("absolute position with top and left offsets", () => {
    const app = render(
      <Box width={5} height={3}>
        <Box position="absolute" top={1} left={2}>
          <Text>X</Text>
        </Box>
      </Box>,
    );
    // Row 0: empty, Row 1: 2 spaces + X, Row 2: empty
    const lines = app.text.split("\n");
    expect(lines[0]?.trim()).toBe("");
    expect(lines[1]).toContain("X");
    expect(lines[1]?.indexOf("X")).toBe(2);
  });

  test("absolute position with bottom and right offsets", () => {
    const app = render(
      <Box width={6} height={4}>
        <Box position="absolute" bottom={1} right={1}>
          <Text>X</Text>
        </Box>
      </Box>,
    );
    // X should appear at row 2 (4-1-1), col 4 (6-1-1)
    const lines = app.text.split("\n");
    expect(lines[2]).toContain("X");
    expect(lines[2]?.indexOf("X")).toBe(4);
  });

  test("absolute position with percentage top and left", () => {
    const app = render(
      <Box width={6} height={4}>
        <Box position="absolute" top="50%" left="50%">
          <Text>X</Text>
        </Box>
      </Box>,
    );
    // 50% of 4 = 2 rows, 50% of 6 = 3 cols
    const lines = app.text.split("\n");
    expect(lines[2]).toContain("X");
    expect(lines[2]?.indexOf("X")).toBe(3);
  });

  test("absolute position with percentage bottom and right", () => {
    const app = render(
      <Box width={6} height={4}>
        <Box position="absolute" bottom="50%" right="50%">
          <Text>X</Text>
        </Box>
      </Box>,
    );
    // bottom 50% of 4 = offset from bottom by 2 -> row 1, right 50% of 6 = col 2
    const lines = app.text.split("\n");
    expect(lines[1]).toContain("X");
    expect(lines[1]?.indexOf("X")).toBe(2);
  });

  test("relative position offsets visual position while keeping flow", () => {
    const app = render(
      <Box width={10} flexDirection="row">
        <Box position="relative" left={2}>
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>,
    );
    // A is offset 2 to the right from its natural position, B stays in flow
    const text = app.text.split("\n")[0] ?? "";
    const aPos = text.indexOf("A");
    const bPos = text.indexOf("B");
    // A should be shifted right, B should be at natural flow position
    expect(aPos).toBeGreaterThan(bPos);
  });

  test("top offset of 0 does not shift element", () => {
    const app = render(
      <Box width={5} height={3}>
        <Box position="absolute" top={0} left={0}>
          <Text>X</Text>
        </Box>
      </Box>,
    );
    const lines = app.text.split("\n");
    expect(lines[0]?.indexOf("X")).toBe(0);
  });

  test("combined top and bottom - top takes precedence for positioning", () => {
    const app = render(
      <Box width={5} height={5}>
        <Box position="absolute" top={1}>
          <Text>X</Text>
        </Box>
      </Box>,
    );
    const lines = app.text.split("\n");
    expect(lines[0]?.trim()).toBe("");
    expect(lines[1]).toContain("X");
  });

  test("left offset shifts content in absolute positioning", () => {
    const app = render(
      <Box width={10} height={2}>
        <Box position="absolute" left={5}>
          <Text>Hi</Text>
        </Box>
      </Box>,
    );
    const line = app.text.split("\n")[0] ?? "";
    expect(line.indexOf("Hi")).toBe(5);
  });

  test("right offset positions from right edge", () => {
    const app = render(
      <Box width={10} height={2}>
        <Box position="absolute" right={0}>
          <Text>X</Text>
        </Box>
      </Box>,
    );
    const line = app.text.split("\n")[0] ?? "";
    expect(line.indexOf("X")).toBe(9);
  });

  test("bottom offset positions from bottom edge", () => {
    const app = render(
      <Box width={5} height={3}>
        <Box position="absolute" bottom={0}>
          <Text>X</Text>
        </Box>
      </Box>,
    );
    const lines = app.text.split("\n");
    expect(lines[2]).toContain("X");
  });
});

describe("position='static' ignores offsets", () => {
  const render = createRenderer({ cols: 20, rows: 5 });

  test("static position ignores left offset", () => {
    const app = render(
      <Box width={10}>
        <Box position="static" left={5}>
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>,
    );
    // Static position = normal flow, offsets ignored
    expect(app.text).toContain("AB");
  });

  test("static position ignores percentage offsets", () => {
    const app = render(
      <Box width={10}>
        <Box position="static" left="50%">
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>,
    );
    expect(app.text).toContain("AB");
  });

  test("static position ignores top offset", () => {
    const app = render(
      <Box width={10} height={3} flexDirection="column">
        <Box position="static" top={2}>
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>,
    );
    // A should be at row 0 (offset ignored), B at row 1
    const lines = app.text.split("\n");
    expect(lines[0]).toContain("A");
    expect(lines[1]).toContain("B");
  });
});
