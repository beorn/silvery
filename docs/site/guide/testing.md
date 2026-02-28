# Testing

inkx includes a comprehensive test suite with **870+ tests** covering everything from low-level buffer operations to high-level React component rendering. This guide documents the test structure and how to use `createRenderer` for testing your own inkx applications.

## Test Suite Overview

The test suite is organized by domain:

| File                            | Tests | Description                                                           |
| ------------------------------- | ----- | --------------------------------------------------------------------- |
| `unicode.test.ts`               | 223   | Unicode handling: graphemes, display width, CJK, emoji, ZWJ sequences |
| `output.test.ts`                | 63    | ANSI output generation, style conversion, buffer rendering            |
| `input.test.tsx`                | 49    | Keyboard input handling, escape sequences, modifiers                  |
| `terminal-multiplexers.test.ts` | 41    | tmux/screen compatibility, synchronized update mode                   |
| `ink-compat.test.tsx`           | 40    | Ink API compatibility verification                                    |
| `compat/layout.test.tsx`        | 42    | Flex layout API compatibility                                         |
| `ime.test.tsx`                  | 39    | CJK/IME input handling                                                |
| `buffer.test.ts`                | 38    | Terminal buffer operations, cell packing                              |
| `pipeline.test.ts`              | 36    | Render pipeline: measure, layout, content, output phases              |
| `ansi-parsing.test.ts`          | 29    | ANSI escape sequence parsing                                          |
| `hooks.test.tsx`                | 28    | useContentRect, useFocusable, useFocusManager, useStdout              |
| `layout-equivalence.test.tsx`   | 26    | Yoga vs Flexx layout engine parity                                    |
| `render.test.ts`                | 24    | Core render API                                                       |
| `memory.test.tsx`               | 20    | Memory leak detection, listener cleanup                               |
| `accessibility.test.tsx`        | 20    | Screen reader compatibility                                           |
| `react19.test.tsx`              | 18    | React 19 compatibility                                                |
| `exit.test.tsx`                 | 17    | Process exit timing and useApp                                        |
| `measureElement.test.tsx`       | 14    | Element measurement API                                               |
| `layout-engines.test.ts`        | 14    | Yoga and Flexx engine interoperability                                |
| `border-dim-color.test.tsx`     | 13    | Border styling and colors                                             |
| `integration.test.tsx`          | 13    | Component rendering integration                                       |
| `rerender-bugs.test.tsx`        | 13    | Re-render bug reproductions                                           |
| `performance.test.tsx`          | 12    | Rendering performance benchmarks                                      |
| `examples-bugs.test.tsx`        | 11    | Bug reproductions from examples                                       |
| `view-bugs.test.tsx`            | 11    | View component bug reproductions                                      |
| `examples-cursor.test.tsx`      | 9     | Cursor positioning tests                                              |
| `non-tty.test.tsx`              | 9     | Non-TTY output handling                                               |

## Using createRenderer

The `createRenderer` function provides an ink-testing-library compatible API for testing inkx components.

### Basic Usage

```tsx
import { createRenderer } from "inkx/testing"
import { Text } from "inkx"

const render = createRenderer()

test("renders text", () => {
  const { lastFrame } = render(<Text>Hello</Text>)
  expect(lastFrame()).toContain("Hello")
})
```

### Auto-Cleanup

Each `render()` call automatically unmounts the previous render, so you don't need explicit cleanup:

```tsx
const render = createRenderer()

test("first test", () => {
  const { lastFrame } = render(<Text>First</Text>)
  expect(lastFrame()).toContain("First")
})

test("second test", () => {
  // Previous render is auto-cleaned
  const { lastFrame } = render(<Text>Second</Text>)
  expect(lastFrame()).toContain("Second")
})
```

### Testing Keyboard Input

Use `stdin.write()` to simulate keyboard input:

```tsx
import { useState } from "react"
import { Box, Text, useInput } from "inkx"

function Counter() {
  const [count, setCount] = useState(0)

  useInput((input, key) => {
    if (input === "+" || key.upArrow) setCount((c) => c + 1)
    if (input === "-" || key.downArrow) setCount((c) => c - 1)
  })

  return <Text>Count: {count}</Text>
}

test("increments with arrow keys", () => {
  const render = createRenderer()
  const { lastFrame, stdin } = render(<Counter />)

  stdin.write("\x1b[A") // Up arrow
  stdin.write("\x1b[A") // Up arrow
  stdin.write("\x1b[B") // Down arrow

  expect(lastFrame()).toContain("Count: 1")
})
```

### Common Escape Sequences

| Key          | Sequence              |
| ------------ | --------------------- |
| Up Arrow     | `\x1b[A`              |
| Down Arrow   | `\x1b[B`              |
| Right Arrow  | `\x1b[C`              |
| Left Arrow   | `\x1b[D`              |
| Escape       | `\x1b`                |
| Return/Enter | `\r`                  |
| Tab          | `\t`                  |
| Backspace    | `\b`                  |
| Ctrl+C       | `\x03`                |
| Ctrl+D       | `\x04`                |
| Home         | `\x1b[H` or `\x1b[1~` |
| End          | `\x1b[F` or `\x1b[4~` |
| Page Up      | `\x1b[5~`             |
| Page Down    | `\x1b[6~`             |

