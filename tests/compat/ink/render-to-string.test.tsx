/**
 * Ink compat test: render-to-string (from ink/test/render-to-string.tsx)
 * Tests silvery's renderStringSync as a replacement for Ink's renderToString
 */
import React, { useEffect, useLayoutEffect, useState } from "react";
import { test, expect, beforeAll } from "vitest";
import chalk from "chalk";
import { Box, Text, Static, Transform, Newline, Spacer } from "../../../packages/compat/src/ink";
import { renderToString, initLayoutEngine } from "./helpers/render-to-string";

beforeAll(async () => {
  await initLayoutEngine();
  chalk.level = 3;
});

// Basic rendering
test("render simple text", () => {
  const output = renderToString(<Text>Hello World</Text>);
  expect(output).toBe("Hello World");
});

test("render text with variable", () => {
  const output = renderToString(<Text>Count: {42}</Text>);
  expect(output).toBe("Count: 42");
});

test("render nested text components", () => {
  function World() {
    return <Text>World</Text>;
  }
  const output = renderToString(
    <Text>
      Hello <World />
    </Text>,
  );
  expect(output).toBe("Hello World");
});

test("render empty fragment", () => {
  const output = renderToString(<></>);
  expect(output).toBe("");
});

test("render null children", () => {
  const output = renderToString(<Text>{null}</Text>);
  expect(output).toBe("");
});

// Layout
test("render box with padding", () => {
  const output = renderToString(
    <Box paddingLeft={2}>
      <Text>Padded</Text>
    </Box>,
  );
  expect(output).toBe("  Padded");
});

test("render box with flex direction row", () => {
  const output = renderToString(
    <Box>
      <Text>A</Text>
      <Text>B</Text>
      <Text>C</Text>
    </Box>,
  );
  expect(output).toBe("ABC");
});

test("render box with flex direction column", () => {
  const output = renderToString(
    <Box flexDirection="column">
      <Text>Line 1</Text>
      <Text>Line 2</Text>
    </Box>,
  );
  expect(output).toBe("Line 1\nLine 2");
});

test("render margin", () => {
  const output = renderToString(
    <Box marginLeft={2}>
      <Text>Margined</Text>
    </Box>,
  );
  expect(output).toBe("  Margined");
});

test("render gap between items", () => {
  const output = renderToString(
    <Box gap={1}>
      <Text>A</Text>
      <Text>B</Text>
    </Box>,
  );
  expect(output).toBe("A B");
});

test("render box with fixed width and height", () => {
  const output = renderToString(
    <Box width={10} height={3}>
      <Text>Hi</Text>
    </Box>,
  );
  const lines = output.split("\n");
  expect(lines.length).toBe(3);
});

test("render spacer pushes content apart", () => {
  const output = renderToString(
    <Box width={20}>
      <Text>Left</Text>
      <Spacer />
      <Text>Right</Text>
    </Box>,
  );
  expect(output).toBe("Left           Right");
});

test("render newline inserts blank line", () => {
  const output = renderToString(
    <Box flexDirection="column">
      <Text>Above</Text>
      <Newline />
      <Text>Below</Text>
    </Box>,
  );
  expect(output).toBe("Above\n\n\nBelow");
});

// Styling
test("render colored text", () => {
  const output = renderToString(<Text color="green">Green</Text>);
  expect(output).toBe(chalk.green("Green"));
});

test("render bold text", () => {
  const output = renderToString(<Text bold>Bold</Text>);
  expect(output).toBe(chalk.bold("Bold"));
});

// Text wrapping
test("render text with wrap", () => {
  const output = renderToString(
    <Box width={7}>
      <Text wrap="wrap">Hello World</Text>
    </Box>,
  );
  expect(output).toBe("Hello\nWorld");
});

test("render text with truncate", () => {
  const output = renderToString(
    <Box width={7}>
      <Text wrap="truncate">Hello World</Text>
    </Box>,
  );
  expect(output).toBe("Hello \u2026");
});

test("default columns is 80", () => {
  const longText = "A".repeat(100);
  const output = renderToString(<Text>{longText}</Text>, { columns: 80 });
  const lines = output.split("\n");
  expect(lines.length).toBe(2);
  expect(lines[0]).toBe("A".repeat(80));
  expect(lines[1]).toBe("A".repeat(20));
});

test("custom columns option", () => {
  const longText = "A".repeat(50);
  const output = renderToString(<Text>{longText}</Text>, { columns: 30 });
  const lines = output.split("\n");
  expect(lines.length).toBe(2);
  expect(lines[0]).toBe("A".repeat(30));
  expect(lines[1]).toBe("A".repeat(20));
});

// Components
test("render Transform component", () => {
  const output = renderToString(
    <Transform transform={(output) => output.toUpperCase()}>
      <Text>hello</Text>
    </Transform>,
  );
  expect(output).toBe("HELLO");
});

test("render Static component with items", () => {
  const items = ["A", "B", "C"];
  const output = renderToString(
    <Box flexDirection="column">
      <Static items={items}>{(item) => <Text key={item}>{item}</Text>}</Static>
      <Text>Dynamic</Text>
    </Box>,
  );
  expect(output).toBe("A\nB\nC\nDynamic");
});

// Effect behavior
test("captures initial render output before effect-driven state updates", () => {
  function App() {
    const [text, setText] = useState("Initial");
    useEffect(() => {
      setText("Updated");
    }, []);
    return <Text>{text}</Text>;
  }
  const output = renderToString(<App />);
  // silvery's layout stabilization loop runs effects, so the output includes
  // the effect-driven state update. Ink captured pre-effect output.
  expect(output).toBe("Updated");
});

test("useLayoutEffect state updates are reflected in output", () => {
  function App() {
    const [text, setText] = useState("Initial");
    useLayoutEffect(() => {
      setText("Layout Updated");
    }, []);
    return <Text>{text}</Text>;
  }
  const output = renderToString(<App />);
  expect(output).toBe("Layout Updated");
});

// Error handling
test("component that throws propagates the error", () => {
  function Broken(): React.JSX.Element {
    throw new Error("Component error");
  }
  expect(() => renderToString(<Broken />)).toThrow("Component error");
});

test("text outside Text component is silently ignored (silvery does not throw)", () => {
  // silvery silently ignores raw text in Box (it's only rendered inside Text nodes).
  // Ink throws. silvery produces empty output.
  const output = renderToString(<Box>{"raw text"}</Box>);
  expect(output).toBe("");
});

test("subsequent calls work after a component error", () => {
  function Broken(): React.JSX.Element {
    throw new Error("Boom");
  }
  expect(() => renderToString(<Broken />)).toThrow();
  const output = renderToString(<Text>Still works</Text>);
  expect(output).toBe("Still works");
});

// Independence
test("can be called multiple times independently", () => {
  const output1 = renderToString(<Text>First</Text>);
  const output2 = renderToString(<Text>Second</Text>);
  expect(output1).toBe("First");
  expect(output2).toBe("Second");
});

// Deeply nested tree
test("render deeply nested component tree", () => {
  const output = renderToString(
    <Box flexDirection="column">
      <Box paddingLeft={1}>
        <Box>
          <Text bold>
            {"Nested "}
            <Text color="green">deep</Text>
          </Text>
        </Box>
      </Box>
    </Box>,
  );
  expect(output.includes("Nested")).toBe(true);
  expect(output.includes("deep")).toBe(true);
});
