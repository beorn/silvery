# Testing

Silvery includes a comprehensive test suite with **870+ tests** covering everything from low-level buffer operations to high-level React component rendering. This guide documents the test structure and how to use `createRenderer` for testing your own Silvery applications.

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
| `hooks.test.tsx`                | 28    | useBoxRect, useFocusable, useFocusManager, useStdout                  |
| `layout-equivalence.test.tsx`   | 26    | Yoga vs Flexily layout engine parity                                  |
| `render.test.ts`                | 24    | Core render API                                                       |
| `memory.test.tsx`               | 20    | Memory leak detection, listener cleanup                               |
| `accessibility.test.tsx`        | 20    | Screen reader compatibility                                           |
| `react19.test.tsx`              | 18    | React 19 compatibility                                                |
| `exit.test.tsx`                 | 17    | Process exit timing and useApp                                        |
| `measureElement.test.tsx`       | 14    | Element measurement API                                               |
| `layout-engines.test.ts`        | 14    | Yoga and Flexily engine interoperability                              |
| `border-dim-color.test.tsx`     | 13    | Border styling and colors                                             |
| `integration.test.tsx`          | 13    | Component rendering integration                                       |
| `rerender-bugs.test.tsx`        | 13    | Re-render bug reproductions                                           |
| `performance.test.tsx`          | 12    | Rendering performance benchmarks                                      |
| `examples-bugs.test.tsx`        | 11    | Bug reproductions from examples                                       |
| `view-bugs.test.tsx`            | 11    | View component bug reproductions                                      |
| `examples-cursor.test.tsx`      | 9     | Cursor positioning tests                                              |
| `non-tty.test.tsx`              | 9     | Non-TTY output handling                                               |

## Strictness — one knob

Silvery ships with a single canonical truth-of-render gate: **`SILVERY_STRICT`**. Every runtime check (incremental ≡ fresh, degenerate-frame canary, future invariants) fires under this one env var. The contract:

```bash
SILVERY_STRICT=1                # tier 1 — all canonical checks
SILVERY_STRICT=2                # tier 2 — tier 1 + every-action invariants (slower)
SILVERY_STRICT=canary           # only the degenerate-frame canary (debugging isolate)
SILVERY_STRICT=residue,canary   # combine specific checks without a full tier
SILVERY_STRICT=1,!canary        # tier 1 minus the canary (per-test skip with `!` prefix)
```

**Design rule: no other `SILVERY_*` enable env vars.** Adding new checks doesn't add new env vars; they pick a slug + a tier and inherit. `bun run test:fast` (sets `SILVERY_STRICT=1` by default) gets every new check at zero developer-friction cost.

