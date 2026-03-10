---
title: Testing — Headless Renderer & Playwright-Style Locators
description: Test Silvery TUI applications with the headless renderer, Playwright-style locators, press() simulation, and snapshot testing.
prev:
  text: AI Chat
  link: /examples/ai-chat
next: false
---

# Testing

Silvery ships with a Playwright-style testing API that lets you write fast, deterministic tests without a real terminal. The headless renderer captures everything your app would display, and locator methods let you query the output just like you'd query a web page.

## Quick Start

```tsx
import { createRenderer } from "@silvery/test"
import { expect, test } from "vitest"

const render = createRenderer({ cols: 80, rows: 24 })

test("counter increments on key press", async () => {
  const app = render(<Counter />)

  expect(app.text).toContain("Count: 0")

  await app.press("j")
  expect(app.text).toContain("Count: 1")

  await app.press("k")
  expect(app.text).toContain("Count: 0")
})
```

## Key Benefits

- **No real terminal needed** — Tests run headlessly, no TTY setup, no flakiness from terminal state
- **Playwright-style API** — `press()`, `getByText()`, `getByTestId()`, `locator()` — familiar patterns from web testing
- **Deterministic** — No timing issues, no animation waits. Each `press()` processes the full React update cycle
- **Snapshot testing** — Capture the rendered buffer for visual regression testing
- **Fast** — Tests run in milliseconds, not seconds

## The Testing API

### `createRenderer(options)`

Creates a virtual terminal and renderer:

```tsx
const render = createRenderer({
  cols: 80,    // Terminal width
  rows: 24,    // Terminal height
})

const app = render(<MyApp />)
```

### `app.text`

The full text content of the rendered output:

```tsx
expect(app.text).toContain("Hello, world!")
expect(app.text).not.toContain("Error")
```

### `app.press(key)`

Simulate keyboard input. Supports single keys, modifiers, and special keys:

```tsx
await app.press("j")          // Single character
await app.press("Enter")      // Special key
await app.press("Ctrl+K")     // Modifier + key
await app.press("ArrowDown")  // Arrow key
await app.press("Escape")     // Escape
```

### `app.getByText(text)`

Find elements containing specific text:

```tsx
const heading = app.getByText("Dashboard")
expect(heading).toExist()
```

### `app.getByTestId(id)`

Find elements by `testID` prop:

```tsx
// In your component:
<Box testID="status-bar">
  <Text>Ready</Text>
</Box>

// In your test:
const statusBar = app.getByTestId("status-bar")
expect(statusBar.text).toBe("Ready")
```

### `app.locator(selector)`

CSS-like locator for complex queries:

```tsx
const items = app.locator("[testID=list-item]")
expect(items.count()).toBe(5)
```

## Testing Patterns

### Testing Keyboard Navigation

```tsx
test("list navigates with arrow keys", async () => {
  const app = render(<TaskList items={tasks} />)

  // First item selected by default
  expect(app.text).toContain("> Task 1")

  // Navigate down
  await app.press("ArrowDown")
  expect(app.text).toContain("> Task 2")

  // Navigate to end
  await app.press("End")
  expect(app.text).toContain("> Task 5")
})
```

### Testing Text Input

```tsx
test("search filters results", async () => {
  const app = render(<SearchableList items={allItems} />)

  // Type a search query
  await app.press("r")
  await app.press("e")
  await app.press("a")
  await app.press("c")
  await app.press("t")

  expect(app.text).toContain("React")
  expect(app.text).not.toContain("Vue")
})
```

### Testing Multi-Step Wizards

```tsx
test("wizard completes all steps", async () => {
  const app = render(<Wizard />)

  // Step 1: Select framework
  expect(app.text).toContain("Choose a framework")
  await app.press("ArrowDown")  // Select React
  await app.press("Enter")

  // Step 2: Enter name
  expect(app.text).toContain("Project name")
  await app.press("m")
  await app.press("y")
  await app.press("-")
  await app.press("a")
  await app.press("p")
  await app.press("p")
  await app.press("Enter")

  // Step 3: Done
  expect(app.text).toContain("Done!")
  expect(app.text).toContain("my-app")
})
```

### Snapshot Testing

Capture the full rendered buffer for regression testing:

```tsx
test("dashboard layout matches snapshot", async () => {
  const app = render(<Dashboard />)
  expect(app.text).toMatchSnapshot()
})
```

### Testing Scrolling

```tsx
test("scroll follows selection", async () => {
  const app = render(<List items={hundredItems} />)

  // Scroll past the visible area
  for (let i = 0; i < 30; i++) {
    await app.press("ArrowDown")
  }

  // Item 30 should be visible
  expect(app.text).toContain("Item 30")
  // Item 1 should have scrolled out of view
  expect(app.text).not.toContain("Item 1")
})
```

## Features Used

| Feature | Usage |
| --- | --- |
| `createRenderer()` | Virtual terminal for headless testing |
| `app.text` | Full rendered text content |
| `app.press()` | Keyboard input simulation |
| `app.getByText()` | Find elements by text content |
| `app.getByTestId()` | Find elements by testID prop |
| `app.locator()` | CSS-like element queries |
| Snapshot testing | Visual regression via `toMatchSnapshot()` |

## Best Practices

1. **Test behavior, not implementation** — Assert on what the user sees (`app.text`), not internal state
2. **Use `testID` for stability** — Text content can change; `testID` props are stable identifiers
3. **One assertion per press** — Verify the state after each key press for clear failure messages
4. **Test at the right layer** — Use `createRenderer` for component integration tests, unit tests for pure logic

## Exercises

1. **Write tests for a todo list** — Test add, toggle, delete, and filter operations
2. **Write tests for a form wizard** — Test all steps including validation errors
3. **Add snapshot tests** — Capture and verify the visual output of a dashboard
4. **Test scrolling behavior** — Verify overflow indicators and scroll-to-selection
