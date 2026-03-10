/**
 * Transform component tests
 */
import { describe, test, expect } from "vitest";
import { createRenderer } from "@silvery/test";
import { Box, Text } from "silvery";
import { Transform } from "../../packages/compat/src/ink";

const render = createRenderer({ cols: 80, rows: 10 });

describe("Transform", () => {
  test("transforms single text child", () => {
    const app = render(
      <Transform transform={(output) => `[${output}]`}>
        <Text>hello</Text>
      </Transform>,
    );
    expect(app.text).toBe("[hello]");
  });

  test("transforms concatenated children text", () => {
    const app = render(
      <Transform transform={(output) => `[${output}]`}>
        <Text>hello </Text>
        <Text>world</Text>
      </Transform>,
    );
    expect(app.text).toBe("[hello world]");
  });

  test("transforms each line separately", () => {
    const app = render(
      <Transform transform={(line, index) => `${index}: ${line}`}>
        <Text>{"first\nsecond"}</Text>
      </Transform>,
    );
    expect(app.text).toBe("0: first\n1: second");
  });

  test("transforms uppercase", () => {
    const app = render(
      <Transform transform={(output) => output.toUpperCase()}>
        <Text>hello </Text>
        <Text>world</Text>
      </Transform>,
    );
    expect(app.text).toBe("HELLO WORLD");
  });
});