See the full debugging reference at [debugging.md](./debugging.md#silvery_strict--the-canonical-truth-of-render-gate).

## Using createRenderer

The `createRenderer` function creates a render function with auto-cleanup between tests. Each call returns an `App` instance with locators, keyboard input, and text inspection.

### Pin root width and height when testing full apps

`createRenderer({cols, rows})` passes dimensions as the _available_ size to layout — it does **not** set `root.style.width/height`. Without a width/height pin, full-app fixtures collapse to a one-row title-bar frame. Wrap the tree in `<Screen>` (production root) or `<Box width={cols} height={rows}>`:

```tsx
const TOTAL_COLS = 360,
  TOTAL_ROWS = 120
const render = createRenderer({ cols: TOTAL_COLS, rows: TOTAL_ROWS })
const app = render(
  <Box width={TOTAL_COLS} height={TOTAL_ROWS} flexDirection="row">
    {/* component under test */}
  </Box>,
)
```

The framework's degenerate-frame canary catches this misconfiguration when running under `SILVERY_STRICT`. It throws with a diagnostic pointing at this section. Per-test opt-out for legitimate empty-state tests: `SILVERY_STRICT=1,!canary`.

**Geometry tiering**: 360×120 (or close) for full-app helpers; 80×24 stays the default for narrow component fixtures. Width-sensitive bugs at 13 columns × ~110 rows of content only manifest at user-realistic geometries.

### Basic Usage

```tsx
import { createRenderer } from "@silvery/test"
import { Text } from "silvery"

const render = createRenderer()

test("renders text", () => {
  const app = render(<Text>Hello</Text>)
  expect(app.text).toContain("Hello")
})
```

### Auto-Cleanup

Each `render()` call automatically unmounts the previous render, so you don't need explicit cleanup:

```tsx
const render = createRenderer()

test("first test", () => {
  const app = render(<Text>First</Text>)
  expect(app.text).toContain("First")
})

test("second test", () => {
  // Previous render is auto-cleaned
  const app = render(<Text>Second</Text>)
  expect(app.text).toContain("Second")
})
```

### Testing Keyboard Input

Use `app.press()` to simulate keyboard input with named keys:

```tsx
import { useState } from "react"
import { Box, Text, useInput } from "silvery"

function Counter() {
  const [count, setCount] = useState(0)

  useInput((input, key) => {
    if (input === "+" || key.upArrow) setCount((c) => c + 1)
    if (input === "-" || key.downArrow) setCount((c) => c - 1)
  })

  return <Text>Count: {count}</Text>
}

test("increments with arrow keys", async () => {
  const render = createRenderer()
  const app = render(<Counter />)

  await app.press("ArrowUp")
  await app.press("ArrowUp")
  await app.press("ArrowDown")

  expect(app.text).toContain("Count: 1")
})
```

### Named Keys for press()

| Key          | Name         |
| ------------ | ------------ |
| Up Arrow     | `ArrowUp`    |
| Down Arrow   | `ArrowDown`  |
| Right Arrow  | `ArrowRight` |
| Left Arrow   | `ArrowLeft`  |
| Escape       | `Escape`     |
| Return/Enter | `Enter`      |
| Tab          | `Tab`        |
| Backspace    | `Backspace`  |
| Home         | `Home`       |
| End          | `End`        |
| Page Up      | `PageUp`     |
| Page Down    | `PageDown`   |

### Testing Re-renders

Use `app.rerender()` to update props and verify state changes:

```tsx
function Greeter({ name }: { name: string }) {
  return <Text>Hello, {name}!</Text>
}

test("updates on prop change", () => {
  const render = createRenderer()
  const app = render(<Greeter name="Alice" />)

  expect(app.text).toContain("Hello, Alice!")

  app.rerender(<Greeter name="Bob" />)
  expect(app.text).toContain("Hello, Bob!")
})
```

### Custom Dimensions

Specify terminal dimensions at renderer creation:

```tsx
const render = createRenderer({
  cols: 120,
  rows: 40,
})

const app = render(<WideComponent />)
expect(app.text).toContain("wide content")
```

### Frame Inspection

The App instance provides direct access to rendered output:

```tsx
const app = render(<MyComponent />)

// Plain text (no ANSI codes)
const text = app.text

// Text with ANSI styling
const ansi = app.ansi

// All rendered frames (for history inspection)
console.log(app.frames.length)

// Clear the frame history
app.clear()
```

## Test Utilities

### stripAnsi

Remove ANSI escape codes for easier assertions:

```tsx
import { stripAnsi } from "@silvery/test"

const app = render(<Text color="red">Hello</Text>)
// app.text already strips ANSI, but stripAnsi is useful for app.ansi
const text = stripAnsi(app.ansi)
expect(text).toBe("Hello")
```

### normalizeFrame

Strip ANSI codes and normalize whitespace:

```tsx
import { normalizeFrame } from "@silvery/test"

const app = render(<MyComponent />)
const normalized = normalizeFrame(app.ansi)
// Strips ANSI, trims trailing whitespace, removes empty trailing lines
```

### waitFor

Wait for async conditions:

```tsx
import { waitFor } from "@silvery/test"

test("async update", async () => {
  const app = render(<AsyncComponent />)

  await waitFor(() => app.text.includes("Loaded"), {
    timeout: 1000,
    interval: 10,
  })

  expect(app.text).toContain("Loaded")
})
```

## Test Patterns

### Testing Focus Management

```tsx
import { useFocusable } from "silvery"

function FocusableItem({ testID }: { testID: string }) {
  const { focused } = useFocusable()
  return (
    <Box testID={testID} focusable>
      <Text backgroundColor={focused ? "cyan" : undefined}>{testID}</Text>
    </Box>
  )
}

test("focus navigation", async () => {
  const render = createRenderer()
  const app = render(
    <Box flexDirection="column">
      <FocusableItem testID="item1" />
      <FocusableItem testID="item2" />
    </Box>,
  )

  // Tab to move focus
  await app.press("Tab")
  // Verify focus moved using locator
  expect(app.getByTestId("item2").textContent()).toBe("item2")
})
```

### Testing Layout Dimensions

```tsx
import { useBoxRect, NodeContext } from "silvery"

function LayoutCapture({ onLayout }: { onLayout: (l: any) => void }) {
  const layout = useBoxRect()
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
test("useApp exit function", async () => {
  const render = createRenderer()
  const app = render(<ComponentThatCallsExit />)

  // press() triggers input through RuntimeContext
  await app.press("q")
  expect(app.exitCalled()).toBe(true)
})
```

## ANSI-Level Testing with Termless

For tests that need to verify actual ANSI output, colors, cursor positioning, or scrollback behavior, use `createTermless()` which runs a real terminal emulator in-process. For more on headless terminal testing, see [termless.dev](https://termless.dev). For STRICT mode verification across terminal backends, see [Terminal Support Strategy](/design/terminal-support-strategy).

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
describe("Bug #142: Columns view vertical spacing", () => {
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