### Testing Re-renders

Use `rerender()` to update props and verify state changes:

```tsx
function Greeter({ name }: { name: string }) {
  return <Text>Hello, {name}!</Text>
}

test("updates on prop change", () => {
  const render = createRenderer()
  const { lastFrame, rerender } = render(<Greeter name="Alice" />)

  expect(lastFrame()).toContain("Hello, Alice!")

  rerender(<Greeter name="Bob" />)
  expect(lastFrame()).toContain("Hello, Bob!")
})
```

### Custom Dimensions

Specify terminal dimensions per render:

```tsx
const render = createRenderer()

// Default is 80x24
const { lastFrame } = render(<WideComponent />, {
  cols: 120,
  rows: 40,
})
```

Or set defaults at renderer creation:

```tsx
const render = createRenderer({
  cols: 120,
  rows: 40,
})
```

### Frame Inspection

Access all rendered frames for detailed testing:

```tsx
const { frames, lastFrame, clear } = render(<MyComponent />)

// frames is an array of all rendered outputs
console.log(frames.length)

// lastFrame() returns the most recent frame
const current = lastFrame()

// clear() resets the frame history
clear()
```

## Test Utilities

### stripAnsi

Remove ANSI escape codes for easier assertions:

```tsx
import { stripAnsi } from "inkx/testing"

const { lastFrame } = render(<Text color="red">Hello</Text>)
const text = stripAnsi(lastFrame()!)
expect(text).toBe("Hello")
```

### normalizeFrame

Strip ANSI codes and normalize whitespace:

```tsx
import { normalizeFrame } from "inkx/testing"

const { lastFrame } = render(<MyComponent />)
const normalized = normalizeFrame(lastFrame()!)
// Strips ANSI, trims trailing whitespace, removes empty trailing lines
```

### waitFor

Wait for async conditions:

```tsx
import { waitFor } from "inkx/testing"

test("async update", async () => {
  const { lastFrame } = render(<AsyncComponent />)

  await waitFor(() => lastFrame()?.includes("Loaded"), {
    timeout: 1000,
    interval: 10,
  })

  expect(lastFrame()).toContain("Loaded")
})
```

## Test Patterns

### Testing Focus Management

```tsx
import { useFocusable } from "inkx"

function FocusableItem({ testID }: { testID: string }) {
  const { focused } = useFocusable()
  return (
    <Box testID={testID} focusable>
      <Text backgroundColor={focused ? "cyan" : undefined}>{testID}</Text>
    </Box>
  )
}

test("focus navigation", () => {
  const render = createRenderer()
  const { stdin, lastFrame } = render(
    <Box flexDirection="column">
      <FocusableItem testID="item1" />
      <FocusableItem testID="item2" />
    </Box>,
  )

  // Tab to move focus
  stdin.write("\t")
  // Verify focus moved (check for cyan background in ANSI output)
})
```

### Testing Layout Dimensions

```tsx
import { useContentRect, NodeContext } from "inkx"

function LayoutCapture({ onLayout }: { onLayout: (l: any) => void }) {
  const layout = useContentRect()
  React.useEffect(() => onLayout(layout), [layout])
  return <Text>Content</Text>
}

test("layout provides dimensions", () => {
  let capturedLayout = null
  const render = createRenderer()

  render(
    <Box width={40} height={10}>
      <LayoutCapture onLayout={(l) => (capturedLayout = l)} />
    </Box>,
  )

  expect(capturedLayout).toHaveProperty("width")
  expect(capturedLayout).toHaveProperty("height")
})
```

### Testing with RuntimeContext

The test renderer (`createRenderer`) automatically provides `RuntimeContext`. Components using `useApp()` or `useInput()` work out of the box:

```tsx
test("useApp exit function", () => {
  const render = createRenderer()
  const app = render(<ComponentThatCallsExit />)

  // press() triggers input through RuntimeContext
  await app.press("q")
  expect(app.exitCode).toBeDefined()
})
```

## Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test tests/unicode.test.ts

# Run tests matching pattern
bun test --pattern "CJK"

# Run with verbose output
bun test --verbose
```

## Test Organization Patterns

### Bug Reproduction Tests

Bug fixes include regression tests named after issue IDs:

```tsx
describe("Bug km-r0nz: Columns view vertical spacing", () => {
  it("items should have consistent vertical spacing", () => {
    // Reproduction of original bug
  })
})
```

### Compatibility Tests

Ink API compatibility is verified through:

```tsx
describe("Ink API Compatibility", () => {
  describe("Component Exports", () => {
    test("Box component exists and is a function", () => {
      expect(typeof Box).toBe("function")
    })
  })
})
```

### Performance Tests

Performance benchmarks use timing utilities:

```tsx
function benchmark(fn: () => void, iterations = 5) {
  const runs = []
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    fn()
    runs.push(performance.now() - start)
  }
  return {
    min: Math.min(...runs),
    avg: runs.reduce((a, b) => a + b) / runs.length,
  }
}

test("renders 200 components efficiently", () => {
  const stats = benchmark(() => render(<LargeList items={200} />))
  expect(stats.avg).toBeLessThan(100) // ms
})
```
